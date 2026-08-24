import React, { useState, useEffect } from 'react';
import { JenkinsJob, JenkinsBuild } from '../../types';
import { registryApi } from '../../lib/api';
import {
  Rocket,
  ChevronLeft,
  ChevronRight,
  Filter,
  ExternalLink,
  Clock,
  GitBranch,
  User
} from 'lucide-react';

interface JenkinsTableProps {
  searchQuery: string;
  refreshTrigger: number;
}

export const JenkinsTable: React.FC<JenkinsTableProps> = ({
  searchQuery,
  refreshTrigger
}) => {
  const [jobs, setJobs] = useState<JenkinsJob[]>([]);
  const [builds, setBuilds] = useState<Record<string, JenkinsBuild[]>>({});
  const [expandedJob, setExpandedJob] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('all');

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);

    const loadData = async () => {
      try {
        const data = await registryApi.getJenkinsJobs({
          search: searchQuery,
          status: statusFilter
        });

        if (isMounted) {
          setJobs(data);
          // Pre-fetch builds for each job
          const buildMap: Record<string, JenkinsBuild[]> = {};
          for (const job of data) {
            const b = await registryApi.getJenkinsBuilds(job.id);
            buildMap[job.id] = b;
          }
          setBuilds(buildMap);
        }
      } catch (err) {
        console.error('Failed fetching Jenkins jobs:', err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    loadData();
    return () => { isMounted = false; };
  }, [searchQuery, statusFilter, refreshTrigger]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'success':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-400 ring-1 ring-emerald-500/30">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            PASS
          </span>
        );
      case 'building':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/10 px-2 py-0.5 text-[10px] font-semibold text-sky-400 ring-1 ring-sky-500/30">
            <span className="h-1.5 w-1.5 rounded-full bg-sky-400 animate-pulse" />
            BUILDING
          </span>
        );
      case 'failure':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/10 px-2 py-0.5 text-[10px] font-semibold text-rose-400 ring-1 ring-rose-500/30">
            <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />
            FAIL
          </span>
        );
      case 'unstable':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-400 ring-1 ring-amber-500/30">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
            UNSTABLE
          </span>
        );
      case 'aborted':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-500/10 px-2 py-0.5 text-[10px] font-semibold text-slate-400 ring-1 ring-slate-500/30">
            <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
            ABORTED
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-500/10 px-2 py-0.5 text-[10px] font-semibold text-slate-400 ring-1 ring-slate-500/30">
            <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
            {status}
          </span>
        );
    }
  };

  const formatDuration = (seconds: number): string => {
    if (seconds < 60) return `${seconds}s`;
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}m ${s}s`;
  };

  return (
    <div className="space-y-4">

      {/* Filter bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="flex items-center gap-1 font-semibold text-[var(--text-secondary)]">
            <Filter className="h-3.5 w-3.5 text-sky-400" />
            <span>Status:</span>
          </span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-main)] px-2.5 py-1 text-sm text-[var(--text-primary)] focus:outline-none"
          >
            <option value="all">All Jobs</option>
            <option value="success">Success</option>
            <option value="building">Building</option>
            <option value="failure">Failure</option>
            <option value="unstable">Unstable</option>
            <option value="aborted">Aborted</option>
          </select>
        </div>

        <div className="text-xs text-[var(--text-secondary)] font-mono">
          {jobs.length} job{jobs.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Jobs Table */}
      <div className="overflow-x-auto rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] shadow-sm">
        <table className="w-full text-left text-sm text-[var(--text-primary)]">
          <thead className="border-b border-[var(--border-color)] bg-[var(--bg-main)]/60 text-[11px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">
            <tr>
              <th className="p-3 w-8"></th>
              <th className="p-3">Job Name</th>
              <th className="p-3">Status</th>
              <th className="p-3">Last Build</th>
              <th className="p-3">Duration</th>
              <th className="p-3">Branch</th>
              <th className="p-3">Triggered By</th>
              <th className="p-3">Last Run</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-[var(--border-color)]">
            {isLoading ? (
              <tr>
                <td colSpan={8} className="p-8 text-center text-[var(--text-secondary)]">
                  Loading CI pipeline jobs...
                </td>
              </tr>
            ) : jobs.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-8 text-center text-[var(--text-secondary)]">
                  No Jenkins jobs match filters.
                </td>
              </tr>
            ) : (
              jobs.map((job) => (
                <React.Fragment key={job.id}>
                  <tr
                    onClick={() => setExpandedJob(expandedJob === job.id ? null : job.id)}
                    className="cursor-pointer hover:bg-[var(--bg-card-hover)] transition-colors"
                  >
                    <td className="p-3 text-[var(--text-secondary)]">
                      {expandedJob === job.id ? '-' : '+'}
                    </td>
                    <td className="p-3">
                      <div>
                        <span className="font-mono font-bold text-sky-400">{job.name}</span>
                        {job.description && (
                          <p className="text-[10px] text-[var(--text-secondary)]">{job.description}</p>
                        )}
                      </div>
                    </td>
                    <td className="p-3">{getStatusBadge(job.status)}</td>
                    <td className="p-3 font-mono font-bold">#{job.lastBuildNumber}</td>
                    <td className="p-3 font-mono text-[var(--text-secondary)]">
                      {formatDuration(job.lastBuildDuration)}
                    </td>
                    <td className="p-3">
                      <span className="flex items-center gap-1 text-xs font-mono text-[var(--text-secondary)]">
                        <GitBranch className="h-3 w-3" />
                        {job.scmBranch}
                      </span>
                    </td>
                    <td className="p-3">
                      <span className="flex items-center gap-1 text-xs text-[var(--text-secondary)]">
                        <User className="h-3 w-3" />
                        {job.triggeredBy}
                      </span>
                    </td>
                    <td className="p-3">
                      <span className="flex items-center gap-1 text-xs text-[var(--text-secondary)]">
                        <Clock className="h-3 w-3" />
                        {new Date(job.lastBuildTimestamp).toLocaleString()}
                      </span>
                    </td>
                  </tr>

                  {/* Expanded build history */}
                  {expandedJob === job.id && builds[job.id] && (
                    <tr>
                      <td colSpan={8} className="bg-[var(--bg-main)]/40 p-0">
                        <div className="px-6 py-3 border-t border-[var(--border-color)]">
                          <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-secondary)] mb-2">
                            Build History
                          </div>
                          <table className="w-full text-xs">
                            <thead className="text-[10px] uppercase text-[var(--text-secondary)]">
                              <tr>
                                <th className="p-1.5 text-left">#</th>
                                <th className="p-1.5 text-left">Status</th>
                                <th className="p-1.5 text-left">Commit</th>
                                <th className="p-1.5 text-left">Duration</th>
                                <th className="p-1.5 text-left">Console</th>
                              </tr>
                            </thead>
                            <tbody>
                              {builds[job.id].map((b) => (
                                <tr key={b.id} className="border-t border-[var(--border-color)]/50">
                                  <td className="p-1.5 font-mono">#{b.buildNumber}</td>
                                  <td className="p-1.5">{getStatusBadge(b.status)}</td>
                                  <td className="p-1.5 font-mono text-[var(--text-secondary)]">{b.commitHash}</td>
                                  <td className="p-1.5 text-[var(--text-secondary)]">{formatDuration(b.duration)}</td>
                                  <td className="p-1.5">
                                    <a
                                      href={b.consoleUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="flex items-center gap-1 text-sky-400 hover:text-sky-300"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <ExternalLink className="h-3 w-3" />
                                      Log
                                    </a>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="text-xs text-[var(--text-secondary)] text-center">
        Jenkins CI Pipeline Registry — {jobs.length} job{jobs.length !== 1 ? 's' : ''} monitored
      </div>
    </div>
  );
};