// Latest dashpay/platform release and the protocol version it ships.
// Cached in localStorage so refreshes don't burn the anonymous GitHub rate limit.

import type { ReleaseInfo } from '../types';

const CACHE_KEY = 'platform-latest-release-v1';
const CACHE_TTL_MS = 15 * 60_000;

export async function fetchLatestRelease(): Promise<ReleaseInfo> {
  const cached = readCache();
  if (cached) return cached;

  const res = await fetch('https://api.github.com/repos/dashpay/platform/releases/latest', {
    headers: { Accept: 'application/vnd.github+json' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`GitHub releases: HTTP ${res.status}`);
  const json = (await res.json()) as {
    tag_name: string;
    name: string | null;
    html_url: string;
    published_at: string;
  };

  const release: ReleaseInfo = {
    tag: json.tag_name,
    name: json.name ?? json.tag_name,
    url: json.html_url,
    publishedAt: Date.parse(json.published_at),
    targetProtocolVersion: await fetchTargetProtocolVersion(json.tag_name),
  };

  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), release }));
  } catch {
    // storage unavailable — cache is best-effort
  }
  return release;
}

function readCache(): ReleaseInfo | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
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
