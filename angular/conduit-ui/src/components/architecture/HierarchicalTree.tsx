import React, { useState } from 'react';
import {
  Layers,
  ChevronDown,
  ChevronRight,
  Server,
  Cpu,
  Database,
  FileCode,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import { SystemNode } from '../../types/conduit';

interface HierarchicalTreeProps {
  nodes: SystemNode[];
}

export const HierarchicalTree: React.FC<HierarchicalTreeProps> = ({ nodes }) => {
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({
    'SYS-NEXUS-CORE': true,
    'SYS-CONDUIT': true,
    'SYS-KERNEL': true,
  });

  const toggleNode = (nodeId: string) => {
    setExpandedNodes((prev) => ({
      ...prev,
      [nodeId]: !prev[nodeId],
    }));
  };

  const renderNode = (node: SystemNode, level: number = 0) => {
    const isExpanded = expandedNodes[node.id] ?? false;
    const hasChildren = node.children && node.children.length > 0;

    return (
      <div key={node.id} className="space-y-2">
        <div
          onClick={() => hasChildren && toggleNode(node.id)}
          style={{ paddingLeft: `${level * 24 + 12}px` }}
          className={`p-3 rounded-lg border transition-all flex items-center justify-between cursor-pointer ${
            node.type === 'system'
              ? 'bg-zinc-900 border-indigo-900/60 shadow-md'
              : node.type === 'subsystem'
              ? 'bg-zinc-900/80 border-cyan-900/50'
              : 'bg-zinc-950 border-zinc-800'
          } hover:border-zinc-700`}
        >
          <div className="flex items-center gap-2.5">
            {hasChildren ? (
              isExpanded ? (
                <ChevronDown className="w-4 h-4 text-indigo-400 shrink-0" />
              ) : (
                <ChevronRight className="w-4 h-4 text-zinc-500 shrink-0" />
              )
            ) : (
              <div className="w-4 h-4 shrink-0" />
            )}

            {node.type === 'system' && <Server className="w-4 h-4 text-indigo-400 shrink-0" />}
            {node.type === 'subsystem' && <Database className="w-4 h-4 text-cyan-400 shrink-0" />}
            {node.type === 'module' && <FileCode className="w-4 h-4 text-emerald-400 shrink-0" />}

            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-bold text-zinc-100">{node.name}</span>
                <span className="text-[10px] font-mono text-zinc-500 bg-zinc-800 px-1.5 py-0.2 rounded uppercase">
                  {node.type}
                </span>
                <span className="text-[10px] font-mono text-zinc-600">({node.id})</span>
              </div>
              <p className="text-xs text-zinc-400 font-sans mt-0.5">{node.description}</p>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0 font-mono text-xs">
            <span className="text-purple-400 bg-purple-950/60 px-2 py-0.5 rounded border border-purple-800/40 text-[11px]">
              Specs: {node.linkedSpecsCount}
            </span>
            <span className="text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/40 text-[11px]">
              WorkRequests: {node.linkedWorkRequestsCount}
            </span>
          </div>
        </div>

        {hasChildren && isExpanded && (
          <div className="space-y-2 border-l-2 border-zinc-800/80 ml-6">
            {node.children!.map((child) => renderNode(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1600px] mx-auto text-zinc-100">
      {/* Header */}
      <div className="bg-zinc-900/90 border border-zinc-800 rounded-lg p-4">
        <div className="flex items-center gap-2">
          <Layers className="w-5 h-5 text-indigo-400" />
          <h1 className="text-lg font-mono font-bold tracking-tight text-white uppercase">
            Hierarchical System & Subsystem Architecture
          </h1>
        </div>
        <p className="text-xs text-zinc-400 mt-1">
          Canonical structural mapping from Organization level down to Subsystems, Modules, and Work Requests.
        </p>
      </div>

      <div className="space-y-3">{nodes.map((node) => renderNode(node, 0))}</div>
    </div>
  );
};
