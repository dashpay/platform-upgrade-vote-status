import { useEffect, useState } from 'react';
import type { StatusData } from '../types';
import { formatTimestamp, formatTimeUntil } from '../lib/format';
import { Fanfare } from './Fanfare';

const celebratedKey = (network: string) => `lockin-celebrated-${network}`;

export function StatusView({
  data,
  onShowDetails,
}: {
  data: StatusData;
  onShowDetails: () => void;
}) {
  const { release, phase, targetProtocolVersion: target } = data;
  const [celebrate, setCelebrate] = useState(false);

  // Fanfare only the first time this client sees this version locked in.
  useEffect(() => {
    if (phase !== 'locked-in') return;
    const key = celebratedKey(data.network);
    let seen = 0;
    try {
      seen = Number(localStorage.getItem(key) ?? 0);
    } catch {
      // storage unavailable — celebrate anyway
    }
    if (seen >= target) return;
    setCelebrate(true);
    try {
      localStorage.setItem(key, String(target));
    } catch {
      // best-effort
    }
  }, [phase, target, data.network]);

  const progress = Math.min(1, data.votesForTarget / Math.max(1, data.requiredVotes));
  const thresholdReached = data.votesForTarget >= data.requiredVotes;

  return (
    <section className="status-view">
      {celebrate && <Fanfare />}

      <div className="release-line">
        {release ? (
          <>
            Latest release:{' '}
            <a href={release.url} target="_blank" rel="noreferrer">
              <strong>{release.name}</strong>
            </a>{' '}
            <span className="muted">
              (published {formatTimestamp(release.publishedAt)}) — ships protocol version{' '}
              <strong>PV{release.targetProtocolVersion}</strong>
            </span>
          </>
        ) : (
          <span className="muted">
            GitHub unreachable — using the chain&rsquo;s reported next version (PV{target})
          </span>
        )}
      </div>

      {phase === 'locked-in' && (
        <div className="status-hero locked-in">
          <div className="hero-emoji">🎉</div>
          <h2>Protocol version {target} locked in!</h2>
          <p>
            The chain has scheduled PV{target} as the next epoch&rsquo;s protocol version — it
            activates when epoch {data.epochIndex + 1} begins, {formatTimeUntil(data.epochEndsAtMs)}{' '}
            ({formatTimestamp(data.epochEndsAtMs)}). Nothing more is needed.
          </p>
        </div>
      )}

      {phase === 'active' && (
        <div className="status-hero active">
          <div className="hero-emoji">✅</div>
          <h2>Protocol version {target} is live</h2>
          <p>The network is already running the latest release&rsquo;s protocol version.</p>
        </div>
      )}

      {phase === 'voting' && (
        <div className="status-hero voting">
          <h2>
            Voting on protocol version {target} — {data.votesForTarget}/{data.requiredVotes}
          </h2>
          <div className="progress">
            <div
              className={`progress-bar ${thresholdReached ? 'good' : ''}`}
              style={{ width: `${progress * 100}%` }}
            />
          </div>
          <p className="muted">
            {thresholdReached ? (
              <>
                Threshold reached — if the tally holds, PV{target} locks in at the epoch{' '}
                {data.epochIndex} boundary ({formatTimeUntil(data.epochEndsAtMs)}) and activates
                one epoch later.
              </>
            ) : (
              <>
                {data.requiredVotes - data.votesForTarget} more votes needed (67% of{' '}
                {data.activeEvonodes} active evonodes). Votes are cast as upgraded nodes propose
                blocks; the tally is checked at the epoch boundary (
                {formatTimeUntil(data.epochEndsAtMs)}) and locks in the version for the epoch
                after.
              </>
            )}
          </p>
        </div>
      )}

      <div className="meta-line">
        <span>
          Current protocol version: <strong>PV{data.currentProtocolVersion}</strong>
        </span>
        <span title="next_epoch_protocol_version from the chain — the on-chain lock-in signal">
          Next epoch: <strong>PV{data.nextEpochProtocolVersion}</strong>
        </span>
        <span>
          Epoch <strong>{data.epochIndex}</strong>
        </span>
        <span title="The epoch flips on the first block proposed after this time">
          Epoch ends <strong>{formatTimeUntil(data.epochEndsAtMs)}</strong> (
          {formatTimestamp(data.epochEndsAtMs)})
        </span>
        <span>
          Active evonodes <strong>{data.activeEvonodes}</strong>
        </span>
      </div>

      <div className="status-actions">
        <button className="detail-link" onClick={onShowDetails}>
          View detailed vote status →
        </button>
        <span className="muted">
          loads per-node votes, quorum info and proposal estimates (more network calls)
        </span>
      </div>
    </section>
  );
}
