import React from 'react';
import { BookOpen, X, Copy, Check } from 'lucide-react';

interface ReadmeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ReadmeModal: React.FC<ReadmeModalProps> = ({ isOpen, onClose }) => {
  const [copied, setCopied] = React.useState(false);

  if (!isOpen) return null;

  const readmeContent = `# Execution Observatory — Live Integration & Deployment Guide

This document outlines how to convert this Observability IDE Component from mock mode to a live deployment against an active execution-srv Express instance and PostgreSQL database.

---

## 1. Overview & Architecture

execution-srv provides a read-only observability layer over the execution database schema.

+-------------------------------------------------------------+
|               Observability UI (IDE Component)              |
+-------------------------------------------------------------+
                              |
                              | HTTP REST Requests
                              v
+-------------------------------------------------------------+
|              execution-srv (Express, Port 3110/3000)        |
+-------------------------------------------------------------+
                              |
                              | pg.Pool (search_path=execution)
                              v
+-------------------------------------------------------------+
|               PostgreSQL Database ("nexus")                  |
|   Schemas: execution (write by conduit-mcp), vision          |
+-------------------------------------------------------------+

---

## 2. Environment Configuration

Set the following environment variables when launching execution-srv in production:

- PORT=3110
- PGHOST=localhost
- PGPORT=5432
- PGUSER=pguser
- PGPASSWORD=pgpass
- PGDATABASE=nexus

---

## 3. Database Table Dependencies

Ensure the target PostgreSQL database has the required tables:
1. execution.requests
2. execution.leases
3. execution.attempts
4. execution.receipts
5. vision.receipts

---

## 4. UI Toggle: Mock Mode vs Live API Mode

In the top addressbar:
1. Toggle "API Mode" to "LIVE API".
2. Set "Base URL" to /api/execution or http://localhost:3110/api/execution.
3. The client immediately queries live endpoints.`;

  const handleCopy = () => {
    navigator.clipboard.writeText(readmeContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-lg shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col font-mono text-xs text-slate-200">
        <div className="p-3 border-b border-slate-800 flex items-center justify-between bg-slate-950">
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-blue-400" />
            <span className="font-bold text-slate-100">INTEGRATION_README.md</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 text-[10px] flex items-center gap-1"
            >
              {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>
            <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-100">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="p-4 overflow-y-auto space-y-3 font-sans text-xs text-slate-300 leading-relaxed">
          <pre className="font-mono text-xs text-slate-300 whitespace-pre-wrap bg-slate-950 p-4 rounded border border-slate-800">
            {readmeContent}
          </pre>
        </div>
      </div>
    </div>
  );
};
