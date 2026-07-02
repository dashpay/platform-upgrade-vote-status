// Proved queries via @dashevo/evo-sdk (WASM proof verification) plus the
// masternode-list REST endpoint used by the SDK's trusted context provider.

import { EvoSDK } from '@dashevo/evo-sdk';
import type { EpochInfo, MasternodeEntry, Network, UpgradeState } from '../types';

const instances: Partial<Record<Network, Promise<EvoSDK>>> = {};

export function getSdk(network: Network): Promise<EvoSDK> {
  if (!instances[network]) {
    instances[network] = (async () => {
      const sdk = network === 'mainnet' ? EvoSDK.mainnetTrusted() : EvoSDK.testnetTrusted();
      await sdk.connect();
      return sdk;
    })();
  }
  return instances[network]!;
}

export async function fetchUpgradeState(network: Network): Promise<UpgradeState> {
  const sdk = await getSdk(network);
  const s = await sdk.protocol.versionUpgradeState();
  return {
    currentProtocolVersion: s.currentProtocolVersion,
    nextProtocolVersion: s.nextProtocolVersion ?? null,
    // The wasm binding mislabels the versions-counter value as "activationHeight";
    // it is actually the vote count for the next version (ProtocolVersionVoteCount).
    nextVersionVotes: s.activationHeight != null ? BigInt(s.activationHeight) : null,
  };
}

/** Enumerate every masternode protocol-version vote (paginated, deduped). */
export async function fetchAllVotes(network: Network): Promise<Map<string, number>> {
  const sdk = await getSdk(network);
  const votes = new Map<string, number>();
  const pageSize = 100;
  let start: string | undefined;
  for (let page = 0; page < 100; page++) {
    const batch = await sdk.protocol.versionUpgradeVoteStatus(start, pageSize);
    let added = 0;
    let last: string | undefined;
    for (const [proTxHash, status] of batch.entries()) {
      last = proTxHash;
      if (!votes.has(proTxHash)) {
        votes.set(proTxHash, status.version);
        added++;
      }
    }
    if (batch.size < pageSize || added === 0 || !last) break;
    start = last;
  }
  return votes;
}

export async function fetchEpochInfo(network: Network): Promise<EpochInfo> {
  const sdk = await getSdk(network);
  const e = await sdk.epoch.current();
  return {
    index: e.index,
    firstBlockHeight: BigInt(e.firstBlockHeight),
    firstBlockTime: BigInt(e.firstBlockTime),
    protocolVersion: e.protocolVersion,
  };
}

/** Evonode list with software versions from the trusted-context endpoint. */
export async function fetchMasternodes(network: Network): Promise<MasternodeEntry[]> {
  const res = await fetch(`https://quorums.${network}.networks.dash.org/masternodes`, {
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`masternodes endpoint: HTTP ${res.status}`);
  const json = (await res.json()) as { success: boolean; data: MasternodeEntry[] };
  if (!json.success || !Array.isArray(json.data)) {
    throw new Error('masternodes endpoint: unexpected payload');
  }
  return json.data;
}
