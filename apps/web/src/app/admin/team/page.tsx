'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  KeyRound,
  UserPlus,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Loader2,
  Trash2,
  UserX,
  UserCheck,
  X,
  Mail,
  User,
  Shield,
  Copy,
  AlertTriangle,
} from 'lucide-react';
import { getApiBaseUrl } from '@/lib/api-client';

interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  is2faEnabled: boolean;
  tokenVersion: number;
  invitedBy?: string | null;
  invitationExpiresAt?: string | null;
  deactivatedAt?: string | null;
  createdAt: string;
}

const ROLES = [
  { value: 'SUPER_ADMIN', label: 'Super Admin', desc: 'Full system, user & financial access' },
  { value: 'CONTENT_MANAGER', label: 'Content Manager', desc: 'Manage questions, mock tests & resources' },
  { value: 'EXAM_EDITOR', label: 'Exam Editor', desc: 'Edit exam taxonomy, syllabus & patterns' },
  { value: 'REVIEWER', label: 'Content Reviewer', desc: 'Peer review and approve content proposals' },
  { value: 'CA_EDITOR', label: 'Current Affairs Editor', desc: 'Ingest, curate & verify news feeds' },
  { value: 'TRANSLATOR', label: 'Bilingual Translator', desc: 'Translate questions and materials' },
  { value: 'SUPPORT', label: 'Student Support Agent', desc: 'Handle student queries & tickets' },
  { value: 'ANALYST', label: 'Academic Analyst', desc: 'Review exam performance and telemetry' },
  { value: 'AUDITOR', label: 'Compliance Auditor', desc: 'Read-only audit logs & governance' },
];

