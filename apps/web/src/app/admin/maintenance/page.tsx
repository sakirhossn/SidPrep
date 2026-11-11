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
} from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';

export default function AdminMaintenancePage() {
  const [loadingPlan, setLoadingPlan] = useState(false);
  const [loadingExecute, setLoadingExecute] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
          Controlled Production Cleanup & Demo Purge
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          Two-step cryptographic handshake for safely purging demo provenance while preserving official taxonomy and real users.
        </p>
      </div>

      {/* Safety Invariant Notice */}
      <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 shrink-0 mt-0.5 text-emerald-400" />
        <div className="space-y-1">
          <p className="font-semibold text-emerald-300">Immunity Guaranteed</p>
          <p className="text-emerald-400/90 leading-relaxed">
            Staff user accounts, official examination taxonomies (SSC, RRB, WBPSC, IBPS), real candidate accounts, and immutable system audit logs are protected and will <strong>never</strong> be erased.
          </p>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-red-300">Error</p>
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

      {/* Step 1: Scan & Generate Cleanup Plan */}
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
