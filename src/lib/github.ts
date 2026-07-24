// Latest dashpay/platform release and the protocol version it ships.
// Cached in localStorage so refreshes don't burn the anonymous GitHub rate limit.

import { compareVersions } from './format';
import type { Network, ReleaseInfo } from '../types';

const CACHE_PREFIX = 'platform-latest-release-v2';
const CACHE_TTL_MS = 15 * 60_000;

interface GitHubRelease {
  tag_name: string;
  name: string | null;
  html_url: string;
  published_at: string;
  draft: boolean;
}

/**
 * Mainnet runs stable releases, so it tracks GitHub's "latest" — which
 * deliberately excludes prereleases. Testnet is where release candidates are
 * exercised ahead of a stable tag, so it must consider prereleases too;
 * otherwise a testnet already voting on the next protocol version reports the
 * previous stable release as its target.
 */
export async function fetchLatestRelease(network: Network): Promise<ReleaseInfo> {
  const cached = readCache(network);
  if (cached) return cached;

  const json =
    network === 'mainnet' ? await fetchLatestStable() : await fetchNewestIncludingPrereleases();

  const release: ReleaseInfo = {
    tag: json.tag_name,
    name: json.name ?? json.tag_name,
    url: json.html_url,
    publishedAt: Date.parse(json.published_at),
    targetProtocolVersion: await fetchTargetProtocolVersion(json.tag_name),
  };

  try {
    localStorage.setItem(cacheKey(network), JSON.stringify({ at: Date.now(), release }));
  } catch {
    // storage unavailable — cache is best-effort
  }
  return release;
}

async function fetchLatestStable(): Promise<GitHubRelease> {
  return getJson<GitHubRelease>(
    'https://api.github.com/repos/dashpay/platform/releases/latest',
  );
}

/**
 * Highest-versioned release, prereleases included. Ordered by version rather
 * than publish date so a patch to an older line (say v4.0.1 landing after
 * v4.1.0-rc.1) doesn't displace the newer series.
 */
async function fetchNewestIncludingPrereleases(): Promise<GitHubRelease> {
  const all = await getJson<GitHubRelease[]>(
    'https://api.github.com/repos/dashpay/platform/releases?per_page=30',
  );
  const candidates = all.filter((r) => !r.draft);
  if (candidates.length === 0) throw new Error('GitHub releases: no published releases');
  return candidates.reduce((best, r) =>
    compareVersions(r.tag_name, best.tag_name) > 0 ||
    (compareVersions(r.tag_name, best.tag_name) === 0 &&
      Date.parse(r.published_at) > Date.parse(best.published_at))
      ? r
      : best,
  );
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { Accept: 'application/vnd.github+json' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`GitHub releases: HTTP ${res.status}`);
  return (await res.json()) as T;
}

const cacheKey = (network: Network): string => `${CACHE_PREFIX}:${network}`;

function readCache(network: Network): ReleaseInfo | null {
  try {
    const raw = localStorage.getItem(cacheKey(network));
    if (!raw) return null;
    const { at, release } = JSON.parse(raw) as { at: number; release: ReleaseInfo };
    if (Date.now() - at > CACHE_TTL_MS) return null;
    if (typeof release?.targetProtocolVersion !== 'number') return null;
    return release;
  } catch {
    return null;
  }
}

/** The protocol version a release ships is LATEST_VERSION in rs-platform-version at that tag. */
async function fetchTargetProtocolVersion(tag: string): Promise<number> {
  const res = await fetch(
    `https://raw.githubusercontent.com/dashpay/platform/${tag}/packages/rs-platform-version/src/version/mod.rs`,
    { signal: AbortSignal.timeout(15_000) },
  );
  if (!res.ok) throw new Error(`rs-platform-version at ${tag}: HTTP ${res.status}`);
  const src = await res.text();
  const m = src.match(/LATEST_VERSION\s*:\s*ProtocolVersion\s*=\s*PROTOCOL_VERSION_(\d+)/);
  if (!m) throw new Error(`could not find LATEST_VERSION in rs-platform-version at ${tag}`);
  return Number(m[1]);
}
