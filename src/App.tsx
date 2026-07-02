import { useCallback, useEffect, useRef, useState } from 'react';
import { loadDashboardData } from './lib/model';
import { Summary } from './components/Summary';
import { NodeTable } from './components/NodeTable';
import type { DashboardData, Network } from './types';

const REFRESH_MS = 60_000;

export default function App() {
  const [network, setNetwork] = useState<Network>('mainnet');
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const requestId = useRef(0);

  const refresh = useCallback(async (net: Network) => {
    const id = ++requestId.current;
    setLoading(true);
    try {
      const next = await loadDashboardData(net);
      if (id === requestId.current) {
        setData(next);
        setError(null);
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
    setData(null);
    setError(null);
    void refresh(network);
    const timer = setInterval(() => void refresh(network), REFRESH_MS);
    return () => clearInterval(timer);
  }, [network, refresh]);

  return (
    <div className="app">
      <header>
        <div>
          <h1>Platform Upgrade Vote Status</h1>
          <p className="subtitle">
            Evonode protocol-version upgrade progress on Dash Platform — software versions,
            on-chain votes, and estimated next block proposals.
          </p>
        </div>
        <div className="header-controls">
          <div className="net-toggle">
            {(['mainnet', 'testnet'] as Network[]).map((net) => (
              <button
                key={net}
                className={network === net ? 'active' : ''}
                onClick={() => setNetwork(net)}
              >
                {net}
              </button>
            ))}
          </div>
          <button className="refresh" onClick={() => void refresh(network)} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </header>

      {error && (
        <div className="error">
          Failed to load {network} data: {error}
        </div>
      )}

      {!data && !error && (
        <div className="loading">
          <div className="spinner" />
          Connecting to {network} and verifying proofs…
        </div>
      )}

      {data && (
        <>
          <Summary data={data} />
          <NodeTable data={data} />
          <footer>
            Data: DAPI (proof-verified via{' '}
            <a href="https://www.npmjs.com/package/@dashevo/evo-sdk">@dashevo/evo-sdk</a>) ·
            quorums.{network}.networks.dash.org · updated{' '}
            {new Date(data.fetchedAt).toLocaleTimeString()} · auto-refreshes every{' '}
            {REFRESH_MS / 1000}s ·{' '}
            <a href="https://github.com/dashpay/platform-upgrade-vote-status">source</a>
          </footer>
        </>
      )}
    </div>
  );
}
