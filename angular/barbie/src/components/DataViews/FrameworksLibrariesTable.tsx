import React, { useState, useEffect } from 'react';
import { Framework, Library } from '../../types';
import { registryApi } from '../../lib/api';
import {
  Code,
  Package,
  Plus,
  Edit2,
  Trash2,
  ShieldAlert,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';

interface FrameworksLibrariesTableProps {
  searchQuery: string;
  refreshTrigger: number;
}

export const FrameworksLibrariesTable: React.FC<FrameworksLibrariesTableProps> = ({
  searchQuery,
  refreshTrigger
}) => {
  const [activeTab, setActiveTab] = useState<'frameworks' | 'libraries'>('frameworks');
  const [frameworks, setFrameworks] = useState<Framework[]>([]);
  const [libraries, setLibraries] = useState<Library[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // New framework / library simple inline form states
  const [isCreating, setIsCreating] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [categoryInput, setCategoryInput] = useState('');
  const [langInput, setLangInput] = useState('');
  const [versionInput, setVersionInput] = useState('');

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);

    const loadData = async () => {
      try {
        if (activeTab === 'frameworks') {
          const res = await registryApi.getFrameworks({ search: searchQuery });
          if (isMounted) setFrameworks(res.data);
        } else {
          const res = await registryApi.getLibraries({ search: searchQuery });
          if (isMounted) setLibraries(res.data);
        }
      } catch (err) {
        console.error('Failed fetching frameworks/libraries:', err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    loadData();

    return () => {
      isMounted = false;
    };
  }, [activeTab, searchQuery, refreshTrigger]);

  const handleCreateEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nameInput) return;

    try {
      if (activeTab === 'frameworks') {
        const created = await registryApi.createFramework({
          name: nameInput,
          category: categoryInput || 'Backend Framework',
          language: langInput || 'TypeScript',
          version: versionInput || '1.0.0'
        });
        setFrameworks(prev => [...prev, created]);
      } else {
        const created = await registryApi.createLibrary({
          name: nameInput,
          category: categoryInput || 'Utility Library',
          language: langInput || 'TypeScript',
          version: versionInput || '1.0.0',
          vulnerabilitiesCount: 0
        });
        setLibraries(prev => [...prev, created]);
      }

      setNameInput('');
      setCategoryInput('');
      setLangInput('');
      setVersionInput('');
      setIsCreating(false);
    } catch (err: any) {
      alert(`Create error: ${err.message}`);
    }
  };

  const handleDeleteFramework = async (id: string) => {
    if (!window.confirm('Delete this framework entry?')) return;
    try {
      await registryApi.deleteFramework(id);
      setFrameworks(prev => prev.filter(f => f.id !== id));
    } catch (err: any) {
      alert(`Delete error: ${err.message}`);
    }
  };

  const handleDeleteLibrary = async (id: string) => {
    if (!window.confirm('Delete this library entry?')) return;
    try {
      await registryApi.deleteLibrary(id);
      setLibraries(prev => prev.filter(l => l.id !== id));
    } catch (err: any) {
      alert(`Delete error: ${err.message}`);
    }
  };

  return (
    <div className="space-y-4">
      {/* Tab Selector & Create Button */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setActiveTab('frameworks'); setIsCreating(false); }}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
              activeTab === 'frameworks'
                ? 'bg-sky-500 text-white shadow'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Code className="h-3.5 w-3.5" />
            <span>Frameworks Registry</span>
          </button>

          <button
            onClick={() => { setActiveTab('libraries'); setIsCreating(false); }}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
              activeTab === 'libraries'
                ? 'bg-sky-500 text-white shadow'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Package className="h-3.5 w-3.5" />
            <span>Libraries & Dependencies</span>
          </button>
        </div>

        <button
          onClick={() => setIsCreating(!isCreating)}
          className="flex items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white shadow hover:bg-sky-500"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>Add {activeTab === 'frameworks' ? 'Framework' : 'Library'}</span>
        </button>
      </div>

      {/* Inline Create Form */}
      {isCreating && (
        <form onSubmit={handleCreateEntry} className="rounded-xl border border-sky-500/30 bg-sky-500/10 p-4 space-y-3">
          <h4 className="text-xs font-bold text-sky-400 uppercase tracking-wider">
            Register New {activeTab === 'frameworks' ? 'Framework' : 'Library'}
          </h4>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4 text-xs">
            <input
              type="text"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              placeholder="Name (e.g. Spring Boot)"
              className="rounded border border-[var(--border-color)] bg-[var(--bg-main)] p-2 text-[var(--text-primary)]"
              required
            />
            <input
              type="text"
              value={categoryInput}
              onChange={(e) => setCategoryInput(e.target.value)}
              placeholder="Category (e.g. Web Framework)"
              className="rounded border border-[var(--border-color)] bg-[var(--bg-main)] p-2 text-[var(--text-primary)]"
            />
            <input
              type="text"
              value={langInput}
              onChange={(e) => setLangInput(e.target.value)}
              placeholder="Language (e.g. Java 21)"
              className="rounded border border-[var(--border-color)] bg-[var(--bg-main)] p-2 text-[var(--text-primary)]"
            />
            <input
              type="text"
              value={versionInput}
              onChange={(e) => setVersionInput(e.target.value)}
              placeholder="Version (e.g. 3.2.0)"
              className="rounded border border-[var(--border-color)] bg-[var(--bg-main)] p-2 text-[var(--text-primary)]"
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
              Save Entry
            </button>
          </div>
        </form>
      )}

      {/* Data Table */}
      <div className="overflow-x-auto rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] shadow-sm">
        <table className="w-full text-left text-xs text-[var(--text-primary)]">
          <thead className="border-b border-[var(--border-color)] bg-[var(--bg-main)]/60 text-[11px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">
            <tr>
              <th className="p-3">Name</th>
              <th className="p-3">Category</th>
              <th className="p-3">Language & Ecosystem</th>
              <th className="p-3">Version Tag</th>
              {activeTab === 'libraries' && <th className="p-3">CVE Vulnerabilities</th>}
              <th className="p-3 text-right">Actions</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-[var(--border-color)]">
            {activeTab === 'frameworks' ? (
              frameworks.map((fw) => (
                <tr key={fw.id} className="hover:bg-[var(--bg-card-hover)] transition-colors">
                  <td className="p-3 font-mono font-bold text-sky-400">{fw.name}</td>
                  <td className="p-3">{fw.category}</td>
                  <td className="p-3 font-medium">{fw.language}</td>
                  <td className="p-3 font-mono">{fw.version}</td>
                  <td className="p-3 text-right">
                    <button
                      onClick={() => handleDeleteFramework(fw.id)}
                      className="rounded p-1 text-rose-400 hover:bg-rose-500/10"
                      title="Delete"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              libraries.map((lib) => (
                <tr key={lib.id} className="hover:bg-[var(--bg-card-hover)] transition-colors">
                  <td className="p-3 font-mono font-bold text-sky-400">{lib.name}</td>
                  <td className="p-3">{lib.category}</td>
                  <td className="p-3 font-medium">{lib.language}</td>
                  <td className="p-3 font-mono">{lib.version}</td>
                  <td className="p-3">
                    {lib.vulnerabilitiesCount > 0 ? (
                      <span className="flex items-center gap-1 font-mono font-bold text-rose-400">
                        <ShieldAlert className="h-3.5 w-3.5" />
                        <span>{lib.vulnerabilitiesCount} CVE Found</span>
                      </span>
                    ) : (
                      <span className="font-mono text-emerald-400">0 Security Issues</span>
                    )}
                  </td>
                  <td className="p-3 text-right">
                    <button
                      onClick={() => handleDeleteLibrary(lib.id)}
                      className="rounded p-1 text-rose-400 hover:bg-rose-500/10"
                      title="Delete"
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
    </div>
  );
};
