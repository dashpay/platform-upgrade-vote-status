import type { NodeRow } from '../types';

export const shortHash = (h: string): string => `${h.slice(0, 10)}…${h.slice(-6)}`;

export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const minutes = ms / 60_000;
  if (minutes < 1) return '<1 min';
  if (minutes < 60) return `~${Math.round(minutes)} min`;
  const hours = minutes / 60;
  if (hours < 48) return `~${hours.toFixed(1)} h`;
  return `~${(hours / 24).toFixed(1)} d`;
}

export const formatTimestamp = (ms: number): string =>
  new Date(ms).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

/** "in ~2.1 d" / "imminent" once the boundary time has passed. */
export function formatTimeUntil(ms: number): string {
  const remaining = ms - Date.now();
  return remaining < 60_000 ? 'imminent' : `in ${formatDuration(remaining)}`;
}

const versionParts = (v: string): number[] =>
  v
    .replace(/[^0-9.].*$/, '')
    .split('.')
    .map((p) => Number(p) || 0);

export function compareVersions(a: string, b: string): number {
  const pa = versionParts(a);
  const pb = versionParts(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/** Highest drive software version reported by any node. */
export function latestSoftware(nodes: NodeRow[]): string | null {
  let best: string | null = null;
  for (const n of nodes) {
    if (n.driveVersion && (!best || compareVersions(n.driveVersion, best) > 0)) {
      best = n.driveVersion;
    }
  }
  return best;
}

export const majorOf = (v: string): number => versionParts(v)[0] ?? 0;

/** Software already on the new major, but the on-chain vote hasn't flipped yet. */
export function isFlipPending(n: NodeRow, latestMajor: number, latestPv: number): boolean {
  return (
    n.driveVersion != null &&
    majorOf(n.driveVersion) >= latestMajor &&
    n.votedVersion !== latestPv
  );
}
