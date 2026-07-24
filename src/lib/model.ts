// Assembles the dashboard model from the three data sources.

import { fetchCurrentQuorumsInfo, fetchDriveStatus } from './grpcweb';
import { fetchAllVotes, fetchEpochInfo, fetchMasternodes, fetchUpgradeState } from './sdk';
import { fetchLatestRelease } from './github';
import { buildProposalSchedule } from './schedule';
import type { DashboardData, Network, NodeRow, StatusData, UpgradePhase } from '../types';

// drive-abci epoch_time_length_s: 788400s (9.125 d) default; testnet runs 1-hour epochs.
const EPOCH_DURATION_MS: Record<Network, number> = {
  mainnet: 788_400_000,
  testnet: 3_600_000,
};

const reverseHex = (h: string): string => {
  let out = '';
  for (let i = h.length - 2; i >= 0; i -= 2) out += h.slice(i, i + 2);
  return out;
};

/**
 * Different layers disagree on hash display order (Core-style reversed vs raw).
 * Given a set of canonical keys, re-key `map` by whichever orientation matches better.
 */
function alignKeys<V>(map: Map<string, V>, canonical: Set<string>): Map<string, V> {
  let straight = 0;
  let reversed = 0;
  for (const key of map.keys()) {
    if (canonical.has(key)) straight++;
    if (canonical.has(reverseHex(key))) reversed++;
  }
  if (reversed <= straight) return map;
  return new Map(Array.from(map.entries(), ([k, v]) => [reverseHex(k), v]));
}

// drive-abci: required = 1 + active_hpmns * protocol_version_upgrade_percentage_needed / 100
const requiredVotesFor = (activeEvonodes: number): number =>
  1 + Math.floor((activeEvonodes * 67) / 100);

/**
 * Cheap status check: GitHub latest release plus three light queries.
 * Skips the paginated per-node vote enumeration and quorum info entirely.
 */
export async function loadStatusData(network: Network): Promise<StatusData> {
  const masternodesPromise = fetchMasternodes(network);
  const [release, upgradeState, epoch, masternodes, driveStatus] = await Promise.all([
    fetchLatestRelease(network).catch((e) => {
      console.warn('GitHub release lookup failed, falling back to chain data', e);
      return null;
    }),
    fetchUpgradeState(network),
    fetchEpochInfo(network),
    masternodesPromise,
    masternodesPromise.then((mns) => fetchDriveStatus(network, mns)),
  ]);

  const target =
    release?.targetProtocolVersion ??
    Math.max(driveStatus.nextEpoch, upgradeState.nextProtocolVersion ?? 0, driveStatus.current);

  const activeEvonodes = masternodes.filter((m) => m.status === 'ENABLED').length;
  const requiredVotes = requiredVotesFor(activeEvonodes);

  const votesForTarget =
    upgradeState.nextProtocolVersion === target && upgradeState.nextVersionVotes != null
      ? Number(upgradeState.nextVersionVotes)
      : 0;

  // Lock-in is decided at the epoch boundary: drive tallies the previous
  // epoch's votes and, if the threshold was met, schedules the version as
  // next_epoch_protocol_version. The current epoch's running tally is only a
  // preview of the next boundary decision.
  let phase: UpgradePhase = 'voting';
  if (driveStatus.current >= target) {
    phase = 'active';
  } else if (driveStatus.nextEpoch >= target) {
    phase = 'locked-in';
  }

  return {
    network,
    fetchedAt: Date.now(),
    release,
    phase,
    currentProtocolVersion: driveStatus.current,
    nextEpochProtocolVersion: driveStatus.nextEpoch,
    targetProtocolVersion: target,
    votesForTarget,
    requiredVotes,
    activeEvonodes,
    epochIndex: epoch.index,
    epochEndsAtMs: Number(epoch.firstBlockTime) + EPOCH_DURATION_MS[network],
  };
}

export async function loadDashboardData(network: Network): Promise<DashboardData> {
  const masternodesPromise = fetchMasternodes(network);
  const [masternodes, votesRaw, upgradeState, epoch, quorums, driveStatus] = await Promise.all([
    masternodesPromise,
    fetchAllVotes(network),
    fetchUpgradeState(network),
    fetchEpochInfo(network),
    masternodesPromise.then((mns) => fetchCurrentQuorumsInfo(network, mns)),
    masternodesPromise.then((mns) => fetchDriveStatus(network, mns)),
  ]);

  const canonical = new Set(masternodes.map((m) => m.proTxHash.toLowerCase()));
  const votes = alignKeys(
    new Map(Array.from(votesRaw.entries(), ([k, v]) => [k.toLowerCase(), v])),
    canonical,
  );

  // Average block time over the current epoch.
  const blocksInEpoch = Number(quorums.metadata.height - epoch.firstBlockHeight);
  const msInEpoch = Number(quorums.metadata.timeMs - epoch.firstBlockTime);
  const avgBlockTimeMs = blocksInEpoch > 10 ? msInEpoch / blocksInEpoch : 6500;

  const schedule = alignKeys(buildProposalSchedule(quorums, avgBlockTimeMs), canonical);

  const activeMembers = new Set<string>();
  for (const vs of quorums.validatorSets) {
    for (const m of vs.members) {
      const display = m.proTxHash.toLowerCase();
      activeMembers.add(canonical.has(display) ? display : reverseHex(display));
    }
  }

  const rows = new Map<string, NodeRow>();
  for (const m of masternodes) {
    const key = m.proTxHash.toLowerCase();
    rows.set(key, {
      proTxHash: key,
      address: m.address,
      status: m.status,
      dapiVersion: m.dapiVersion,
      driveVersion: m.driveVersion,
      votedVersion: votes.get(key),
      inActiveQuorum: activeMembers.has(key),
      eta: schedule.get(key),
    });
  }
  // Voters not present in the endpoint list (e.g. recently removed nodes).
  for (const [key, version] of votes) {
    if (!rows.has(key)) {
      rows.set(key, {
        proTxHash: key,
        votedVersion: version,
        inActiveQuorum: activeMembers.has(key),
        eta: schedule.get(key),
      });
    }
  }

  const votesByVersion = new Map<number, number>();
  for (const v of votes.values()) {
    votesByVersion.set(v, (votesByVersion.get(v) ?? 0) + 1);
  }

  const softwareByVersion = new Map<string, number>();
  for (const m of masternodes) {
    const key = m.driveVersion ?? 'unknown';
    softwareByVersion.set(key, (softwareByVersion.get(key) ?? 0) + 1);
  }

  const activeEvonodes = masternodes.filter((m) => m.status === 'ENABLED').length;
  const requiredVotes = requiredVotesFor(activeEvonodes);

  const latestProtocolVersion = Math.max(
    upgradeState.currentProtocolVersion,
    upgradeState.nextProtocolVersion ?? 0,
    epoch.protocolVersion,
    ...votesByVersion.keys(),
  );

  return {
    network,
    fetchedAt: Date.now(),
    upgradeState,
    nextEpochProtocolVersion: driveStatus.nextEpoch,
    epoch,
    quorums,
    nodes: Array.from(rows.values()),
    votesByVersion,
    softwareByVersion,
    activeEvonodes,
    requiredVotes,
    latestProtocolVersion,
    avgBlockTimeMs,
    epochEndsAtMs: Number(epoch.firstBlockTime) + EPOCH_DURATION_MS[network],
  };
}
