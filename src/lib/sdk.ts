// Proved queries via @dashevo/evo-sdk (WASM proof verification) plus the
// masternode-list REST endpoint used by the SDK's trusted context provider.

import { EvoSDK } from '@dashevo/evo-sdk';
import { describeError } from './errors';
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

/**
 * Failures an existing SDK instance can never recover from, because the state
 * that broke is fixed at construction time:
 *
 * - The DAPI client bans an address when a request to it fails, and only
 *   unbans one when it *successfully responds*. If every address ends up
 *   banned — which is what a network-wide outage does — no request can
 *   succeed, so nothing can ever be unbanned, and the instance stays dead long
 *   after the network comes back.
 * - Trusted mode prefetches the quorum set during connect(). Once the chain
 *   rotates to a quorum that predates the prefetch, proof verification fails
 *   against a cache that is never refilled.
 *
 * `connect()` is idempotent, so neither can be reset in place — the instance
 * has to be rebuilt.
 */
const isPoisoned = (message: string): boolean =>
  /no available addresses/i.test(message) || /quorum not found in cache/i.test(message);

/**
 * Run a query, discarding the cached SDK if it fails in a way that instance
 * cannot come back from. The next call then builds a fresh one, so recovery
 * costs at most one refresh interval rather than needing a page reload.
 */
async function withSdk<T>(network: Network, fn: (sdk: EvoSDK) => Promise<T>): Promise<T> {
  const pending = getSdk(network);
  try {
    return await fn(await pending);
  } catch (e) {
    // Identity check: concurrent callers failing together must not evict a
    // replacement instance that has already been built.
    if (isPoisoned(describeError(e)) && instances[network] === pending) {
      delete instances[network];
    }
    throw e;
  }
}

export async function fetchUpgradeState(network: Network): Promise<UpgradeState> {
  // Needs evo-sdk >= 5.0.0. Earlier bindings picked the first version above the
  // SDK's own built-in protocol version, not the chain's, so once the chain
  // passed that version they reported the current version (which every node
  // signals) as "next" and the real candidate's tally was lost.
  const s = await withSdk(network, (sdk) => sdk.protocol.versionUpgradeState());
  return {
    currentProtocolVersion: s.currentProtocolVersion,
    nextProtocolVersion: s.nextProtocolVersion ?? null,
    nextVersionVotes: s.voteCount != null ? BigInt(s.voteCount) : null,
  };
}

/** Enumerate every masternode protocol-version vote (paginated, deduped). */
export async function fetchAllVotes(network: Network): Promise<Map<string, number>> {
  return withSdk(network, async (sdk) => {
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
  });
}

export async function fetchEpochInfo(network: Network): Promise<EpochInfo> {
  const e = await withSdk(network, (sdk) => sdk.epoch.current());
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
