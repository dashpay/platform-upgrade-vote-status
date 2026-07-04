import { useCallback, useEffect, useRef, useState } from 'react';
import { loadDashboardData, loadStatusData } from './lib/model';
import { Summary } from './components/Summary';
import { NodeTable } from './components/NodeTable';
import { StatusView } from './components/StatusView';
import type { DashboardData, Network, StatusData } from './types';

const REFRESH_MS = 60_000;

type View = 'status' | 'detail';

export default function App() {
  const [network, setNetwork] = useState<Network>('mainnet');
  const [view, setView] = useState<View>('status');
  const [status, setStatus] = useState<StatusData | null>(null);
  const [detail, setDetail] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const requestId = useRef(0);

  // Only the active view is loaded/refreshed — the status view is the cheap
  // default; the full per-node dashboard is fetched on demand.
  const refresh = useCallback(async (net: Network, mode: View) => {
    const id = ++requestId.current;
    setLoading(true);
    try {
      if (mode === 'status') {
        const next = await loadStatusData(net);
        if (id === requestId.current) {
          setStatus(next);
          setError(null);
        }
      } else {
        const next = await loadDashboardData(net);
        if (id === requestId.current) {
          setDetail(next);
          setError(null);
        }
      }
    } catch (e) {
      console.error(e);
      if (id === requestId.current) {
        setError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    setError(null);
    void refresh(network, view);
    const timer = setInterval(() => void refresh(network, view), REFRESH_MS);
    return () => clearInterval(timer);
  }, [network, view, refresh]);

  const switchNetwork = (net: Network) => {
    if (net === network) return;
    setStatus(null);
    setDetail(null);
    setError(null);
    setNetwork(net);
  };

  const current = view === 'status' ? status : detail;

  return (
    <div className="app">
      <header>
        <div>
          <h1>Platform Upgrade Vote Status</h1>
          <p className="subtitle">
            Is the latest Dash Platform release&rsquo;s protocol version locked in? Plus
            per-node software versions, on-chain votes, and estimated next block proposals.
          </p>
        </div>
        <div className="header-controls">
          <div className="net-toggle">
            {(['mainnet', 'testnet'] as Network[]).map((net) => (
              <button
                key={net}
                className={network === net ? 'active' : ''}
                onClick={() => switchNetwork(net)}
              >
                {net}
              </button>
            ))}
          </div>
          <button
            className="refresh"
            onClick={() => void refresh(network, view)}
            disabled={loading}
          >
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </header>

      {error && (
        <div className="error">
          Failed to load {network} data: {error}
        </div>
      )}

      {!current && !error && (
        <div className="loading">
          <div className="spinner" />
          {view === 'status'
            ? `Checking ${network} upgrade status…`
            : `Connecting to ${network} and verifying proofs…`}
        </div>
      )}

      {view === 'status' && status && (
        <StatusView data={status} onShowDetails={() => setView('detail')} />
      )}

      {view === 'detail' && (
        <>
          <button className="back-link" onClick={() => setView('status')}>
            ← Back to upgrade status
          </button>
          {detail && (
            <>
              <Summary data={detail} />
              <NodeTable data={detail} />
            </>
          )}
        </>
      )}

      {current && (
        <footer>
          Data: GitHub releases · DAPI (proof-verified via{' '}
          <a href="https://www.npmjs.com/package/@dashevo/evo-sdk">@dashevo/evo-sdk</a>) ·
          quorums.{network}.networks.dash.org · updated{' '}
          {new Date(current.fetchedAt).toLocaleTimeString()} · auto-refreshes every{' '}
          {REFRESH_MS / 1000}s ·{' '}
          <a href="https://github.com/dashpay/platform-upgrade-vote-status">source</a>
        </footer>
      )}
    </div>
  );
}
