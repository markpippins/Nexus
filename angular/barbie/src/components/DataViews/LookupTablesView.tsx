import React, { useState, useEffect } from 'react';
import { LookupEntry, LookupType } from '../../types';
import { registryApi } from '../../lib/api';
import {
  Database,
  Plus,
  Trash2,
  ChevronLeft,
  ChevronRight,
  ListFilter
} from 'lucide-react';

const LOOKUP_TYPES: { type: LookupType; label: string }[] = [
  { type: 'server-types', label: 'Server Types' },
  { type: 'environments', label: 'Environments' },
  { type: 'operating-systems', label: 'Operating Systems' },
  { type: 'service-types', label: 'Service Types' },
  { type: 'framework-categories', label: 'Framework Categories' },
  { type: 'framework-languages', label: 'Framework Languages' },
  { type: 'library-categories', label: 'Library Categories' },
  { type: 'library-languages', label: 'Library Languages' }
];

interface LookupTablesViewProps {
  refreshTrigger: number;
}

export const LookupTablesView: React.FC<LookupTablesViewProps> = ({ refreshTrigger }) => {
  const [activeType, setActiveType] = useState<LookupType>('server-types');
  const [entries, setEntries] = useState<LookupEntry[]>([]);
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(10);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(false);

  // New lookup entry inline form
  const [isCreating, setIsCreating] = useState(false);
  const [keyInput, setKeyInput] = useState('');
  const [nameInput, setNameInput] = useState('');

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);

    const loadData = async () => {
      try {
        const response = await registryApi.getLookupEntries(activeType, { page, size });
        if (isMounted) {
          setEntries(response.data);
          setTotalItems(response.meta.totalItems);
          setTotalPages(response.meta.totalPages);
        }
      } catch (err) {
        console.error('Failed fetching lookup entries:', err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    loadData();

    return () => {
      isMounted = false;
    };
  }, [activeType, page, size, refreshTrigger]);

  const handleCreateEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!keyInput || !nameInput) return;

    try {
      const created = await registryApi.createLookupEntry(activeType, {
        key: keyInput,
        name: nameInput
      });
      setEntries(prev => [...prev, created]);
      setTotalItems(prev => prev + 1);
      setKeyInput('');
      setNameInput('');
      setIsCreating(false);
    } catch (err: any) {
      alert(`Create lookup entry failed: ${err.message}`);
    }
  };

  const handleDeleteEntry = async (id: string) => {
    if (!window.confirm('Delete this lookup table entry?')) return;
    try {
      await registryApi.deleteLookupEntry(activeType, id);
      setEntries(prev => prev.filter(e => e.id !== id));
      setTotalItems(prev => prev - 1);
    } catch (err: any) {
      alert(`Delete error: ${err.message}`);
    }
  };

  return (
    <div className="space-y-4">
      {/* Lookup Type Pills Bar */}
      <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-3">
        <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-secondary)] block mb-2">
          Select Lookup Table Endpoint:
        </span>

        <div className="flex flex-wrap gap-1.5">
          {LOOKUP_TYPES.map((item) => (
            <button
              key={item.type}
              onClick={() => { setActiveType(item.type); setPage(1); setIsCreating(false); }}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                activeType === item.type
                  ? 'bg-sky-500 text-white shadow ring-1 ring-sky-400'
                  : 'border border-[var(--border-color)] bg-[var(--bg-main)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* Header & New Button */}
      <div className="flex items-center justify-between">
        <h3 className="font-mono text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider">
          Registry Lookup Endpoint: <span className="text-sky-400">/api/v1/registry/{activeType}</span>
        </h3>

        <button
          onClick={() => setIsCreating(!isCreating)}
          className="flex items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-500 shadow"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>Add Lookup Entry</span>
        </button>
      </div>

      {/* Inline Create Form */}
      {isCreating && (
        <form onSubmit={handleCreateEntry} className="rounded-xl border border-sky-500/30 bg-sky-500/10 p-4 space-y-3">
          <h4 className="text-xs font-bold text-sky-400 uppercase tracking-wider">
            Create Entry for {LOOKUP_TYPES.find(t => t.type === activeType)?.label}
          </h4>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 text-xs">
            <input
              type="text"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder="Unique Key (e.g. c6i.2xlarge)"
              className="rounded border border-[var(--border-color)] bg-[var(--bg-main)] p-2 text-[var(--text-primary)] font-mono"
              required
            />

            <input
              type="text"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              placeholder="Display Name (e.g. Compute Optimized Node)"
              className="rounded border border-[var(--border-color)] bg-[var(--bg-main)] p-2 text-[var(--text-primary)]"
              required
            />
          </div>

          <div className="flex justify-end gap-2 text-xs">
            <button
              type="button"
              onClick={() => setIsCreating(false)}
              className="rounded bg-slate-700 px-3 py-1 text-slate-200"
            >
              Cancel
            </button>

            <button
              type="submit"
              className="rounded bg-sky-600 px-3 py-1 font-bold text-white hover:bg-sky-500"
            >
              Save Lookup
            </button>
          </div>
        </form>
      )}

      {/* Data Table */}
      <div className="overflow-x-auto rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] shadow-sm">
        <table className="w-full text-left text-xs text-[var(--text-primary)]">
          <thead className="border-b border-[var(--border-color)] bg-[var(--bg-main)]/60 text-[11px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">
            <tr>
              <th className="p-3">Entry ID</th>
              <th className="p-3">Unique Key</th>
              <th className="p-3">Display Name</th>
              <th className="p-3 text-right">Actions</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-[var(--border-color)]">
            {isLoading ? (
              <tr>
                <td colSpan={4} className="p-8 text-center text-[var(--text-secondary)]">
                  Loading lookup dictionary...
                </td>
              </tr>
            ) : entries.length === 0 ? (
              <tr>
                <td colSpan={4} className="p-8 text-center text-[var(--text-secondary)]">
                  No lookup entries defined for this type.
                </td>
              </tr>
            ) : (
              entries.map((entry) => (
                <tr key={entry.id} className="hover:bg-[var(--bg-card-hover)] transition-colors">
                  <td className="p-3 font-mono text-[var(--text-secondary)]">{entry.id}</td>
                  <td className="p-3 font-mono font-bold text-sky-400">{entry.key}</td>
                  <td className="p-3 font-medium text-[var(--text-primary)]">{entry.name}</td>
                  <td className="p-3 text-right">
                    <button
                      onClick={() => handleDeleteEntry(entry.id)}
                      className="rounded p-1 text-rose-400 hover:bg-rose-500/10"
                      title="Delete Lookup Entry"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-[var(--text-secondary)] px-1">
        <div>Total Entries: {totalItems}</div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="flex h-7 w-7 items-center justify-center rounded border border-[var(--border-color)] bg-[var(--bg-main)] disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="px-2 font-mono text-[var(--text-primary)]">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="flex h-7 w-7 items-center justify-center rounded border border-[var(--border-color)] bg-[var(--bg-main)] disabled:opacity-40"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
