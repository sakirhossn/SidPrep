'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Users,
  Search,
  ShieldCheck,
  AlertTriangle,
  UserX,
  UserCheck,
  RefreshCw,
  Loader2,
  Filter,
  Globe,
  Smartphone,
  Monitor,
  Trash2,
  X,
  AlertCircle,
  CheckCircle2,
  Clock,
  Eye,
  KeyRound,
} from 'lucide-react';
import { getApiBaseUrl } from '@/lib/api-client';

interface StudentDirectoryRecord {
  id: string;
  firstName?: string;
  lastName?: string;
  isSingleName?: boolean;
  email?: string;
  phone?: string;
  emailMasked: string;
  phoneMasked: string;
  phoneCountryCode?: string;
  targetExams: string[];
  primaryExamId?: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'DELETED';
  isEmailVerified: boolean;
  isProfileComplete?: boolean;
  streakDays: number;
  dailyGoalMinutes: number;
  registrationIp?: string;
  lastLoginIp?: string;
  lastLoginAt?: string;
  loginSource?: 'app' | 'web';
  createdAt: string;
}

export default function AdminUsersPage() {
  const [students, setStudents] = useState<StudentDirectoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [examFilter, setExamFilter] = useState<string>('ALL');

  // Selected Student & Action Dialog
  const [selectedStudent, setSelectedStudent] = useState<StudentDirectoryRecord | null>(null);
  const [actionType, setActionType] = useState<'SUSPEND' | 'ACTIVATE' | 'REVOKE_SESSIONS' | 'DELETE_DATA' | null>(null);
  const [actionReason, setActionReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');

  const getAdminToken = () => {
    if (typeof window === 'undefined') return '';
    return (
      sessionStorage.getItem('sidprep_admin_token') ||
      localStorage.getItem('sidprep_admin_token') ||
      localStorage.getItem('admin_token') ||
      ''
    );
  };

  const fetchStudents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const base = getApiBaseUrl();
      const token = getAdminToken();
      const params = new URLSearchParams();
      if (searchQuery.trim()) params.append('query', searchQuery.trim());
      if (statusFilter !== 'ALL') params.append('status', statusFilter);
      if (examFilter !== 'ALL') params.append('exam', examFilter);

      const res = await fetch(`${base}/v1/admin/users?${params.toString()}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (!res.ok) {
        throw new Error('Failed to load student directory.');
      }

      const data = await res.json();
      setStudents(Array.isArray(data) ? data : data.data || []);
    } catch (err: any) {
      setError(err.message || 'Error querying database for students.');
    } finally {
      setLoading(false);
    }
  }, [searchQuery, statusFilter, examFilter]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchStudents();
    }, 250);
    return () => clearTimeout(timer);
  }, [fetchStudents]);

  const handleOpenAction = (student: StudentDirectoryRecord, type: 'SUSPEND' | 'ACTIVATE' | 'REVOKE_SESSIONS' | 'DELETE_DATA') => {
    setSelectedStudent(student);
    setActionType(type);
    setActionReason('');
    setDeleteConfirmText('');
    setError(null);
  };

  const handleExecuteAction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudent || !actionType) return;

    if (!actionReason || actionReason.trim().length < 5) {
      setError('A verified administrative reason of at least 5 characters is mandatory.');
      return;
    }

    if (actionType === 'DELETE_DATA' && deleteConfirmText !== 'DELETE') {
      setError('Type DELETE exactly in capital letters to confirm permanent deletion.');
      return;
    }

    setActionLoading(true);
    setError(null);
    try {
      const base = getApiBaseUrl();
      const token = getAdminToken();
      const res = await fetch(`${base}/v1/admin/users/${selectedStudent.id}/action`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: actionType,
          reason: actionReason.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error?.message || `Failed to execute ${actionType} on student account.`);
      }

      setSuccessMsg(`Action "${actionType}" completed successfully for student ${selectedStudent.id}.`);
      setSelectedStudent(null);
      setActionType(null);
      await fetchStudents();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-heading font-extrabold text-2xl text-white">Student Directory &amp; Session Controls</h1>
          <p className="text-xs text-slate-400 mt-1">
            Live database query • Privacy-compliant masked PII • Durable suspension, session revocation &amp; GDPR deletion
          </p>
        </div>

        <button
          onClick={fetchStudents}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 border border-slate-700 transition-all self-start sm:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh Directory
        </button>
      </div>

      {/* Notifications */}
      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-xs underline text-slate-400 hover:text-white">
            Dismiss
          </button>
        </div>
      )}

      {successMsg && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg(null)} className="text-xs underline text-slate-400 hover:text-white">
            Dismiss
          </button>
        </div>
      )}

      {/* Search & Filter Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="relative">
          <Search className="absolute left-3.5 top-3 w-4 h-4 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name, email, phone, ID..."
            className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-10 pr-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
          />
        </div>

        <div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500 transition-colors"
          >
            <option value="ALL">All Account Statuses</option>
            <option value="ACTIVE">ACTIVE</option>
            <option value="SUSPENDED">SUSPENDED</option>
            <option value="DELETED">DELETED</option>
          </select>
        </div>

        <div>
          <select
            value={examFilter}
            onChange={(e) => setExamFilter(e.target.value)}
            className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500 transition-colors"
          >
            <option value="ALL">All Target Exams</option>
            <option value="ssc-cgl">SSC CGL</option>
            <option value="rrb-ntpc">RRB NTPC</option>
            <option value="wbpsc-clerkship">WBPSC Clerkship</option>
            <option value="ibps-po">IBPS PO</option>
          </select>
        </div>
      </div>

      {/* Student List Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        {loading ? (
          <div className="p-12 flex flex-col items-center justify-center text-slate-400">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-400 mb-2" />
            <p className="text-xs">Querying database student directory...</p>
          </div>
        ) : students.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-xs">
            No student records match the active search criteria or filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-800/60 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4">Student ID &amp; Name</th>
                  <th className="py-3 px-4">Masked Email &amp; Phone</th>
                  <th className="py-3 px-4">Target Exam(s)</th>
                  <th className="py-3 px-4">IP &amp; Device Details</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Account Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 text-slate-300">
                {students.map((stu) => {
                  const fullName = [stu.firstName, stu.lastName].filter(Boolean).join(' ') || 'Student User';
                  return (
                    <tr key={stu.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="py-3.5 px-4">
                        <span className="font-heading font-bold text-slate-100 block">
                          {fullName}
                        </span>
                        <span className="font-mono text-[11px] text-slate-500">{stu.id}</span>
                      </td>

                      <td className="py-3.5 px-4">
                        <span className="font-mono text-slate-200 block">{stu.emailMasked}</span>
                        <span className="font-mono text-[11px] text-slate-500">{stu.phoneMasked}</span>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="flex flex-wrap gap-1">
                          {stu.targetExams?.map((exam) => (
                            <span
                              key={exam}
                              className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-slate-300 uppercase"
                            >
                              {exam}
                            </span>
                          ))}
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
                          {stu.loginSource === 'web' ? (
                            <Monitor className="w-3.5 h-3.5 text-slate-500" />
                          ) : (
                            <Smartphone className="w-3.5 h-3.5 text-slate-500" />
                          )}
                          <span className="font-mono">{stu.lastLoginIp || stu.registrationIp || '127.0.0.1'}</span>
                        </div>
                        <span className="text-[10px] text-slate-500">
                          {stu.lastLoginAt ? new Date(stu.lastLoginAt).toLocaleDateString() : 'N/A'}
                        </span>
                      </td>

                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            stu.status === 'ACTIVE'
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              : stu.status === 'SUSPENDED'
                              ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                              : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                          }`}
                        >
                          {stu.status}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          {stu.status === 'ACTIVE' ? (
                            <button
                              onClick={() => handleOpenAction(stu, 'SUSPEND')}
                              title="Suspend student access"
                              className="p-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 transition-colors"
                            >
                              <UserX className="w-3.5 h-3.5" />
                            </button>
                          ) : stu.status === 'SUSPENDED' ? (
                            <button
                              onClick={() => handleOpenAction(stu, 'ACTIVATE')}
                              title="Reactivate student account"
                              className="p-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 transition-colors"
                            >
                              <UserCheck className="w-3.5 h-3.5" />
                            </button>
                          ) : null}

                          <button
                            onClick={() => handleOpenAction(stu, 'REVOKE_SESSIONS')}
                            title="Revoke active sessions"
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                          >
                            <KeyRound className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => handleOpenAction(stu, 'DELETE_DATA')}
                            title="Durable GDPR erasure"
                            className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Action Dialog Modal */}
      {selectedStudent && actionType && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl text-white">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
              <div className="flex items-center gap-2">
                <AlertTriangle className={`w-5 h-5 ${actionType === 'DELETE_DATA' ? 'text-rose-500' : 'text-amber-500'}`} />
                <h3 className="font-heading font-bold text-base">
                  {actionType === 'SUSPEND' && 'Suspend Student Account'}
                  {actionType === 'ACTIVATE' && 'Reactivate Student Account'}
                  {actionType === 'REVOKE_SESSIONS' && 'Revoke Active Student Sessions'}
                  {actionType === 'DELETE_DATA' && 'Permanent GDPR Account Erasure'}
                </h3>
              </div>
              <button
                onClick={() => {
                  setSelectedStudent(null);
                  setActionType(null);
                }}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-300 mb-4">
              Target student: <strong className="font-mono text-white">{selectedStudent.id}</strong> ({selectedStudent.emailMasked}).
              {actionType === 'SUSPEND' && ' This will immediately invalidate active tokens and block all protected student requests.'}
              {actionType === 'REVOKE_SESSIONS' && ' This will increment tokenVersion and revoke all current login sessions on all devices.'}
              {actionType === 'DELETE_DATA' && ' WARNING: This permanently anonymizes student personal information, revokes all sessions, and purges credentials.'}
            </p>

            <form onSubmit={handleExecuteAction} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">
                  Mandatory Audit Reason (min 5 characters) <span className="text-rose-400">*</span>
                </label>
                <textarea
                  required
                  rows={2}
                  value={actionReason}
                  onChange={(e) => setActionReason(e.target.value)}
                  placeholder="State the verified administrative or compliance reason..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-600 focus:border-indigo-500 focus:outline-none"
                />
              </div>

              {actionType === 'DELETE_DATA' && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20">
                  <label className="block text-xs font-semibold text-rose-300 mb-1">
                    Type DELETE to confirm permanent erasure:
                  </label>
                  <input
                    type="text"
                    required
                    value={deleteConfirmText}
                    onChange={(e) => setDeleteConfirmText(e.target.value)}
                    placeholder="DELETE"
                    className="w-full bg-slate-950 border border-rose-500/30 rounded-xl px-3 py-2 text-xs text-white font-mono focus:border-rose-500 focus:outline-none"
                  />
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedStudent(null);
                    setActionType(null);
                  }}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={actionLoading}
                  className={`px-4 py-2 rounded-xl text-xs font-bold text-white transition-all disabled:opacity-50 ${
                    actionType === 'DELETE_DATA'
                      ? 'bg-rose-600 hover:bg-rose-500'
                      : actionType === 'SUSPEND'
                      ? 'bg-amber-600 hover:bg-amber-500'
                      : 'bg-indigo-600 hover:bg-indigo-500'
                  }`}
                >
                  {actionLoading ? 'Executing...' : 'Confirm Action'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