export default function AdminTeamPage() {
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Invite Modal
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [inviteName, setInviteName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('CONTENT_MANAGER');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [invitationTokenResult, setInvitationTokenResult] = useState<string | null>(null);

  // Edit / Action confirmation
  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null);
  const [confirmAction, setConfirmAction] = useState<'REVOKE' | 'TOGGLE_STATUS' | 'DELETE' | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const getAdminToken = () => {
    if (typeof window === 'undefined') return '';
    return (
      sessionStorage.getItem('sidprep_admin_token') ||
      localStorage.getItem('sidprep_admin_token') ||
      localStorage.getItem('admin_token') ||
      ''
    );
  };

  const fetchTeam = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const base = getApiBaseUrl();
      const token = getAdminToken();
      const res = await fetch(`${base}/v1/admin/team`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error?.message || 'Failed to load staff roster.');
      }

      setTeam(data.data || (Array.isArray(data) ? data : []));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTeam();
  }, [fetchTeam]);

  const handleInviteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteName.trim() || !inviteEmail.trim()) {
      setError('Name and valid email are mandatory.');
      return;
    }

    setInviteLoading(true);
    setError(null);
    try {
      const base = getApiBaseUrl();
      const token = getAdminToken();
      const res = await fetch(`${base}/v1/admin/team/invite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: inviteName.trim(),
          email: inviteEmail.trim().toLowerCase(),
          role: inviteRole,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error?.message || 'Failed to provision staff member.');
      }

      setSuccessMsg(`Staff invitation created for ${inviteEmail.trim().toLowerCase()}`);
      setInvitationTokenResult(data.invitationToken || 'Token generated');
      setInviteName('');
      setInviteEmail('');
      await fetchTeam();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setInviteLoading(false);
    }
  };

  const handleExecuteMemberAction = async () => {
    if (!selectedMember || !confirmAction) return;

    setActionLoading(true);
    setError(null);
    try {
      const base = getApiBaseUrl();
      const token = getAdminToken();

      if (confirmAction === 'REVOKE') {
        const res = await fetch(`${base}/v1/admin/team/${selectedMember.id}/revoke`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error?.message || 'Failed to revoke sessions.');
        setSuccessMsg(`All active sessions revoked for ${selectedMember.name}.`);
      } else if (confirmAction === 'TOGGLE_STATUS') {
        const res = await fetch(`${base}/v1/admin/team/${selectedMember.id}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ isActive: !selectedMember.isActive }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error?.message || 'Failed to update status.');
        setSuccessMsg(`Staff member ${selectedMember.name} is now ${!selectedMember.isActive ? 'ACTIVE' : 'DEACTIVATED'}.`);
      } else if (confirmAction === 'DELETE') {
        const res = await fetch(`${base}/v1/admin/team/${selectedMember.id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error?.message || 'Failed to remove staff member.');
        setSuccessMsg(`Staff member ${selectedMember.name} has been removed.`);
      }

      setSelectedMember(null);
      setConfirmAction(null);
      await fetchTeam();
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
          <h1 className="font-heading font-extrabold text-2xl text-white">
            Staff Access &amp; Role-Based Permissions
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Mandatory TOTP 2FA • Granular server-enforced roles • Dual approval controls • Last Super Admin protected
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchTeam}
            className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 border border-slate-700 transition-all"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>

          <button
            onClick={() => {
              setIsInviteOpen(true);
              setInvitationTokenResult(null);
              setError(null);
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-md transition-all"
          >
            <UserPlus className="w-4 h-4" /> Provision Staff Member
          </button>
        </div>
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

      {/* Staff Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        {loading ? (
          <div className="p-12 flex flex-col items-center justify-center text-slate-400">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-400 mb-2" />
            <p className="text-xs">Querying database staff roster...</p>
          </div>
        ) : team.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-xs">
            No administrative accounts found in the database.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-800/60 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
                <tr>
                  <th className="py-3.5 px-5">Staff Member</th>
                  <th className="py-3.5 px-5">Granular Role</th>
                  <th className="py-3.5 px-5">Two-Factor Auth</th>
                  <th className="py-3.5 px-5">Status</th>
                  <th className="py-3.5 px-5">Created</th>
                  <th className="py-3.5 px-5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 text-slate-300">
                {team.map((user) => (
                  <tr key={user.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-4 px-5">
                      <span className="font-heading font-bold text-white block">{user.name}</span>
                      <span className="text-[11px] font-mono text-slate-400">{user.email}</span>
                    </td>

                    <td className="py-4 px-5">
                      <span className={`font-mono text-xs font-bold px-2 py-0.5 rounded ${
                        user.role === 'SUPER_ADMIN'
                          ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                          : user.role === 'AUDITOR'
                          ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                          : 'bg-indigo-500/10 text-indigo-300 border border-indigo-500/20'
                      }`}>
                        {user.role}
                      </span>
                    </td>

                    <td className="py-4 px-5">
                      {user.is2faEnabled ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400">
                          <KeyRound className="w-3.5 h-3.5" /> TOTP ACTIVE (RFC 6238)
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-400">
                          <AlertTriangle className="w-3.5 h-3.5" /> Setup Pending
                        </span>
                      )}
                    </td>

                    <td className="py-4 px-5">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                        user.isActive
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : 'bg-rose-500/20 text-rose-300'
                      }`}>
                        {user.isActive ? 'ACTIVE' : 'DEACTIVATED'}
                      </span>
                    </td>

                    <td className="py-4 px-5 text-slate-400 text-[11px]">
                      {new Date(user.createdAt).toLocaleDateString()}
                    </td>

                    <td className="py-4 px-5 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          onClick={() => {
                            setSelectedMember(user);
                            setConfirmAction('REVOKE');
                          }}
                          title="Revoke active sessions"
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                        >
                          <KeyRound className="w-3.5 h-3.5" />
                        </button>

                        <button
                          onClick={() => {
                            setSelectedMember(user);
                            setConfirmAction('TOGGLE_STATUS');
                          }}
                          title={user.isActive ? 'Deactivate staff account' : 'Reactivate staff account'}
                          className={`p-1.5 rounded-lg transition-colors ${
                            user.isActive
                              ? 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-400'
                              : 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400'
                          }`}
                        >
                          {user.isActive ? <UserX className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
                        </button>

                        <button
                          onClick={() => {
                            setSelectedMember(user);
                            setConfirmAction('DELETE');
                          }}
                          title="Remove staff member"
                          className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Provision Staff Member Modal */}
      {isInviteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl text-white">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
              <div className="flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-indigo-400" />
                <h3 className="font-heading font-bold text-base">Provision New Staff Member</h3>
              </div>
              <button onClick={() => setIsInviteOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            {invitationTokenResult ? (
              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs">
                  <p className="font-bold mb-1">Staff Member Invited Successfully!</p>
                  <p className="text-slate-300">
                    An activation invitation token has been generated. Share this token with the staff member to complete their TOTP setup:
                  </p>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">Invitation Activation Token</label>
                  <div className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-950 border border-slate-800 font-mono text-xs text-indigo-300 select-all break-all">
                    <span>{invitationTokenResult}</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setIsInviteOpen(false)}
                  className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs"
                >
                  Done
                </button>
              </div>
            ) : (
              <form onSubmit={handleInviteSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Full Legal Name</label>
                  <div className="relative">
                    <User className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
                    <input
                      type="text"
                      required
                      value={inviteName}
                      onChange={(e) => setInviteName(e.target.value)}
                      placeholder="e.g. Ramesh Chandra"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-600 focus:border-indigo-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Official Email Address</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
                    <input
                      type="email"
                      required
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      placeholder="name@sidprep.in"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-600 focus:border-indigo-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Administrative Role</label>
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:border-indigo-500 focus:outline-none"
                  >
                    {ROLES.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label} — {r.desc}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setIsInviteOpen(false)}
                    className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={inviteLoading}
                    className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-bold text-white disabled:opacity-50"
                  >
                    {inviteLoading ? 'Creating Invitation...' : 'Send Invitation'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Action Confirmation Modal */}
      {selectedMember && confirmAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl text-white">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
              <div className="flex items-center gap-2">
                <AlertTriangle className={`w-5 h-5 ${confirmAction === 'DELETE' ? 'text-rose-500' : 'text-amber-500'}`} />
                <h3 className="font-heading font-bold text-base">
                  {confirmAction === 'REVOKE' && 'Revoke Staff Sessions'}
                  {confirmAction === 'TOGGLE_STATUS' && `${selectedMember.isActive ? 'Deactivate' : 'Reactivate'} Staff Account`}
                  {confirmAction === 'DELETE' && 'Remove Staff Member'}
                </h3>
              </div>
              <button
                onClick={() => {
                  setSelectedMember(null);
                  setConfirmAction(null);
                }}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-300 mb-4">
              Target staff member: <strong className="text-white">{selectedMember.name}</strong> ({selectedMember.email}) [{selectedMember.role}].
              {confirmAction === 'REVOKE' && ' This will immediately invalidate all active JWT session tokens and force re-authentication.'}
              {confirmAction === 'TOGGLE_STATUS' && ` Are you sure you want to ${selectedMember.isActive ? 'deactivate' : 'reactivate'} this account?`}
              {confirmAction === 'DELETE' && ' WARNING: This permanently removes this staff member account.'}
            </p>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setSelectedMember(null);
                  setConfirmAction(null);
                }}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleExecuteMemberAction}
                disabled={actionLoading}
                className={`px-4 py-2 rounded-xl text-xs font-bold text-white disabled:opacity-50 ${
                  confirmAction === 'DELETE'
                    ? 'bg-rose-600 hover:bg-rose-500'
                    : 'bg-indigo-600 hover:bg-indigo-500'
                }`}
              >
                {actionLoading ? 'Processing...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
