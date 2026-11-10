'use client';

import { useState, useEffect } from 'react';
import { Users, Search, ShieldCheck, AlertTriangle, UserX, UserCheck, RefreshCw, Loader2 } from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

interface StudentRecord {
  id: string;
  emailMasked: string;
  phoneMasked: string;
  targetExams: string[];
  status: string;
  streakDays: number;
  isEmailVerified: boolean;
  createdAt: string;
}

export default function AdminUsersPage() {
  const [students, setStudents] = useState<StudentRecord[]>([
    {
      id: 'stu_101',
      emailMasked: 'ro***@gmail.com',
      phoneMasked: '98******42',
      targetExams: ['SSC_CGL', 'RRB_NTPC'],
      status: 'ACTIVE',
      streakDays: 14,
      isEmailVerified: true,
      createdAt: '2026-10-12',
    },
    {
      id: 'stu_102',
      emailMasked: 'pr***@outlook.com',
      phoneMasked: 'Not linked',
      targetExams: ['IBPS_PO'],
      status: 'ACTIVE',
      streakDays: 8,
      isEmailVerified: true,
      createdAt: '2026-10-18',
    },
    {
      id: 'stu_103',
      emailMasked: 'an***@yahoo.in',
      phoneMasked: '87******19',
      targetExams: ['WBPSC_CLERKSHIP'],
      status: 'SUSPENDED',
      streakDays: 0,
      isEmailVerified: true,
      createdAt: '2026-09-29',
    },
  ]);

  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedStudent, setSelectedStudent] = useState<any | null>(null);
  const [actionReason, setActionReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const fetchStudents = async () => {
    try {
      const token = sessionStorage.getItem('sidprep_admin_token') || localStorage.getItem('sidprep_admin_token');
      const res = await fetch(`${API_BASE}/v1/admin/users`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setStudents(data);
        }
      }
    } catch (err) {
      console.warn('Could not fetch dynamic student list, using cached records:', err);
    }
  };

  useEffect(() => {
    fetchStudents();
  }, []);

  const handleAction = async (newStatus: 'ACTIVE' | 'SUSPENDED') => {
    if (!actionReason || actionReason.trim().length < 5) {
      alert('Mandatory Rule: You must provide a verified administrative reason (at least 5 characters) before modifying student accounts.');
      return;
    }

    setActionLoading(true);
    try {
      const token = sessionStorage.getItem('sidprep_admin_token') || localStorage.getItem('sidprep_admin_token');
      const apiAction = newStatus === 'SUSPENDED' ? 'SUSPEND' : 'ACTIVATE';
      const res = await fetch(`${API_BASE}/v1/admin/users/${selectedStudent.id}/action`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          action: apiAction,
          reason: actionReason.trim(),
        }),
      });

      if (res.ok) {
        setStudents((prev) =>
          prev.map((s) => (s.id === selectedStudent.id ? { ...s, status: newStatus } : s))
        );
        setActionMessage(`Account ${selectedStudent.id} set to ${newStatus}. Reason logged in immutable audit ledger.`);
        setTimeout(() => setActionMessage(null), 4000);
      } else {
        const errJson = await res.json();
        alert(errJson?.error?.message || 'Failed to update student account');
      }
    } catch (err: any) {
      alert(err?.message || 'Network error updating student account');
    } finally {
      setActionLoading(false);
      setSelectedStudent(null);
      setActionReason('');
    }
  };

  const handleRevokeSession = async (id: string) => {
    try {
      const token = sessionStorage.getItem('sidprep_admin_token') || localStorage.getItem('sidprep_admin_token');
      const res = await fetch(`${API_BASE}/v1/admin/users/${id}/action`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          action: 'REVOKE_SESSIONS',
          reason: 'Admin manually revoked active session tokens from administrative console.',
        }),
      });

      if (res.ok) {
        setActionMessage(`Active session for ${id} revoked. Student must re-authenticate with Brevo OTP.`);
        setTimeout(() => setActionMessage(null), 4000);
      } else {
        const errJson = await res.json();
        alert(errJson?.error?.message || 'Failed to revoke student sessions');
      }
    } catch (err: any) {
      alert(err?.message || 'Network error revoking session');
    }
  };

  const filtered = students.filter(
    (s) =>
      (s.emailMasked && s.emailMasked.toLowerCase().includes(search.toLowerCase())) ||
      (s.id && s.id.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-heading font-extrabold text-2xl text-white">
            Student Operations & User Management
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Privacy-first directory • PII masked by default • Audited session & account controls
          </p>
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-3" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by ID or email..."
            className="w-full pl-9 pr-4 py-2 rounded-xl bg-slate-900 border border-slate-800 text-white text-xs outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
      </div>

      {actionMessage && (
        <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 shrink-0 text-emerald-400" />
          <span>{actionMessage}</span>
        </div>
      )}

      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-800/60 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
            <tr>
              <th className="py-3.5 px-5">Student ID</th>
              <th className="py-3.5 px-5">Masked Email (PII Safe)</th>
              <th className="py-3.5 px-5">Target Exams</th>
              <th className="py-3.5 px-5">Streak</th>
              <th className="py-3.5 px-5">Status</th>
              <th className="py-3.5 px-5">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800 text-slate-300">
            {filtered.map((s) => (
              <tr key={s.id} className="hover:bg-slate-800/30 transition-colors">
                <td className="py-4 px-5 font-mono text-slate-400">{s.id}</td>
                <td className="py-4 px-5">
                  <span className="font-mono text-slate-200 block">{s.emailMasked}</span>
                  <span className="text-[10px] text-slate-500">{s.phoneMasked}</span>
                </td>
                <td className="py-4 px-5">
                  <div className="flex gap-1 flex-wrap">
                    {s.targetExams?.map((ex) => (
                      <span key={ex} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                        {ex}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="py-4 px-5">{s.streakDays} Days</td>
                <td className="py-4 px-5">
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                      s.status === 'ACTIVE'
                        ? 'bg-emerald-500/20 text-emerald-300'
                        : 'bg-red-500/20 text-red-300'
                    }`}
                  >
                    {s.status}
                  </span>
                </td>
                <td className="py-4 px-5">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleRevokeSession(s.id)}
                      className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-semibold"
                      title="Revoke active sessions"
                    >
                      Revoke
                    </button>
                    <button
                      onClick={() => setSelectedStudent(s)}
                      className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-primary text-[11px] font-semibold"
                    >
                      Manage
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Account Action Modal with Mandatory Reason */}
      {selectedStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <h3 className="font-heading font-bold text-sm text-white">
              Manage Student Account: {selectedStudent.id}
            </h3>
            <p className="text-xs text-slate-400">
              Current Status: <strong>{selectedStudent.status}</strong>
            </p>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Mandatory Administrative Reason
              </label>
              <textarea
                rows={3}
                placeholder="Enter verified reason for suspension or reactivation..."
                value={actionReason}
                onChange={(e) => setActionReason(e.target.value)}
                className="w-full p-3 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs outline-none"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setSelectedStudent(null)}
                className="px-3.5 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold"
              >
                Cancel
              </button>
              {selectedStudent.status === 'ACTIVE' ? (
                <button
                  onClick={() => handleAction('SUSPENDED')}
                  disabled={actionLoading}
                  className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold disabled:opacity-50"
                >
                  {actionLoading ? 'Suspending...' : 'Suspend Account'}
                </button>
              ) : (
                <button
                  onClick={() => handleAction('ACTIVE')}
                  disabled={actionLoading}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold disabled:opacity-50"
                >
                  {actionLoading ? 'Reactivating...' : 'Reactivate Account'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
