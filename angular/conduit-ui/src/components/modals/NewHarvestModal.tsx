import React, { useState } from 'react';
import { FileCode, X, Plus } from 'lucide-react';

interface NewHarvestModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: { title: string; rawHtmlContent: string; author: string; tags: string[] }) => void;
}

export const NewHarvestModal: React.FC<NewHarvestModalProps> = ({ isOpen, onClose, onSubmit }) => {
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('Agentic-HarvestBot');
  const [tagsStr, setTagsStr] = useState('HTMLTranscript, Decomposition');
  const [rawHtmlContent, setRawHtmlContent] = useState(
    `<article class="harvest-transcript">\n  <h2>Ingested Transcript Session</h2>\n  <p>Discussion on subsystem decomposition and WorkRequest generation.</p>\n</article>`
  );

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !rawHtmlContent.trim()) return;

    const tags = tagsStr
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    onSubmit({ title, author, tags, rawHtmlContent });
    setTitle('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <form
        onSubmit={handleSubmit}
        className="bg-zinc-900 border border-zinc-800 rounded-lg max-w-xl w-full p-6 space-y-4 shadow-2xl text-zinc-100"
      >
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
          <div className="flex items-center gap-2">
            <FileCode className="w-5 h-5 text-indigo-400" />
            <h2 className="font-mono text-sm font-bold text-white uppercase">
              Ingest HTML Harvest Transcript
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
            <label className="block text-zinc-400 mb-1">Transcript Title</label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Security Audit Transcript - Auth & Lease Locks"
              className="w-full bg-zinc-950 border border-zinc-800 rounded p-2 text-zinc-200 outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-zinc-400 mb-1">Author / Ingestion Agent</label>
              <input
                type="text"
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded p-2 text-zinc-200 outline-none"
              />
            </div>
            <div>
              <label className="block text-zinc-400 mb-1">Tags (Comma Separated)</label>
              <input
                type="text"
                value={tagsStr}
                onChange={(e) => setTagsStr(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded p-2 text-zinc-200 outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-zinc-400 mb-1">Raw HTML Transcript Content</label>
            <textarea
              rows={6}
              required
              value={rawHtmlContent}
              onChange={(e) => setRawHtmlContent(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded p-2 text-emerald-300 font-mono text-[11px] outline-none"
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
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-mono text-xs font-bold rounded flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Ingest Transcript</span>
          </button>
        </div>
      </form>
    </div>
  );
};
