import { useState, useEffect } from 'react';

declare const CRIBL_API_URL: string;

interface Group {
  id: string;
  name?: string;
  workerCount?: number;
  configVersion?: number;
  isSearch?: boolean;
  tags?: string;
  description?: string;
}

type LoadState = 'loading' | 'ok' | 'error';

function Badge({ children, variant }: { children: React.ReactNode; variant: 'green' | 'slate' | 'blue' | 'red' }) {
  const cls: Record<string, string> = {
    green: 'bg-emerald-900 text-emerald-300 border border-emerald-700',
    slate: 'bg-slate-700 text-slate-300 border border-slate-600',
    blue:  'bg-blue-900 text-blue-300 border border-blue-700',
    red:   'bg-red-900 text-red-300 border border-red-700',
  };
  return <span className={`px-2 py-0.5 rounded text-xs font-medium ${cls[variant]}`}>{children}</span>;
}

function Spinner() {
  return (
    <svg className="animate-spin h-5 w-5 text-slate-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
    </svg>
  );
}

export default function App() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [state, setState] = useState<LoadState>('loading');
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  const apiBase = (window as any).CRIBL_API_URL || '/api/v1';

  async function loadGroups() {
    setState('loading');
    setError('');
    try {
      const res = await fetch(`${apiBase}/master/groups`);
      if (!res.ok) {
        const text = await res.text().catch(() => res.statusText);
        throw new Error(`HTTP ${res.status}: ${text}`);
      }
      const data = await res.json();
      const items: Group[] = data.items ?? data.groups ?? (Array.isArray(data) ? data : []);
      setGroups(items);
      setState('ok');
    } catch (e) {
      setError(String(e));
      setState('error');
    }
  }

  useEffect(() => { loadGroups(); }, []);

  const filtered = groups.filter(g => {
    const q = search.toLowerCase();
    return !q || g.id.toLowerCase().includes(q) || (g.name ?? '').toLowerCase().includes(q);
  });

  const workerGroups = groups.filter(g => !g.isSearch);
  const totalWorkers = workerGroups.reduce((sum, g) => sum + (g.workerCount ?? 0), 0);

  return (
    <div className="min-h-screen bg-slate-900 p-6">
      <div className="max-w-3xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold text-white">Worker Groups</h1>
            <p className="text-slate-400 text-sm mt-0.5">
              {state === 'ok'
                ? `${groups.length} group${groups.length !== 1 ? 's' : ''} · ${totalWorkers} worker${totalWorkers !== 1 ? 's' : ''} total`
                : state === 'loading' ? 'Fetching from Cribl API…'
                : 'Could not reach Cribl API'}
            </p>
          </div>
          <button
            onClick={loadGroups}
            disabled={state === 'loading'}
            className="flex items-center gap-2 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white text-sm rounded-md transition-colors"
          >
            {state === 'loading' ? <Spinner /> : '↺'} Refresh
          </button>
        </div>

        {/* API URL banner */}
        <div className="bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 mb-4 flex items-center gap-2 text-xs text-slate-400 font-mono">
          <span className="text-slate-500">API</span>
          <span className="text-blue-400">{apiBase}/master/groups</span>
        </div>

        {/* Error state */}
        {state === 'error' && (
          <div className="bg-red-950 border border-red-800 rounded-lg p-4 mb-4 text-red-300 text-sm">
            <div className="font-semibold mb-1">Failed to load groups</div>
            <div className="font-mono text-xs opacity-80">{error}</div>
          </div>
        )}

        {/* Loading state */}
        {state === 'loading' && (
          <div className="flex items-center justify-center py-16 text-slate-500 gap-3">
            <Spinner />
            <span className="text-sm">Loading worker groups…</span>
          </div>
        )}

        {/* Results */}
        {state === 'ok' && (
          <>
            <div className="mb-3">
              <input
                type="text"
                placeholder="Search groups…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm text-white placeholder-slate-500 outline-none focus:border-blue-500"
              />
            </div>

            {filtered.length === 0 ? (
              <div className="text-center py-12 text-slate-500 text-sm">No groups match your search.</div>
            ) : (
              <div className="space-y-2">
                {filtered.map(g => (
                  <div key={g.id} className="bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 flex items-center justify-between hover:border-slate-600 transition-colors">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0" />
                      <div className="min-w-0">
                        <div className="font-mono text-sm text-white truncate">{g.id}</div>
                        {g.description && <div className="text-slate-500 text-xs mt-0.5 truncate">{g.description}</div>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0 ml-4">
                      {g.isSearch && <Badge variant="blue">search</Badge>}
                      {g.workerCount !== undefined && (
                        <Badge variant="slate">{g.workerCount} worker{g.workerCount !== 1 ? 's' : ''}</Badge>
                      )}
                      {g.configVersion !== undefined && (
                        <span className="text-slate-600 text-xs font-mono">v{g.configVersion}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
