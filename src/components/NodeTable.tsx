import { useMemo, useState } from 'react';
import type { DashboardData, NodeRow } from '../types';
import {
  compareVersions,
  formatDuration,
  isFlipPending,
  latestSoftware,
  majorOf,
  shortHash,
} from '../lib/format';

type Filter = 'all' | 'flip-pending' | 'voted-latest' | 'old-software' | 'active-set';
type SortKey = 'eta' | 'proTxHash' | 'software' | 'vote';

export function NodeTable({ data }: { data: DashboardData }) {
  const [filter, setFilter] = useState<Filter>('all');
  const [sortKey, setSortKey] = useState<SortKey>('eta');
  const [sortAsc, setSortAsc] = useState(true);
  const [search, setSearch] = useState('');

  const latestSw = latestSoftware(data.nodes);
  const latestMajor = latestSw ? majorOf(latestSw) : 0;
  const latestPv = data.latestProtocolVersion;
  const upgradeInProgress = latestPv > data.epoch.protocolVersion;

  const rows = useMemo(() => {
    let rows = data.nodes;
    switch (filter) {
      case 'flip-pending':
        rows = rows.filter((n) => isFlipPending(n, latestMajor, latestPv));
        break;
      case 'voted-latest':
        rows = rows.filter((n) => n.votedVersion === latestPv);
        break;
      case 'old-software':
        rows = rows.filter((n) => !n.driveVersion || majorOf(n.driveVersion) < latestMajor);
        break;
      case 'active-set':
        rows = rows.filter((n) => n.inActiveQuorum);
        break;
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter(
        (n) => n.proTxHash.includes(q) || (n.address ?? '').toLowerCase().includes(q),
      );
    }
    const dir = sortAsc ? 1 : -1;
    return [...rows].sort((a, b) => dir * compareRows(a, b, sortKey));
  }, [data.nodes, filter, search, sortKey, sortAsc, latestMajor, latestPv]);

  const header = (key: SortKey, label: string) => (
    <th
      onClick={() => {
        if (sortKey === key) setSortAsc(!sortAsc);
        else {
          setSortKey(key);
          setSortAsc(true);
        }
      }}
    >
      {label} {sortKey === key ? (sortAsc ? '▲' : '▼') : ''}
    </th>
  );

  return (
    <section className="table-section">
      <div className="table-controls">
        <div className="filters">
          {(
            [
              ['all', 'All'],
              ['flip-pending', upgradeInProgress ? 'Awaiting proposal' : 'Not signaled this epoch'],
              ['voted-latest', `Voted PV${latestPv}`],
              ['old-software', 'Old software'],
              ['active-set', 'In active quorums'],
            ] as [Filter, string][]
          ).map(([value, label]) => (
            <button
              key={value}
              className={filter === value ? 'active' : ''}
              onClick={() => setFilter(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <input
          type="search"
          placeholder="Search proTxHash or IP…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {header('proTxHash', 'Evonode')}
              {header('software', 'Software')}
              {header('vote', 'On-chain vote')}
              <th>Active set</th>
              {header('eta', 'Next proposal (est.)')}
            </tr>
          </thead>
          <tbody>
            {rows.map((n) => (
              <Row
                key={n.proTxHash}
                n={n}
                latestMajor={latestMajor}
                latestPv={latestPv}
                upgradeInProgress={upgradeInProgress}
              />
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <div className="empty">No nodes match.</div>}
      </div>
      <div className="table-footnote">
        {rows.length} node{rows.length === 1 ? '' : 's'} shown. Next-proposal estimates simulate
        Tenderdash's round-robin walk through the current validator set and quorum rotation order;
        quorum churn at DKG boundaries can shift them.
      </div>
    </section>
  );
}

function compareRows(a: NodeRow, b: NodeRow, key: SortKey): number {
  switch (key) {
    case 'proTxHash':
      return a.proTxHash.localeCompare(b.proTxHash);
    case 'software':
      return compareVersions(a.driveVersion ?? '0', b.driveVersion ?? '0');
    case 'vote':
      return (a.votedVersion ?? 0) - (b.votedVersion ?? 0);
    case 'eta': {
      const ea = a.eta?.blocks ?? Number.MAX_SAFE_INTEGER;
      const eb = b.eta?.blocks ?? Number.MAX_SAFE_INTEGER;
      return ea - eb;
    }
  }
}

function Row({
  n,
  latestMajor,
  latestPv,
  upgradeInProgress,
}: {
  n: NodeRow;
  latestMajor: number;
  latestPv: number;
  upgradeInProgress: boolean;
}) {
  const flipPending = upgradeInProgress && isFlipPending(n, latestMajor, latestPv);
  const swTone = !n.driveVersion
    ? 'muted'
    : majorOf(n.driveVersion) >= latestMajor
      ? 'good'
      : 'bad';
  const voteTone = n.votedVersion == null ? 'muted' : n.votedVersion === latestPv ? 'good' : 'warn';

  return (
    <tr className={flipPending ? 'flip-pending' : ''}>
      <td className="mono" title={n.proTxHash}>
        {shortHash(n.proTxHash)}
        {n.status && n.status !== 'ENABLED' && <span className="badge bad">{n.status}</span>}
      </td>
      <td>
        <span className={`badge ${swTone}`}>{n.driveVersion ?? 'unknown'}</span>
      </td>
      <td>
        <span className={`badge ${voteTone}`}>
          {n.votedVersion != null ? `PV${n.votedVersion}` : 'not signaled'}
        </span>
        {flipPending && <span className="badge warn">flip pending</span>}
      </td>
      <td>{n.inActiveQuorum ? <span className="badge neutral">member</span> : <span className="muted">—</span>}</td>
      <td>
        {n.eta ? (
          <span title={`≈ ${n.eta.blocks} blocks, quorum ${n.eta.quorumHash.slice(0, 12)}…`}>
            {formatDuration(n.eta.etaMs)}{' '}
            <span className="muted">({n.eta.blocks} blk)</span>
          </span>
        ) : (
          <span className="muted" title="Not in the current rotation cycle — waits for a future quorum (DKG) cycle">
            next DKG cycle
          </span>
        )}
      </td>
    </tr>
  );
}
