// Assembles the dashboard model from the three data sources.

import { fetchCurrentQuorumsInfo } from './grpcweb';
import { fetchAllVotes, fetchEpochInfo, fetchMasternodes, fetchUpgradeState } from './sdk';
import { buildProposalSchedule } from './schedule';
import type { DashboardData, Network, NodeRow } from '../types';

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

export async function loadDashboardData(network: Network): Promise<DashboardData> {
  const masternodesPromise = fetchMasternodes(network);
  const [masternodes, votesRaw, upgradeState, epoch, quorums] = await Promise.all([
    masternodesPromise,
    fetchAllVotes(network),
    fetchUpgradeState(network),
    fetchEpochInfo(network),
    masternodesPromise.then((mns) => fetchCurrentQuorumsInfo(network, mns)),
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
  // drive-abci: required = 1 + active_hpmns * protocol_version_upgrade_percentage_needed / 100
  const requiredVotes = 1 + Math.floor((activeEvonodes * 67) / 100);

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
    epoch,
    quorums,
    nodes: Array.from(rows.values()),
    votesByVersion,
    softwareByVersion,
    activeEvonodes,
    requiredVotes,
    latestProtocolVersion,
    avgBlockTimeMs,
  };
}
