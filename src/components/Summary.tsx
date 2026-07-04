import type { DashboardData } from '../types';
import {
  formatTimestamp,
  formatTimeUntil,
  isFlipPending,
  latestSoftware,
  majorOf,
} from '../lib/format';

export function Summary({ data }: { data: DashboardData }) {
  const { votesByVersion, requiredVotes, latestProtocolVersion } = data;

  const latestSw = latestSoftware(data.nodes);
  const latestMajor = latestSw ? majorOf(latestSw) : 0;
  const softwareUpgraded = data.nodes.filter(
    (n) => n.driveVersion && majorOf(n.driveVersion) >= latestMajor,
  ).length;
  const votedLatest = votesByVersion.get(latestProtocolVersion) ?? 0;
  const flipPending = data.nodes.filter((n) =>
    isFlipPending(n, latestMajor, latestProtocolVersion),
  ).length;

  const upgradeInProgress = latestProtocolVersion > data.epoch.protocolVersion;
  const thresholdReached = votedLatest >= requiredVotes;
  const lockedIn = data.nextEpochProtocolVersion > data.epoch.protocolVersion;
  const progress = Math.min(1, votedLatest / Math.max(1, requiredVotes));

  return (
    <section className="summary">
      <div className="cards">
        <Card label="Active evonodes" value={data.activeEvonodes} sub={`${data.nodes.length} known`} />
        <Card
          label={`Running v${latestMajor} software`}
          value={softwareUpgraded}
          sub={latestSw ? `latest ${latestSw}` : undefined}
          tone="good"
        />
        {upgradeInProgress ? (
          <>
            <Card
              label={`Voted PV${latestProtocolVersion} on-chain`}
              value={votedLatest}
              sub={`of ${requiredVotes} required`}
              tone={votedLatest >= requiredVotes ? 'good' : 'neutral'}
            />
            <Card
              label="Upgraded, awaiting proposal"
              value={flipPending}
              sub="will flip on next proposed block"
              tone={flipPending > 0 ? 'warn' : 'good'}
            />
          </>
        ) : (
          <>
            <Card
              label={`Signaled PV${latestProtocolVersion} this epoch`}
              value={votedLatest}
              sub="current version — no upgrade in progress"
              tone="good"
            />
            <Card
              label="Not proposed this epoch yet"
              value={Math.max(0, data.activeEvonodes - votedLatest)}
              sub="signal on their next proposed block"
            />
          </>
        )}
      </div>

      {upgradeInProgress && (
        <div className="progress-wrap">
          <div className="progress-labels">
            <span>
              {lockedIn ? 'Re-signaling' : 'Upgrade to'} protocol version {latestProtocolVersion}{' '}
              — {votedLatest}/{requiredVotes} votes this epoch (67% of active evonodes
              {thresholdReached ? ', threshold reached' : ''})
            </span>
            <span>{Math.round(progress * 100)}%</span>
          </div>
          <div className="progress">
            <div
              className={`progress-bar ${thresholdReached || lockedIn ? 'good' : ''}`}
              style={{ width: `${progress * 100}%` }}
            />
          </div>
          {lockedIn ? (
            <div className="activation">
              PV{data.nextEpochProtocolVersion} is locked in on-chain (next epoch protocol
              version) — it activates at the epoch boundary ({formatTimeUntil(data.epochEndsAtMs)}
              , {formatTimestamp(data.epochEndsAtMs)}) regardless of this epoch&rsquo;s tally.
            </div>
          ) : (
            thresholdReached && (
              <div className="activation">
                Threshold reached — if the tally holds, the version locks in at the next epoch
                boundary ({formatTimeUntil(data.epochEndsAtMs)},{' '}
                {formatTimestamp(data.epochEndsAtMs)}) and activates one epoch later.
              </div>
            )
          )}
        </div>
      )}

      <div className="meta-line">
        <span>
          Current protocol version: <strong>PV{data.epoch.protocolVersion}</strong>
        </span>
        <span title="next_epoch_protocol_version from the chain — the on-chain lock-in signal">
          Next epoch: <strong>PV{data.nextEpochProtocolVersion}</strong>
        </span>
        <span>
          Epoch <strong>{data.epoch.index}</strong>
        </span>
        <span title="The epoch flips on the first block proposed after this time">
          Epoch ends <strong>{formatTimeUntil(data.epochEndsAtMs)}</strong> (
          {formatTimestamp(data.epochEndsAtMs)})
        </span>
        <span>
          Height <strong>{data.quorums.metadata.height.toString()}</strong>
        </span>
        <span>
          Avg block time <strong>{(data.avgBlockTimeMs / 1000).toFixed(1)}s</strong>
        </span>
        <span title="Votes are recorded when a node proposes a block and are tallied at the epoch boundary">
          ⓘ votes reset each epoch
        </span>
      </div>
    </section>
  );
}

function Card({
  label,
  value,
  sub,
  tone = 'neutral',
}: {
  label: string;
  value: number | string;
  sub?: string;
  tone?: 'neutral' | 'good' | 'warn';
}) {
  return (
    <div className={`card ${tone}`}>
      <div className="card-value">{value}</div>
      <div className="card-label">{label}</div>
      {sub && <div className="card-sub">{sub}</div>}
    </div>
  );
}
