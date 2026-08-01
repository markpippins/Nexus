import React, { useState, useEffect } from 'react';
import {
  Kanban,
  X,
  Plus,
  Bookmark,
  Sparkles,
  Save,
  Trash2,
  Check,
  Layers,
  Terminal,
  ShieldCheck,
  Database,
  Cpu,
  Activity,
  Copy,
} from 'lucide-react';

export interface PlanTemplate {
  id: string;
  name: string;
  category: 'Testing' | 'Deployment' | 'Database' | 'Security' | 'AI Optimization' | 'Custom';
  title: string;
  description: string;
  defaultRole?: string;
  defaultModel?: string;
  isCustom?: boolean;
}

const BUILT_IN_TEMPLATES: PlanTemplate[] = [
  {
    id: 'tmpl_testing',
    name: 'Standard Testing & QA Pipeline',
    category: 'Testing',
    title: 'Automated E2E Test Suite & Regression Verification',
    description:
      'Execute cross-browser Playwright regression tests, validate API schema payloads against OpenAPI specs, and run synthetic load tests for 1,000 concurrent RPC connections.',
    defaultRole: 'auditor',
    defaultModel: 'gemini-2.5-flash',
  },
  {
    id: 'tmpl_deployment',
    name: 'Cloud Run Production Canary Rollout',
    category: 'Deployment',
    title: 'CI/CD Container Build & Canary Deployment Workflow',
    description:
      'Trigger Docker multi-stage build, run automated security scans on base image layers, perform blue-green traffic shifting (10% -> 50% -> 100%), and set up latency alert thresholds.',
    defaultRole: 'executor',
    defaultModel: 'gemini-2.5-pro',
  },
  {
    id: 'tmpl_database',
    name: 'Database Migration & Schema Sync',
    category: 'Database',
    title: 'PostgreSQL Drizzle Migration & Index Optimization',
    description:
      'Validate idempotent SQL migration scripts, execute dry-run schema diffing against shadow database, construct B-tree indices on query hot paths, and generate rollback receipts.',
    defaultRole: 'planner',
    defaultModel: 'gemini-2.5-flash',
  },
  {
    id: 'tmpl_security',
    name: 'Security Audit & Compliance Scan',
    category: 'Security',
    title: 'Static Code Analysis & Secret Leak Inspection',
    description:
      'Perform AST vulnerability parsing on imported packages, verify secret key handling in server-side proxy routes, and confirm strict CORS headers on all public API endpoints.',
    defaultRole: 'auditor',
    defaultModel: 'gemini-2.5-pro',
  },
  {
    id: 'tmpl_ai',
    name: 'AI Model Chain & Latency Benchmark',
    category: 'AI Optimization',
    title: 'Multi-Model Cascade Evaluation & Token Optimization',
    description:
      'Benchmark Gemini Flash vs Gemini Pro response accuracy, measure end-to-end TTFT (Time-to-First-Token), configure token budget guards, and record evaluation score receipts.',
    defaultRole: 'planner',
    defaultModel: 'gemini-2.5-pro',
  },
];

const LOCAL_STORAGE_KEY = 'nexus_plan_templates_custom';

interface NewPlanModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (title: string, description: string) => void;
}

