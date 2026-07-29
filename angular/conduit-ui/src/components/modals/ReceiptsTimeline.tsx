import React, { useState } from 'react';
import {
  ShieldCheck,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Activity,
  ChevronRight,
  ChevronDown,
  Hash,
  ArrowDown,
  FileText,
  Copy,
  Check,
} from 'lucide-react';
import { LegacyReceipt } from '../../types/conduit';

interface ReceiptsTimelineProps {
  receipts: LegacyReceipt[];
}

export const ReceiptsTimeline: React.FC<ReceiptsTimelineProps> = ({ receipts }) => {
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});
  const [copiedHash, setCopiedHash] = useState<string | null>(null);

  if (!receipts || receipts.length === 0) {
    return (
      <div className="bg-zinc-950/60 border border-zinc-800/80 rounded-lg p-4 text-center font-mono text-xs text-zinc-500">
        No receipt records found in audit chain.
      </div>
    );
  }

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleExpandAll = () => {
    const allExpanded = receipts.every((r) => expandedIds[r.id]);
    const newState: Record<string, boolean> = {};
    if (!allExpanded) {
      receipts.forEach((r) => {
        newState[r.id] = true;
      });
    }
    setExpandedIds(newState);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedHash(text);
    setTimeout(() => setCopiedHash(null), 2000);
  };

  const getStatusColorConfig = (type: string) => {
    const uppercaseType = type ? type.toUpperCase() : '';
    if (
      uppercaseType.includes('COMPLETED') ||
      uppercaseType.includes('PASS') ||
      uppercaseType.includes('APPROVED') ||
      uppercaseType.includes('SUCCESS')
    ) {
      return {
        dotBg: 'bg-emerald-500',
        ringBg: 'ring-emerald-500/30',
        badgeBg: 'bg-emerald-950/80 text-emerald-300 border-emerald-700/60',
        icon: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />,
      };
    }
    if (
      uppercaseType.includes('BLOCK') ||
      uppercaseType.includes('REJECT') ||
      uppercaseType.includes('FAIL') ||
      uppercaseType.includes('ERROR')
    ) {
      return {
        dotBg: 'bg-rose-500',
        ringBg: 'ring-rose-500/30',
        badgeBg: 'bg-rose-950/80 text-rose-300 border-rose-700/60',
        icon: <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />,
      };
    }
    if (
      uppercaseType.includes('PLAN') ||
      uppercaseType.includes('PROPOSED') ||
      uppercaseType.includes('PENDING') ||
      uppercaseType.includes('REVIEW')
    ) {
      return {
        dotBg: 'bg-amber-500',
        ringBg: 'ring-amber-500/30',
        badgeBg: 'bg-amber-950/80 text-amber-300 border-amber-700/60',
        icon: <Clock className="w-3.5 h-3.5 text-amber-400" />,
      };
    }
    return {
      dotBg: 'bg-blue-500',
      ringBg: 'ring-blue-500/30',
      badgeBg: 'bg-blue-950/80 text-blue-300 border-blue-700/60',
      icon: <Activity className="w-3.5 h-3.5 text-blue-400" />,
    };
  };

  const formatTimestamp = (isoStr: string) => {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return isoStr;
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    });
  };

  const allExpanded = receipts.every((r) => expandedIds[r.id]);

  return (
    <div className="space-y-3 font-mono text-xs">
      {/* Header Bar */}
      <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span className="font-bold uppercase tracking-wide text-zinc-200">
            Receipt Timeline Audit Chain
          </span>
          <span className="text-[10px] bg-zinc-800 text-zinc-400 border border-zinc-700 px-2 py-0.5 rounded font-bold">
            {receipts.length} Events
          </span>
        </div>

        <button
          type="button"
          onClick={toggleExpandAll}
          className="text-[11px] text-zinc-400 hover:text-white flex items-center gap-1 transition-colors"
        >
          {allExpanded ? 'Collapse All Payloads' : 'Expand All Payloads'}
        </button>
      </div>

      {/* Vertical Timeline Container */}
      <div className="relative pl-6 space-y-4 before:absolute before:left-2.5 before:top-2.5 before:bottom-2.5 before:w-0.5 before:bg-zinc-800">
        {receipts.map((rcp, idx) => {
          const isExpanded = expandedIds[rcp.id];
          const config = getStatusColorConfig(rcp.receiptType);

          // Extract action or summary from payload
          let actionLabel = rcp.payload?.action || rcp.payload?.summary || rcp.receiptType;
          if (typeof actionLabel === 'object') {
            actionLabel = JSON.stringify(actionLabel);
          }

          return (
            <div key={rcp.id} className="relative group">
              {/* Timeline Node Dot */}
              <div
                className={`absolute -left-[22px] top-1 w-3.5 h-3.5 rounded-full ${config.dotBg} ring-4 ${config.ringBg} flex items-center justify-center shadow-sm z-10`}
              />

              {/* Receipt Content Card */}
              <div className="bg-zinc-950 border border-zinc-800/90 rounded-lg p-3 space-y-2 hover:border-zinc-700/80 transition-colors shadow-sm">
                {/* Header Row */}
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[10px] text-zinc-500 font-bold">#{idx + 1}</span>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded border font-bold flex items-center gap-1 shrink-0 ${config.badgeBg}`}
                    >
                      {config.icon}
                      {rcp.receiptType}
                    </span>
                    <span className="text-zinc-200 font-bold truncate text-[11px]">
                      {actionLabel}
                    </span>
                  </div>

                  {/* Timestamp */}
                  <div className="flex items-center gap-1.5 text-zinc-400 text-[10px] shrink-0">
                    <Clock className="w-3 h-3 text-zinc-500" />
                    <span>{formatTimestamp(rcp.issuedAt)}</span>
                  </div>
                </div>

                {/* Cryptographic Hash Line */}
                <div className="flex items-center justify-between text-[10px] text-zinc-500 pt-1 border-t border-zinc-900 flex-wrap gap-1">
                  <div className="flex items-center gap-1.5 font-mono">
                    <Hash className="w-3 h-3 text-emerald-400" />
                    <span>Hash:</span>
                    <span className="text-emerald-400/90 font-bold">
                      {rcp.hash.length > 20 ? `${rcp.hash.substring(0, 16)}...` : rcp.hash}
                    </span>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(rcp.hash)}
                      className="text-zinc-500 hover:text-zinc-300 p-0.5 rounded transition-colors"
                      title="Copy full cryptographic hash"
                    >
                      {copiedHash === rcp.hash ? (
                        <Check className="w-3 h-3 text-emerald-400" />
                      ) : (
                        <Copy className="w-3 h-3" />
                      )}
                    </button>
                  </div>

                  {rcp.previousHash && (
                    <div className="text-zinc-600 font-mono text-[9px] flex items-center gap-1">
                      <span>Prev: {rcp.previousHash.substring(0, 10)}...</span>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => toggleExpand(rcp.id)}
                    className="text-blue-400 hover:text-blue-300 font-semibold flex items-center gap-0.5 ml-auto text-[10px]"
                  >
                    {isExpanded ? (
                      <>
                        Hide Payload <ChevronDown className="w-3 h-3" />
                      </>
                    ) : (
                      <>
                        View Payload <ChevronRight className="w-3 h-3" />
                      </>
                    )}
                  </button>
                </div>

                {/* Expandable Raw Payload Drawer */}
                {isExpanded && (
                  <div className="pt-2 border-t border-zinc-800/80 animate-fadeIn">
                    <div className="flex items-center justify-between text-[10px] text-zinc-400 mb-1">
                      <span className="flex items-center gap-1 font-semibold">
                        <FileText className="w-3 h-3 text-blue-400" /> Payload Spec JSON
                      </span>
                      <span className="text-zinc-600 font-mono">Receipt ID: {rcp.id}</span>
                    </div>
                    <pre className="bg-[#08080a] p-2.5 rounded border border-zinc-800 text-[11px] text-zinc-300 overflow-x-auto max-h-48 custom-scrollbar">
                      {JSON.stringify(rcp.payload, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
