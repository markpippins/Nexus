import React, { useState } from 'react';
import { 
  ShieldAlert, 
  RefreshCw, 
  AlertTriangle, 
  CheckCircle2, 
  Info, 
  ChevronDown, 
  ChevronRight, 
  Code2, 
  FileJson,
  ExternalLink
} from 'lucide-react';
import { IntegrityScanResponse, PathologyItem, NavTab } from '../types';

interface IntegrityScanViewProps {
  scanResult: IntegrityScanResponse | null;
  onRefreshScan: () => void;
  isScanning: boolean;
  setCurrentTab: (tab: NavTab) => void;
  onSelectRequest: (id: string) => void;
  onSelectLease: (id: string) => void;
}

export const IntegrityScanView: React.FC<IntegrityScanViewProps> = ({
  scanResult,
  onRefreshScan,
  isScanning,
  setCurrentTab,
  onSelectRequest,
  onSelectLease
}) => {
  const [expandedKind, setExpandedKind] = useState<string | null>('stale_active_lease');

  const getSeverityBadge = (severity: PathologyItem['severity']) => {
    switch (severity) {
      case 'CRITICAL':
        return 'bg-red-500/20 text-red-400 border-red-500/40';
      case 'WARNING':
        return 'bg-amber-500/20 text-amber-400 border-amber-500/40';
      case 'INFO':
        return 'bg-blue-500/20 text-blue-400 border-blue-500/40';
      default:
        return 'bg-slate-700 text-slate-300 border-slate-600';
    }
  };

  const getSqlExplanation = (kind: string) => {
    switch (kind) {
      case 'orphan_lease_request_mismatch':
        return `SELECT l.* FROM execution.leases l LEFT JOIN execution.requests r ON l.request_id = r.id WHERE r.id IS NULL;`;
      case 'stale_active_lease':
        return `SELECT * FROM execution.leases WHERE status = 'ACTIVE' AND expires_at < NOW();`;
      case 'attempt_orphan_no_lease':
        return `SELECT a.* FROM execution.attempts a LEFT JOIN execution.leases l ON a.lease_id = l.id WHERE l.id IS NULL;`;
      case 'attempt_status_diverges_from_request':
        return `SELECT r.id AS req_id, r.status AS req_status, a.id AS att_id, a.status AS att_status FROM execution.requests r JOIN execution.attempts a ON r.id = a.request_id WHERE r.status = 'COMPLETED' AND a.status IN ('CREATED', 'RUNNING');`;
      case 'receipt_request_mismatch':
        return `SELECT rc.* FROM execution.receipts rc LEFT JOIN execution.requests r ON rc.request_id = r.id WHERE r.id IS NULL;`;
      case 'receipt_attempt_mismatch':
        return `SELECT rc.* FROM execution.receipts rc LEFT JOIN execution.attempts a ON rc.attempt_id = a.id WHERE a.id IS NULL;`;
      case 'unreleased_lease_for_terminal_request':
        return `SELECT l.*, r.status AS request_status FROM execution.leases l JOIN execution.requests r ON l.request_id = r.id WHERE r.status IN ('COMPLETED', 'CANCELLED', 'FAILED') AND l.status = 'ACTIVE';`;
      case 'attempted_no_completion':
        return `SELECT r.* FROM execution.requests r JOIN execution.attempts a ON r.id = a.request_id WHERE r.status NOT IN ('COMPLETED', 'CANCELLED', 'FAILED') GROUP BY r.id HAVING COUNT(a.id) > 0 AND BOOL_AND(a.status = 'CREATED');`;
      default:
        return `-- Named pathology scan block`;
    }
  };

  return (
    <div className="p-4 space-y-4 font-sans text-slate-200 overflow-y-auto max-w-7xl mx-auto">
      {/* Header Bar */}
      <div className="p-4 bg-slate-900 border border-slate-800 rounded-lg flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-md font-mono">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/40">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-base font-bold text-slate-100 flex items-center gap-2">
              Cross-Table Consistency Scanner
              <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                /api/execution/health/integrity-scan
              </span>
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Named pathologies scanner generalized from <code className="text-emerald-400 font-mono">vision.check_receipt_integrity()</code>.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right text-xs">
            <span className="text-slate-400 block">Scanned At</span>
            <span className="text-slate-200 font-bold">
              {scanResult?.scanned_at ? new Date(scanResult.scanned_at).toLocaleTimeString() : 'Just Now'}
            </span>
          </div>

          <button
            onClick={onRefreshScan}
            disabled={isScanning}
            className="px-3 py-2 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded font-bold text-xs transition-colors flex items-center gap-2"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isScanning ? 'animate-spin' : ''}`} />
            <span>{isScanning ? 'Scanning Schema...' : 'Run Integrity Scan'}</span>
          </button>
        </div>
      </div>

      {/* Summary KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 font-mono text-xs">
        <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg flex items-center justify-between">
          <div>
            <span className="text-slate-400 block text-[11px]">ACTIVE PATHOLOGIES</span>
            <span className="text-xl font-bold text-amber-400">{scanResult?.total_pathologies ?? 8} Kinds</span>
          </div>
          <AlertTriangle className="w-5 h-5 text-amber-400/80" />
        </div>

        <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg flex items-center justify-between">
          <div>
            <span className="text-slate-400 block text-[11px]">TOTAL FAULTY RECORDS</span>
            <span className="text-xl font-bold text-red-400">{scanResult?.total_issues_count ?? 38} Rows</span>
          </div>
          <ShieldAlert className="w-5 h-5 text-red-400/80" />
        </div>

        <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg flex items-center justify-between">
          <div>
            <span className="text-slate-400 block text-[11px]">SCANNER STATUS</span>
            <span className="text-xl font-bold text-emerald-400">ONLINE [8 Scans]</span>
          </div>
          <CheckCircle2 className="w-5 h-5 text-emerald-400/80" />
        </div>
      </div>

      {/* Pathologies Accordion List */}
      <div className="space-y-2 font-mono">
        {scanResult?.items.map((item) => {
          const isExpanded = expandedKind === item.kind;
          const sql = getSqlExplanation(item.kind);

          return (
            <div 
              key={item.kind}
              className={`bg-slate-900 border rounded-lg overflow-hidden transition-all ${
                isExpanded ? 'border-amber-500/50 shadow-lg' : 'border-slate-800 hover:border-slate-700'
              }`}
            >
              {/* Header Accordion Row */}
              <div 
                onClick={() => setExpandedKind(isExpanded ? null : item.kind)}
                className="p-3 bg-slate-900/90 hover:bg-slate-850 cursor-pointer flex items-center justify-between select-none"
              >
                <div className="flex items-center gap-3">
                  <div className="text-slate-400">
                    {isExpanded ? <ChevronDown className="w-4 h-4 text-amber-400" /> : <ChevronRight className="w-4 h-4" />}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-slate-100">{item.title}</span>
                      <span className={`px-1.5 py-0.2 text-[10px] rounded border font-bold ${getSeverityBadge(item.severity)}`}>
                        {item.severity}
                      </span>
                      <code className="text-[10px] text-slate-500 font-normal">[{item.kind}]</code>
                    </div>
                    <p className="text-xs text-slate-400 font-sans mt-0.5">{item.description}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span className={`px-2.5 py-1 rounded-md text-xs font-bold border ${
                    item.count > 0 
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' 
                      : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                  }`}>
                    {item.count} {item.count === 1 ? 'sample' : 'samples'}
                  </span>
                </div>
              </div>

              {/* Expanded Payload & SQL Details */}
              {isExpanded && (
                <div className="p-4 border-t border-slate-800/80 bg-slate-950/70 space-y-3 text-xs">
                  {/* SQL Pathology Query */}
                  <div>
                    <div className="flex items-center gap-1.5 text-slate-400 text-[11px] font-bold mb-1">
                      <Code2 className="w-3.5 h-3.5 text-amber-400" />
                      INTERNAL PATHOLOGY SCANNER SQL BLOCK
                    </div>
                    <pre className="p-2.5 bg-slate-900 border border-slate-800 rounded font-mono text-[11px] text-emerald-300 overflow-x-auto">
                      {sql}
                    </pre>
                  </div>

                  {/* Sample Faulty Rows */}
                  <div>
                    <div className="flex items-center justify-between text-slate-400 text-[11px] font-bold mb-1.5">
                      <span className="flex items-center gap-1.5">
                        <FileJson className="w-3.5 h-3.5 text-amber-400" />
                        FAULTY SAMPLE RECORDS ({item.samples.length} shown)
                      </span>
                    </div>

                    {item.samples.length === 0 ? (
                      <div className="p-3 bg-slate-900/50 border border-slate-800 rounded text-slate-500 text-center">
                        No violating records found for this scan pathology in the current dataset.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {item.samples.map((sample, idx) => (
                          <div key={idx} className="p-2.5 bg-slate-900 border border-slate-800 rounded font-mono text-xs space-y-1">
                            <div className="flex items-center justify-between border-b border-slate-800 pb-1 text-[11px]">
                              <span className="text-amber-400 font-bold">Sample #{idx + 1}</span>
                              {sample.id && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (sample.id.startsWith('req_')) onSelectRequest(sample.id);
                                    else if (sample.id.startsWith('les_')) onSelectLease(sample.id);
                                    else if (sample.request_id) onSelectRequest(sample.request_id);
                                  }}
                                  className="text-emerald-400 hover:underline flex items-center gap-1 text-[10px]"
                                >
                                  Inspect Entity
                                  <ExternalLink className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                            <pre className="text-slate-300 text-[10px] overflow-x-auto p-1 bg-slate-950/80 rounded">
                              {JSON.stringify(sample, null, 2)}
                            </pre>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
