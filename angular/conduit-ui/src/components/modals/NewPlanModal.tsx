import React, { useState } from 'react';
import { Kanban, X, Plus } from 'lucide-react';

interface NewPlanModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (title: string, description: string) => void;
}

export const NewPlanModal: React.FC<NewPlanModalProps> = ({ isOpen, onClose, onSubmit }) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    onSubmit(title, description);
    setTitle('');
    setDescription('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <form
        onSubmit={handleSubmit}
        className="bg-zinc-900 border border-zinc-800 rounded-lg max-w-lg w-full p-6 space-y-4 shadow-2xl text-zinc-100"
      >
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
          <div className="flex items-center gap-2">
            <Kanban className="w-5 h-5 text-emerald-400" />
            <h2 className="font-mono text-sm font-bold text-white uppercase">
              Propose New Implementation Plan
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-zinc-400 hover:text-white rounded border border-zinc-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-3 font-mono text-xs">
          <div>
            <label className="block text-zinc-400 mb-1">Plan Title</label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. WRP Kernel Fast In-Process Delta Engine Bridge"
              className="w-full bg-zinc-950 border border-zinc-800 rounded p-2 text-zinc-200 outline-none"
            />
          </div>

          <div>
            <label className="block text-zinc-400 mb-1">Plan Description & Objectives</label>
            <textarea
              rows={4}
              required
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe technical implementation scope and expected WorkRequest deliverables..."
              className="w-full bg-zinc-950 border border-zinc-800 rounded p-2 text-zinc-200 font-sans outline-none text-xs"
            />
          </div>
        </div>

        <div className="pt-2 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-mono text-xs rounded"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-mono text-xs font-bold rounded flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Propose Plan</span>
          </button>
        </div>
      </form>
    </div>
  );
};
