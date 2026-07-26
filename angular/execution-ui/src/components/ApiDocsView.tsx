import React, { useState } from 'react';
import { Terminal, Copy, Check, Play, BookOpen, Server, Code2 } from 'lucide-react';
import { executionApi } from '../services/apiClient';

interface ApiDocsViewProps {
  onOpenReadme: () => void;
}

export const ApiDocsView: React.FC<ApiDocsViewProps> = ({ onOpenReadme }) => {
  const [selectedEndpoint, setSelectedEndpoint] = useState(0);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [isLoadingTest, setIsLoadingTest] = useState(false);

  const endpoints = [
    {
      method: 'GET',
      path: '/api/execution/requests/req_000001/state',
      title: '1. Request Lifecycle State (Aggregate Root)',
      description: 'The request, its current lease (if any), its latest attempt, and all of its receipts — a single "where does this stand right now" view.',
      execute: () => executionApi.getRequestState('req_000001')
    },
    {
      method: 'GET',
      path: '/api/execution/leases/stale',
      title: '2a. Stale Active Leases',
      description: 'All ACTIVE leases with expires_at < now() — the enforcement gap made queryable.',
      execute: () => executionApi.getStaleLeases()
    },
    {
      method: 'GET',
      path: '/api/execution/leases/les_000001/lifecycle',
      title: '2b. Lease Lifecycle Inspector',
      description: 'acquired_at -> expires_at -> released_at, promised vs actual TTL, and lifecycle_state.',
      execute: () => executionApi.getLeaseLifecycle('les_000001')
    },
    {
      method: 'GET',
      path: '/api/execution/health/integrity-scan',
      title: '3. Cross-Table Consistency Scan',
      description: 'Scans for specific pathologies (8 kinds) and returns { kind, count, samples[] }.',
      execute: () => executionApi.getIntegrityScan()
    },
    {
      method: 'GET',
      path: '/api/execution/requests/req_000001/attempts',
      title: '4a. Attempt / Lease / Request Tree',
      description: 'Every attempt for the request, each with its parent lease joined in, chronological.',
      execute: () => executionApi.getRequestAttemptsTree('req_000001')
    },
    {
      method: 'GET',
      path: '/api/execution/requests/req_000001/receipts/lineage',
      title: '4b. Receipts Lineage Buckets',
      description: 'All receipts split into native / backfilled (from vision.receipts) / unknown lineage buckets.',
      execute: () => executionApi.getReceiptsLineage('req_000001')
    },
    {
      method: 'GET',
      path: '/api/execution/health/by-executor',
      title: '5. Fleet View',
      description: 'Fleet-wide summary per executor or single executor details with active leases.',
      execute: () => executionApi.getFleetByExecutor()
    },
    {
      method: 'GET',
      path: '/api/execution/receipts/rcp_000001/pipeline-origin',
      title: '6. Pipeline Origin (Lineage-Honest)',
      description: 'Follows lineage_original_id -> vision.receipts.id and returns both records side by side.',
      execute: () => executionApi.getPipelineOrigin('rcp_000001')
    }
  ];

  const handleCopyCurl = (path: string, index: number) => {
    const curl = `curl -X GET "http://localhost:3110${path}" -H "Accept: application/json"`;
    navigator.clipboard.writeText(curl);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const handleExecute = async (idx: number) => {
    setSelectedEndpoint(idx);
    setIsLoadingTest(true);
    try {
      const res = await endpoints[idx].execute();
      setTestResult(JSON.stringify(res, null, 2));
    } catch (err: any) {
      setTestResult(JSON.stringify({ error: err.message }, null, 2));
    } finally {
      setIsLoadingTest(false);
    }
  };

  const current = endpoints[selectedEndpoint];

  return (
    <div className="p-4 space-y-4 font-sans text-slate-200 overflow-y-auto max-w-7xl mx-auto">
      <div className="p-4 bg-slate-900 border border-slate-800 rounded-lg flex items-center justify-between font-mono">
        <div className="flex items-center gap-3">
          <Terminal className="w-6 h-6 text-emerald-400" />
          <div>
            <h1 className="text-base font-bold text-slate-100">execution-srv REST API Spec</h1>
            <p className="text-xs text-slate-400">Strictly read-only observability endpoints over execution.* schema</p>
          </div>
        </div>

        <button
          onClick={onOpenReadme}
          className="px-3 py-1.5 bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 border border-blue-500/40 rounded text-xs font-bold transition-colors flex items-center gap-2"
        >
          <BookOpen className="w-4 h-4" />
          <span>Integration README</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 font-mono text-xs">
        {/* Endpoint List */}
        <div className="lg:col-span-5 space-y-1.5">
          {endpoints.map((ep, idx) => {
            const isSelected = selectedEndpoint === idx;
            return (
              <div
                key={ep.path}
                onClick={() => handleExecute(idx)}
                className={`p-3 bg-slate-900 border rounded-lg cursor-pointer transition-all ${
                  isSelected ? 'border-emerald-500/60 bg-slate-850 shadow-md' : 'border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-200 text-[11px]">{ep.title}</span>
                  <span className="px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 text-[10px] font-bold">
                    {ep.method}
                  </span>
                </div>
                <div className="text-[10px] text-slate-400 mt-1 truncate">{ep.path}</div>
              </div>
            );
          })}
        </div>

        {/* Console / Response Output Panel */}
        <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-3 shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <div>
              <span className="font-bold text-slate-100 text-sm block">{current.title}</span>
              <span className="text-[10px] text-slate-400">{current.description}</span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => handleCopyCurl(current.path, selectedEndpoint)}
                className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-[10px] flex items-center gap-1.5"
              >
                {copiedIndex === selectedEndpoint ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>{copiedIndex === selectedEndpoint ? 'Copied Curl' : 'Copy Curl'}</span>
              </button>

              <button
                onClick={() => handleExecute(selectedEndpoint)}
                disabled={isLoadingTest}
                className="px-3 py-1 rounded bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 text-[10px] font-bold flex items-center gap-1.5"
              >
                <Play className="w-3 h-3" />
                <span>Run Test</span>
              </button>
            </div>
          </div>

          <div className="space-y-1">
            <span className="text-slate-400 text-[10px]">RESPONSE JSON PAYLOAD</span>
            <pre className="p-3 bg-slate-950 border border-slate-800 rounded text-[11px] text-emerald-300 overflow-x-auto max-h-96">
              {isLoadingTest ? 'Executing endpoint call...' : testResult || 'Click "Run Test" or select an endpoint.'}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
};
