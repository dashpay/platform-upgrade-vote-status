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

export interface DashboardData {
  network: Network;
  fetchedAt: number;
  upgradeState: UpgradeState;
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