export const NewPlanModal: React.FC<NewPlanModalProps> = ({ isOpen, onClose, onSubmit }) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [customTemplates, setCustomTemplates] = useState<PlanTemplate[]>([]);
  const [isSavingCustom, setIsSavingCustom] = useState(false);
  const [customTemplateName, setCustomTemplateName] = useState('');
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('ALL');

  // Load custom templates from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (saved) {
        setCustomTemplates(JSON.parse(saved));
      }
    } catch (err) {
      console.error('Failed to parse custom plan templates from localStorage:', err);
    }
  }, []);

  if (!isOpen) return null;

  // Combined templates
  const allTemplates = [...BUILT_IN_TEMPLATES, ...customTemplates];

  const filteredTemplates = allTemplates.filter((tmpl) => {
    if (selectedCategoryFilter === 'ALL') return true;
    if (selectedCategoryFilter === 'Custom') return tmpl.isCustom;
    return tmpl.category === selectedCategoryFilter;
  });

  const showFeedback = (msg: string) => {
    setFeedbackMsg(msg);
    setTimeout(() => setFeedbackMsg(null), 3000);
  };

  const handleApplyTemplate = (tmpl: PlanTemplate) => {
    setTitle(tmpl.title);
    setDescription(tmpl.description);
    setSelectedTemplateId(tmpl.id);
    showFeedback(`Loaded template: "${tmpl.name}"`);
  };

  const handleSaveCustomTemplate = () => {
    if (!title.trim() || !description.trim() || !customTemplateName.trim()) return;

    const newTmpl: PlanTemplate = {
      id: `custom_${Date.now()}`,
      name: customTemplateName.trim(),
      category: 'Custom',
      title: title.trim(),
      description: description.trim(),
      isCustom: true,
    };

    const updated = [newTmpl, ...customTemplates];
    setCustomTemplates(updated);
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));
    } catch (err) {
      console.error('Failed to save template:', err);
    }

    setCustomTemplateName('');
    setIsSavingCustom(false);
    setSelectedTemplateId(newTmpl.id);
    showFeedback(`Saved custom template: "${newTmpl.name}"`);
  };

  const handleDeleteCustomTemplate = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = customTemplates.filter((t) => t.id !== id);
    setCustomTemplates(updated);
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));
    } catch (err) {
      console.error('Failed to update templates:', err);
    }
    if (selectedTemplateId === id) setSelectedTemplateId(null);
    showFeedback('Deleted custom template.');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    onSubmit(title, description);
    setTitle('');
    setDescription('');
    setSelectedTemplateId(null);
    onClose();
  };

  const getCategoryIcon = (cat: PlanTemplate['category']) => {
    switch (cat) {
      case 'Testing':
        return <Terminal className="w-3.5 h-3.5 text-blue-400" />;
      case 'Deployment':
        return <Activity className="w-3.5 h-3.5 text-emerald-400" />;
      case 'Database':
        return <Database className="w-3.5 h-3.5 text-amber-400" />;
      case 'Security':
        return <ShieldCheck className="w-3.5 h-3.5 text-rose-400" />;
      case 'AI Optimization':
        return <Cpu className="w-3.5 h-3.5 text-cyan-400" />;
      case 'Custom':
      default:
        return <Sparkles className="w-3.5 h-3.5 text-purple-400" />;
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <form
        onSubmit={handleSubmit}
        className="bg-[#141416] border border-zinc-800 rounded-lg max-w-2xl w-full p-6 space-y-4 shadow-2xl text-zinc-100 max-h-[90vh] overflow-y-auto custom-scrollbar"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
          <div className="flex items-center gap-2">
            <Kanban className="w-5 h-5 text-emerald-400" />
            <h2 className="font-mono text-sm font-bold text-white uppercase tracking-wide">
              Propose New Implementation Plan
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-zinc-400 hover:text-white rounded border border-zinc-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Feedback Alert Toast */}
        {feedbackMsg && (
          <div className="bg-emerald-950/80 border border-emerald-700/60 text-emerald-300 text-xs font-mono p-2.5 rounded flex items-center justify-between animate-fadeIn">
            <span className="flex items-center gap-1.5 font-semibold">
              <Check className="w-3.5 h-3.5 text-emerald-400" />
              {feedbackMsg}
            </span>
          </div>
        )}

        {/* PLAN TEMPLATES SECTION */}
        <div className="bg-[#0c0c0e] border border-zinc-800/90 rounded-lg p-3.5 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Bookmark className="w-4 h-4 text-cyan-400" />
              <span className="font-mono text-xs font-bold text-zinc-200 uppercase tracking-wide">
                Plan Templates Catalog
              </span>
              <span className="text-[10px] font-mono text-cyan-400 bg-cyan-950/60 border border-cyan-800/40 px-2 py-0.5 rounded">
                Preset Workflows
              </span>
            </div>

            {/* Category Filter Pills */}
            <div className="flex items-center gap-1 overflow-x-auto text-[10px] font-mono">
              {['ALL', 'Testing', 'Deployment', 'Database', 'Security', 'AI Optimization', 'Custom'].map(
                (cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setSelectedCategoryFilter(cat)}
                    className={`px-2 py-0.5 rounded whitespace-nowrap transition-colors ${
                      selectedCategoryFilter === cat
                        ? 'bg-blue-600 text-white font-bold'
                        : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {cat}
                  </button>
                )
              )}
            </div>
          </div>

          {/* Template Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1 custom-scrollbar">
            {filteredTemplates.length === 0 ? (
              <div className="col-span-2 text-center text-zinc-500 font-mono text-xs py-4">
                No templates in selected category.
              </div>
            ) : (
              filteredTemplates.map((tmpl) => {
                const isSelected = selectedTemplateId === tmpl.id;
                return (
                  <div
                    key={tmpl.id}
                    onClick={() => handleApplyTemplate(tmpl)}
                    className={`p-2.5 rounded border transition-all cursor-pointer flex flex-col justify-between space-y-1.5 ${
                      isSelected
                        ? 'bg-blue-950/40 border-blue-500 shadow-sm'
                        : 'bg-zinc-900/80 border-zinc-800 hover:border-zinc-700 hover:bg-zinc-800/60'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {getCategoryIcon(tmpl.category)}
                        <span className="font-mono text-xs font-bold text-zinc-200 truncate">
                          {tmpl.name}
                        </span>
                      </div>
                      <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-400 border border-zinc-700 shrink-0">
                        {tmpl.category}
                      </span>
                    </div>

                    <p className="text-[11px] text-zinc-400 line-clamp-2 leading-tight">
                      {tmpl.description}
                    </p>

                    <div className="flex items-center justify-between text-[10px] font-mono pt-1 border-t border-zinc-800/60">
                      <span className="text-cyan-400 font-semibold flex items-center gap-1">
                        <Copy className="w-3 h-3" /> Click to Load
                      </span>
                      {tmpl.isCustom && (
                        <button
                          type="button"
                          onClick={(e) => handleDeleteCustomTemplate(tmpl.id, e)}
                          className="text-rose-400 hover:text-rose-300 p-0.5 rounded"
                          title="Delete custom template"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* FORM INPUTS SECTION */}
        <div className="space-y-3 font-mono text-xs">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-zinc-400">Plan Title</label>
              {selectedTemplateId && (
                <span className="text-[10px] text-cyan-400 font-semibold">
                  Loaded from template
                </span>
              )}
            </div>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. WRP Kernel Fast In-Process Delta Engine Bridge"
              className="w-full bg-zinc-950 border border-zinc-800 rounded p-2 text-zinc-200 outline-none focus:border-blue-500 transition-all"
            />
          </div>

          <div>
            <label className="block text-zinc-400 mb-1">Plan Description & Scope</label>
            <textarea
              rows={4}
              required
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe technical implementation scope and expected WorkRequest deliverables..."
              className="w-full bg-zinc-950 border border-zinc-800 rounded p-2 text-zinc-200 font-sans outline-none text-xs focus:border-blue-500 transition-all"
            />
          </div>

          {/* SAVE AS CUSTOM TEMPLATE EXPANDER */}
          {title.trim() && description.trim() && (
            <div className="border-t border-zinc-800/80 pt-2">
              {!isSavingCustom ? (
                <button
                  type="button"
                  onClick={() => setIsSavingCustom(true)}
                  className="text-xs text-amber-400 hover:text-amber-300 flex items-center gap-1.5 font-semibold"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Save current inputs as reusable Custom Template</span>
                </button>
              ) : (
                <div className="bg-zinc-900 border border-amber-800/50 p-3 rounded space-y-2">
                  <div className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                    <Save className="w-3.5 h-3.5" />
                    Save Custom Template
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={customTemplateName}
                      onChange={(e) => setCustomTemplateName(e.target.value)}
                      placeholder="Template Name (e.g. Core Microservice Workflow)"
                      className="flex-1 bg-zinc-950 border border-zinc-800 rounded p-1.5 text-zinc-200 text-xs outline-none"
                    />
                    <button
                      type="button"
                      onClick={handleSaveCustomTemplate}
                      disabled={!customTemplateName.trim()}
                      className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-bold rounded text-xs"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsSavingCustom(false)}
                      className="px-2 py-1.5 bg-zinc-800 text-zinc-400 hover:text-white rounded text-xs"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* FOOTER ACTIONS */}
        <div className="pt-2 flex items-center justify-between gap-2 border-t border-zinc-800">
          <span className="text-[11px] font-mono text-zinc-500 hidden sm:inline">
            Plan will be posted to process ledger
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-mono text-xs rounded transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-mono text-xs font-bold rounded flex items-center gap-1.5 shadow-md transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Propose Implementation Plan</span>
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};
