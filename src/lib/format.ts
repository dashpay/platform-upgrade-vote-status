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

// GitHub tags carry a leading "v" (v5.0.0); node versions do not (5.0.0).
const stripV = (v: string): string => v.replace(/^v/i, '');

const versionParts = (v: string): number[] =>
  stripV(v)
    .replace(/[^0-9.].*$/, '')
    .split('.')
    .map((p) => Number(p) || 0);

const isPrerelease = (v: string): boolean => /^[0-9.]*-/.test(stripV(v));

/**
 * Orders by major.minor.patch; on a tie a release ranks above its
 * prereleases (5.0.0 > 5.0.0-rc.8). Prereleases of one version tie.
 */
export function compareVersions(a: string, b: string): number {
  const pa = versionParts(a);
  const pb = versionParts(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return Number(isPrerelease(b)) - Number(isPrerelease(a));
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

/**
 * Protocol-relevant release series: [major, minor].
 *
 * A protocol-version bump can ship in either a major or a minor release — PV12
 * came with v4.0.0, PV13 comes with v4.1.0 — so major alone cannot distinguish
 * upgraded nodes from stale ones. Patch releases are bugfix-only and never
 * change the protocol version, so they are not part of the series.
 */
const seriesOf = (v: string): [number, number] => {
  const p = versionParts(v);
  return [p[0] ?? 0, p[1] ?? 0];
};

/** "4.1" — the series, for display. */
export const seriesLabel = (v: string): string => seriesOf(v).join('.');

function compareSeries(a: string, b: string): number {
  const [aMajor, aMinor] = seriesOf(a);
  const [bMajor, bMinor] = seriesOf(b);
  return aMajor - bMajor || aMinor - bMinor;
}

/** Node is on the newest release series seen on the network (or ahead of it). */
export const isCurrentSoftware = (v: string, latestSw: string): boolean =>
  compareSeries(v, latestSw) >= 0;

/** Software already on the new series, but the on-chain vote hasn't flipped yet. */
export function isFlipPending(n: NodeRow, latestSw: string, latestPv: number): boolean {
  return (
    n.driveVersion != null &&
    isCurrentSoftware(n.driveVersion, latestSw) &&
    n.votedVersion !== latestPv
  );
}
