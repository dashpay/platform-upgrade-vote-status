import type { DashboardData } from '../types';
import { isFlipPending, latestSoftware, majorOf } from '../lib/format';

export function Summary({ data }: { data: DashboardData }) {
  const { upgradeState, votesByVersion, requiredVotes, latestProtocolVersion } = data;

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
              Upgrade to protocol version {latestProtocolVersion} — {votedLatest}/{requiredVotes}{' '}
              votes (67% of active evonodes{thresholdReached ? ', threshold reached' : ''})
            </span>
            <span>{Math.round(progress * 100)}%</span>
          </div>
          <div className="progress">
            <div
              className={`progress-bar ${thresholdReached ? 'good' : ''}`}
              style={{ width: `${progress * 100}%` }}
            />
          </div>
          {thresholdReached && (
            <div className="activation">
              Threshold reached — the upgrade activates at the next epoch boundary.
            </div>
          )}
        </div>
      )}

      <div className="meta-line">
        <span>
          Current protocol version: <strong>PV{data.epoch.protocolVersion}</strong>
        </span>
        {upgradeState.nextProtocolVersion != null && (
          <span>
            Next: <strong>PV{upgradeState.nextProtocolVersion}</strong>
          </span>
        )}
        <span>
          Epoch <strong>{data.epoch.index}</strong>
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
