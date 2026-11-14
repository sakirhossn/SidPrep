'use client';

import { useState } from 'react';
import {
  Trash2,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  ShieldCheck,
  HelpCircle,
  FileSpreadsheet,
  Newspaper,
  HardDrive,
  Users,
  Award,
  KeyRound,
  FileCheck,
  Lock,
  Flame,
  CheckSquare,
} from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';

export default function AdminMaintenancePage() {
  const [loadingPlan, setLoadingPlan] = useState(false);
  const [loadingExecute, setLoadingExecute] = useState(false);
  const [loadingQuickPurge, setLoadingQuickPurge] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Quick Purge state
  const [quickPassword, setQuickPassword] = useState('');
  const [clearQuestions, setClearQuestions] = useState(true);
  const [clearTests, setClearTests] = useState(true);
  const [clearNews, setClearNews] = useState(true);
  const [clearResources, setClearResources] = useState(true);
  const [clearAttempts, setClearAttempts] = useState(true);
  const [clearStudents, setClearStudents] = useState(true);
  const [purgeAllContent, setPurgeAllContent] = useState(false);

  // Handshake Step 1: Cleanup Plan
  const [cleanupPlan, setCleanupPlan] = useState<{
    planId: string;
    token: string;
    summary: {
      questions: number;
      tests: number;
      attempts: number;
      news: number;
      resources: number;
      demoStudents: number;
      total: number;
    };
    expiresInSeconds: number;
  } | null>(null);

  // Handshake Step 2: Form Inputs
  const [password, setPassword] = useState('');
  const [confirmationText, setConfirmationText] = useState('');
  const [manifestResult, setManifestResult] = useState<{
    manifestId: string;
    deletedCount: number;
    message: string;
  } | null>(null);

  const handleQuickPurge = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickPassword) {
      setError('Super administrator password is required to authorize purge.');
      return;
    }

    setError(null);
    setManifestResult(null);
    setLoadingQuickPurge(true);

    try {
      const token =
        sessionStorage.getItem('sidprep_admin_token') ||
        localStorage.getItem('sidprep_admin_token');

      const res = await fetch(`${API_BASE}/v1/admin/maintenance/purge-demo`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          password: quickPassword,
          clearQuestions,
          clearTests,
          clearNews,
          clearResources,
          clearAttempts,
          clearStudents,
          purgeAllContent,
        }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error?.message || 'Failed to purge dummy data.');
      }

      setManifestResult({
        manifestId: `purge_${Date.now()}`,
        deletedCount: data.clearedCount ?? 0,
        message: data.message || 'All dummy data purged successfully.',
      });
      setQuickPassword('');
    } catch (err: any) {
      setError(err.message || 'Error purging dummy data');
    } finally {
      setLoadingQuickPurge(false);
    }
  };

  const handleGeneratePlan = async () => {
    setError(null);
    setManifestResult(null);
    setLoadingPlan(true);

    try {
      const token =
        sessionStorage.getItem('sidprep_admin_token') ||
        localStorage.getItem('sidprep_admin_token');

      const res = await fetch(`${API_BASE}/v1/admin/maintenance/cleanup-plan`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error?.message || 'Failed to generate cleanup plan.');
      }

      setCleanupPlan(data);
    } catch (err: any) {
      setError(err.message || 'Error generating cleanup plan');
    } finally {
      setLoadingPlan(false);
    }
  };

  const handleExecuteCleanup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cleanupPlan) return;

    if (confirmationText !== 'CONFIRM PURGE DEMO PROVENANCE') {
      setError('Please type the exact confirmation phrase: CONFIRM PURGE DEMO PROVENANCE');
      return;
    }

    if (!password) {
      setError('Super administrator re-authentication password is required.');
      return;
    }

    setError(null);
    setLoadingExecute(true);

    try {
      const token =
        sessionStorage.getItem('sidprep_admin_token') ||
        localStorage.getItem('sidprep_admin_token');

      const res = await fetch(`${API_BASE}/v1/admin/maintenance/cleanup-execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          token: cleanupPlan.token,
          password,
          confirmation: confirmationText,
        }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error?.message || 'Failed to execute cleanup operation.');
      }

      setManifestResult({
        manifestId: data.manifestId,
        deletedCount: data.deletedCount ?? 0,
        message: data.message || 'Controlled cleanup completed successfully.',
      });
      setCleanupPlan(null);
      setPassword('');
      setConfirmationText('');
    } catch (err: any) {
      setError(err.message || 'Error executing cleanup operation');
    } finally {
      setLoadingExecute(false);
    }
  };

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div>
        <h1 className="font-heading font-extrabold text-xl text-white flex items-center gap-2">
          <Trash2 className="w-5 h-5 text-red-500" />
          Production Database Maintenance & Data Purge
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          Safely remove synthetic seed data, dummy questions, mock tests, and test attempts while preserving official exam taxonomy and staff accounts.
        </p>
      </div>

      {/* Safety Invariant Notice */}
      <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 shrink-0 mt-0.5 text-emerald-400" />
        <div className="space-y-1">
          <p className="font-semibold text-emerald-300">Immunity Guaranteed</p>
          <p className="text-emerald-400/90 leading-relaxed">
            Staff administrator accounts, official exam taxonomy blueprints (SSC, RRB, WBPSC, IBPS), verified syllabus topics, and audit logs are protected and will <strong>never</strong> be erased.
          </p>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-red-300">Operation Alert</p>
            <p className="mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {/* Success Manifest Banner */}
      {manifestResult && (
        <div className="p-5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-start gap-3">
          <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5 text-emerald-400" />
          <div className="space-y-1.5">
            <p className="font-bold text-sm text-emerald-300">Cleanup Executed Successfully</p>
            <p className="text-emerald-300/90">{manifestResult.message}</p>
            <div className="pt-2 flex flex-wrap items-center gap-3 text-[11px] font-mono text-emerald-200">
              <span className="px-2 py-1 bg-emerald-950/60 rounded border border-emerald-800">
                Manifest ID: {manifestResult.manifestId}
              </span>
              <span className="px-2 py-1 bg-emerald-950/60 rounded border border-emerald-800">
                Records Purged: {manifestResult.deletedCount}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* QUICK PURGE CARD (Option: Delete All Dummy Data) */}
      <form onSubmit={handleQuickPurge} className="p-6 rounded-2xl bg-slate-900 border border-red-900/50 space-y-4 shadow-xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-red-500/10 text-red-400">
              <Flame className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-heading font-bold text-base text-white">
                Delete All Dummy Data
              </h2>
              <p className="text-xs text-slate-400">
                Immediate production purge to reset dummy learners, test attempts, news drafts, and sample questions back to zero.
              </p>
            </div>
          </div>
        </div>

        {/* Scope Checkboxes */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
          <label className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-800/60 border border-slate-700/60 text-xs text-slate-200 cursor-pointer hover:bg-slate-800">
            <input
              type="checkbox"
              checked={clearQuestions}
              onChange={(e) => setClearQuestions(e.target.checked)}
              className="rounded border-slate-700 text-red-500 focus:ring-0"
            />
            <span>Delete Dummy Questions & Answers</span>
          </label>

          <label className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-800/60 border border-slate-700/60 text-xs text-slate-200 cursor-pointer hover:bg-slate-800">
            <input
              type="checkbox"
              checked={clearTests}
              onChange={(e) => setClearTests(e.target.checked)}
              className="rounded border-slate-700 text-red-500 focus:ring-0"
            />
            <span>Delete Dummy Mock Tests</span>
          </label>

          <label className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-800/60 border border-slate-700/60 text-xs text-slate-200 cursor-pointer hover:bg-slate-800">
            <input
              type="checkbox"
              checked={clearNews}
              onChange={(e) => setClearNews(e.target.checked)}
              className="rounded border-slate-700 text-red-500 focus:ring-0"
            />
            <span>Delete Dummy News Drafts</span>
          </label>

          <label className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-800/60 border border-slate-700/60 text-xs text-slate-200 cursor-pointer hover:bg-slate-800">
            <input
              type="checkbox"
              checked={clearResources}
              onChange={(e) => setClearResources(e.target.checked)}
              className="rounded border-slate-700 text-red-500 focus:ring-0"
            />
            <span>Delete Dummy PDF Resources</span>
          </label>

          <label className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-800/60 border border-slate-700/60 text-xs text-slate-200 cursor-pointer hover:bg-slate-800">
            <input
              type="checkbox"
              checked={clearAttempts}
              onChange={(e) => setClearAttempts(e.target.checked)}
              className="rounded border-slate-700 text-red-500 focus:ring-0"
            />
            <span>Delete Mock Attempts (Reset to 0)</span>
          </label>

          <label className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-800/60 border border-slate-700/60 text-xs text-slate-200 cursor-pointer hover:bg-slate-800">
            <input
              type="checkbox"
              checked={clearStudents}
              onChange={(e) => setClearStudents(e.target.checked)}
              className="rounded border-slate-700 text-red-500 focus:ring-0"
            />
            <span>Delete Demo Students (Reset to 0)</span>
          </label>
        </div>

        {/* Purge All Content checkbox */}
        <div className="p-3 rounded-xl bg-red-950/20 border border-red-900/40">
          <label className="flex items-center gap-2.5 text-xs text-red-300 cursor-pointer font-medium">
            <input
              type="checkbox"
              checked={purgeAllContent}
              onChange={(e) => setPurgeAllContent(e.target.checked)}
              className="rounded border-red-700 text-red-600 focus:ring-0"
            />
            <span>Complete Clean Slate: Reset all questions, tests, attempts, and news to 0 (Keep staff & taxonomy)</span>
          </label>
        </div>

        {/* Super Admin Password Re-auth */}
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1.5">
            Super Administrator Password
          </label>
          <input
            type="password"
            required
            value={quickPassword}
            onChange={(e) => setQuickPassword(e.target.value)}
            placeholder="Enter your administrative password to authorize"
            className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs focus:ring-2 focus:ring-red-500 outline-none"
          />
        </div>

        <button
          type="submit"
          disabled={loadingQuickPurge || !quickPassword}
          className="w-full py-3 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-40 text-white font-heading font-bold text-xs shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer"
        >
          {loadingQuickPurge ? (
            <>
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              Purging all selected dummy data...
            </>
          ) : (
            <>
              <Trash2 className="w-4 h-4" />
              Delete All Dummy Data Now
            </>
          )}
        </button>
      </form>

      {/* Step 1: Scan & Generate Cleanup Plan (Handshake Protocol) */}
      <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-primary/20 text-primary font-bold text-xs flex items-center justify-center">
            1
          </div>
          <h2 className="font-heading font-bold text-sm text-white">
            Dry-Run Scan & Plan Generation
          </h2>
        </div>
        <p className="text-xs text-slate-400 leading-relaxed">
          Inspects PostgreSQL tables for demo flags, temporary test records, and synthetic drafts. Generates a signed 10-minute token without altering any data.
        </p>

        <button
          onClick={handleGeneratePlan}
          disabled={loadingPlan}
          className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-heading font-bold text-xs border border-slate-700 shadow-sm transition-all flex items-center gap-2"
        >
          {loadingPlan ? (
            <>
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-primary" />
              Scanning database provenance...
            </>
          ) : (
            <>
              <FileCheck className="w-4 h-4 text-primary" />
              Generate Controlled Cleanup Plan
            </>
          )}
        </button>

        {/* Scan Summary Display */}
        {cleanupPlan && (
          <div className="mt-4 p-4 rounded-xl bg-slate-800/80 border border-slate-700 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-white flex items-center gap-1.5">
                <FileCheck className="w-4 h-4 text-emerald-400" />
                Active Plan: <span className="font-mono text-primary-300">{cleanupPlan.planId}</span>
              </span>
              <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px] font-semibold border border-amber-500/30">
                Expires in {Math.floor(cleanupPlan.expiresInSeconds / 60)} min
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-1">
              <div className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800">
                <div className="text-[10px] text-slate-400">Demo Questions</div>
                <div className="text-sm font-bold text-white font-mono">{cleanupPlan.summary.questions}</div>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800">
                <div className="text-[10px] text-slate-400">Demo Mock Tests</div>
                <div className="text-sm font-bold text-white font-mono">{cleanupPlan.summary.tests}</div>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800">
                <div className="text-[10px] text-slate-400">Demo Test Attempts</div>
                <div className="text-sm font-bold text-white font-mono">{cleanupPlan.summary.attempts}</div>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800">
                <div className="text-[10px] text-slate-400">Demo News Drafts</div>
                <div className="text-sm font-bold text-white font-mono">{cleanupPlan.summary.news}</div>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800">
                <div className="text-[10px] text-slate-400">Demo Resources</div>
                <div className="text-sm font-bold text-white font-mono">{cleanupPlan.summary.resources}</div>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800">
                <div className="text-[10px] text-slate-400">Demo Candidates</div>
                <div className="text-sm font-bold text-white font-mono">{cleanupPlan.summary.demoStudents}</div>
              </div>
            </div>

            <div className="pt-2 text-[11px] text-slate-400 flex items-center justify-between border-t border-slate-700/60">
              <span>Total records to be safely purged:</span>
              <span className="font-bold text-white font-mono">{cleanupPlan.summary.total}</span>
            </div>
          </div>
        )}
      </div>

      {/* Step 2: Authenticated Execution Gate */}
      {cleanupPlan && (
        <form onSubmit={handleExecuteCleanup} className="p-6 rounded-2xl bg-slate-900 border border-red-500/30 space-y-4 shadow-xl">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-red-500/20 text-red-400 font-bold text-xs flex items-center justify-center">
              2
            </div>
            <h2 className="font-heading font-bold text-sm text-white">
              Authenticated Execution Gate
            </h2>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            Executing this plan will permanently purge the {cleanupPlan.summary.total} identified records and generate a permanent audit manifest in PostgreSQL.
          </p>

          <div className="space-y-3 pt-1">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Confirmation Phrase
              </label>
              <input
                type="text"
                required
                value={confirmationText}
                onChange={(e) => setConfirmationText(e.target.value)}
                placeholder="Type CONFIRM PURGE DEMO PROVENANCE"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs font-mono focus:ring-2 focus:ring-red-500 outline-none"
              />
              <span className="text-[10px] text-slate-500 mt-1 block">
                Type exactly: <code className="text-slate-300 font-bold">CONFIRM PURGE DEMO PROVENANCE</code>
              </span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Super Administrator Password
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your administrative password"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs focus:ring-2 focus:ring-red-500 outline-none"
              />
            </div>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={loadingExecute || confirmationText !== 'CONFIRM PURGE DEMO PROVENANCE' || !password}
              className="w-full py-3 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-40 text-white font-heading font-bold text-xs shadow-lg transition-all flex items-center justify-center gap-2"
            >
              {loadingExecute ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  Executing controlled purge & recording audit manifest...
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4" />
                  Execute Controlled Production Cleanup
                </>
              )}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
