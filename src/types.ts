export type Network = 'mainnet' | 'testnet';

/** One evonode from the quorums.<net>.networks.dash.org/masternodes endpoint. */
export interface MasternodeEntry {
  proTxHash: string; // Core-style (reversed) hex, as displayed everywhere
  address: string;
  status: string; // ENABLED | POSE_BANNED | ...
  versionCheck?: string;
  dapiVersion?: string;
  driveVersion?: string;
}

export interface ValidatorMember {
  proTxHashBytes: Uint8Array; // raw internal byte order (sort key for proposer order)
  proTxHash: string; // Core-style display hex
  nodeIp: string;
  isBanned: boolean;
}

export interface ValidatorSet {
  quorumHashHex: string; // hex of raw bytes as returned by DAPI
  coreHeight: number;
  members: ValidatorMember[]; // sorted by raw proTxHash bytes ascending
}

export interface CurrentQuorumsInfo {
  quorumHashes: string[]; // ordered as platform state orders them (rotation order)
  currentQuorumHash: string;
  validatorSets: ValidatorSet[];
  lastBlockProposer: string; // Core-style display hex
  lastBlockProposerBytes: Uint8Array;
  metadata: {
    height: bigint;
    timeMs: bigint;
    epoch: number;
    protocolVersion: number;
    chainId: string;
  };
}

export interface UpgradeState {
  currentProtocolVersion: number;
  nextProtocolVersion: number | null;
  /** Chain-side tally of votes for nextProtocolVersion (from the versions counter). */
  nextVersionVotes: bigint | null;
}

export interface EpochInfo {
  index: number;
  firstBlockHeight: bigint;
  firstBlockTime: bigint; // ms
  protocolVersion: number;
}

export interface ProposalEta {
  blocks: number; // estimated blocks until this node proposes
  etaMs: number; // estimated wall-clock ms from now
  quorumHash: string; // quorum in which the slot occurs
}

/** One row of the dashboard table (union of all data sources, keyed by display proTxHash). */
export interface NodeRow {
  proTxHash: string;
  address?: string;
  status?: string;
  dapiVersion?: string;
  driveVersion?: string;
  votedVersion?: number;
  inActiveQuorum: boolean;
  eta?: ProposalEta;
}

/** Latest dashpay/platform GitHub release and the protocol version it ships. */
export interface ReleaseInfo {
  tag: string;
  name: string;
  url: string;
  publishedAt: number; // ms
  targetProtocolVersion: number;
}

export type UpgradePhase =
  | 'active' // the release's protocol version is already live on-chain
  | 'locked-in' // chain has scheduled it as next_epoch_protocol_version; activates at the epoch boundary
  | 'voting'; // votes still accumulating toward the threshold

/**
 * Lightweight status model — answers "is the release's protocol version locked in?"
 * using only cheap calls (GitHub release + upgrade state + epoch + masternode count),
 * without paginating per-node votes or fetching quorum info.
 */
export interface StatusData {
  network: Network;
  fetchedAt: number;
  release: ReleaseInfo | null; // null when GitHub is unreachable (fall back to chain data)
  phase: UpgradePhase;
  currentProtocolVersion: number;
  /** Chain-scheduled version for the next epoch (getStatus drive.nextEpoch) — the lock-in signal. */
  nextEpochProtocolVersion: number;
  targetProtocolVersion: number;
  votesForTarget: number; // chain-side tally (0 when the chain's "next" differs from target)
  requiredVotes: number;
  activeEvonodes: number;
  epochIndex: number;
  epochEndsAtMs: number;
}

export interface DashboardData {
  network: Network;
  fetchedAt: number;
  upgradeState: UpgradeState;
  /** Chain-scheduled version for the next epoch (getStatus drive.nextEpoch) — the lock-in signal. */
  nextEpochProtocolVersion: number;
  epoch: EpochInfo;
  quorums: CurrentQuorumsInfo;
  nodes: NodeRow[];
  votesByVersion: Map<number, number>;
  softwareByVersion: Map<string, number>;
  activeEvonodes: number; // ENABLED count — denominator for the threshold
  requiredVotes: number; // 1 + activeEvonodes * 67 / 100 (integer division)
  latestProtocolVersion: number; // the version being upgraded to (max seen)
  avgBlockTimeMs: number;
  epochEndsAtMs: number; // epoch start + network epoch duration (boundary is the first block after this)
}
