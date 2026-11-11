'use client';

import React, { useState, useEffect } from 'react';
import {
  User,
  Shield,
  KeyRound,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  LogOut,
  Laptop,
  Smartphone,
  Trash2,
  X,
  Check,
  Lock,
} from 'lucide-react';
import { getStudentToken, setStudentSession, StudentUser } from '@/lib/auth';
import { validatePasswordPolicy } from '@sidprep/contracts';
import { PasswordRequirements } from '@/components/PasswordRequirements';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';

interface SessionRecord {
  id: string;
  ipAddress?: string;
  userAgent?: string;
  loginSource?: string;
  deviceInfo?: any;
  createdAt: string;
  lastSeenAt?: string;
  isCurrent?: boolean;
}

interface StudentProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  student: StudentUser;
  onProfileUpdated: (updatedUser: StudentUser) => void;
}

export function StudentProfileModal({
  isOpen,
  onClose,
  student,
  onProfileUpdated,
}: StudentProfileModalProps) {
  const [activeTab, setActiveTab] = useState<'PROFILE' | 'PASSWORD' | 'SESSIONS'>('PROFILE');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Profile Form State
  const [firstName, setFirstName] = useState(student.firstName || '');
  const [lastName, setLastName] = useState(student.lastName || '');
  const [isSingleName, setIsSingleName] = useState(Boolean(student.isSingleName));
  const [phone, setPhone] = useState(student.phone || '');

  // Change Password State
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // Sessions State
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);

  // Sync state when student prop changes
  useEffect(() => {
    setFirstName(student.firstName || '');
    setLastName(student.lastName || '');
    setIsSingleName(Boolean(student.isSingleName));
    setPhone(student.phone || '');
  }, [student]);

  // Load active sessions when SESSIONS tab is opened
  useEffect(() => {
    if (activeTab === 'SESSIONS' && isOpen) {
      loadSessions();
    }
  }, [activeTab, isOpen]);

  const loadSessions = async () => {
    const token = getStudentToken();
    if (!token) return;
    setSessionsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/v1/me/sessions`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setSessions(data.sessions || []);
      }
    } catch {
      // Ignore
    } finally {
      setSessionsLoading(false);
    }
  };

  if (!isOpen) return null;

  // Handle Profile Update
  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = getStudentToken();
    if (!token) return;

    setError(null);
    setSuccess(null);
    setLoading(true);

    try {
      const res = await fetch(`${API_BASE}/v1/me`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          firstName: firstName.trim(),
          lastName: isSingleName ? '' : lastName.trim(),
          isSingleName,
          phone: phone.trim(),
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(data?.error?.message || 'Failed to update profile.');
      }

      const updated = {
        ...student,
        firstName: data.firstName || firstName.trim(),
        lastName: isSingleName ? '' : (data.lastName || lastName.trim()),
        isSingleName,
        phone: data.phone || phone.trim(),
      };

      setStudentSession(updated, token);
      onProfileUpdated(updated);
      setSuccess('Profile details successfully updated.');
    } catch (err: any) {
      setError(err.message || 'Error updating profile.');
    } finally {
      setLoading(false);
    }
  };

  // Handle Password Change
  const passwordPolicy = validatePasswordPolicy(newPassword);
  const passwordsMatch = newPassword === confirmPassword && confirmPassword.length > 0;
  const canChangePassword =
    currentPassword.length > 0 && passwordPolicy.isValid && passwordsMatch && !loading;

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = getStudentToken();
    if (!token) return;

    if (!passwordPolicy.isValid) {
      setError(passwordPolicy.errors[0] || 'New password does not meet policy requirements.');
      return;
    }
    if (!passwordsMatch) {
      setError('New passwords do not match.');
      return;
    }

    setError(null);
    setSuccess(null);
    setLoading(true);

    try {
      const res = await fetch(`${API_BASE}/v1/auth/student/change-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          currentPassword,
          newPassword,
          confirmPassword,
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(data?.error?.message || 'Failed to change password.');
      }

      // Secure session rotation: update stored access token with new rotated token
      if (data?.accessToken) {
        setStudentSession(student, data.accessToken);
      }

      setSuccess('Password updated successfully! All other sessions have been revoked.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      setError(err.message || 'Error occurred while changing password.');
    } finally {
      setLoading(false);
    }
  };

  // Revoke single session
  const handleRevokeSession = async (sessionId: string) => {
    const token = getStudentToken();
    if (!token) return;

    try {
      const res = await fetch(`${API_BASE}/v1/me/sessions/${sessionId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setSessions((prev) => prev.filter((s) => s.id !== sessionId));
        setSuccess('Session revoked.');
      }
    } catch {
      setError('Failed to revoke session.');
    }
  };

  // Revoke all other sessions
  const handleRevokeOtherSessions = async () => {
    const token = getStudentToken();
    if (!token) return;

    try {
      const res = await fetch(`${API_BASE}/v1/me/sessions`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        await loadSessions();
        setSuccess('All other active sessions have been revoked.');
      }
    } catch {
      setError('Failed to revoke sessions.');
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-xl w-full p-6 sm:p-8 shadow-2xl relative max-h-[90vh] overflow-y-auto">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-6 right-6 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-2xl bg-primary/20 text-primary flex items-center justify-center">
            <User className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-heading font-extrabold text-lg text-white">Student Account &amp; Profile</h2>
            <p className="text-xs text-slate-400">Manage identity, security credentials, and active devices</p>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex gap-2 p-1 bg-slate-800/80 rounded-xl mb-6">
          <button
            type="button"
            onClick={() => {
              setError(null);
              setSuccess(null);
              setActiveTab('PROFILE');
            }}
            className={`flex-1 py-2 text-xs font-heading font-bold rounded-lg transition-all ${
              activeTab === 'PROFILE' ? 'bg-primary text-white shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            Personal Details
          </button>
          <button
            type="button"
            onClick={() => {
              setError(null);
              setSuccess(null);
              setActiveTab('PASSWORD');
            }}
            className={`flex-1 py-2 text-xs font-heading font-bold rounded-lg transition-all ${
              activeTab === 'PASSWORD' ? 'bg-primary text-white shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            Security &amp; Password
          </button>
          <button
            type="button"
            onClick={() => {
              setError(null);
              setSuccess(null);
              setActiveTab('SESSIONS');
            }}
            className={`flex-1 py-2 text-xs font-heading font-bold rounded-lg transition-all ${
              activeTab === 'SESSIONS' ? 'bg-primary text-white shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            Active Sessions
          </button>
        </div>

        {/* Alerts */}
        {error && (
          <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="mb-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{success}</span>
          </div>
        )}

        {/* ================= TAB 1: PROFILE ================= */}
        {activeTab === 'PROFILE' && (
          <form onSubmit={handleProfileSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">First Name</label>
                <input
                  type="text"
                  required
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs focus:ring-2 focus:ring-primary outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Last Name {!isSingleName && '*'}
                </label>
                <input
                  type="text"
                  disabled={isSingleName}
                  required={!isSingleName}
                  value={isSingleName ? '' : lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder={isSingleName ? 'Single name' : ''}
                  className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs disabled:opacity-40 focus:ring-2 focus:ring-primary outline-none"
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                id="modal-single-name"
                type="checkbox"
                checked={isSingleName}
                onChange={(e) => {
                  setIsSingleName(e.target.checked);
                  if (e.target.checked) setLastName('');
                }}
                className="rounded border-slate-700 bg-slate-800 text-primary focus:ring-primary"
              />
              <label htmlFor="modal-single-name" className="text-[11px] text-slate-400 select-none">
                I have only a single legal name
              </label>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Mobile Phone Number</label>
              <div className="flex gap-2">
                <span className="px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-400 text-xs font-mono">
                  +91
                </span>
                <input
                  type="tel"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                  maxLength={10}
                  className="flex-1 px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs focus:ring-2 focus:ring-primary outline-none"
                />
              </div>
            </div>

            {/* Email Address - Protected & Verified Flow Only */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-slate-300">Registered Email Address</label>
                <span className="text-[11px] text-emerald-400 flex items-center gap-1 font-semibold">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Email Verified
                </span>
              </div>
              <input
                type="email"
                disabled
                value={student.email}
                className="w-full px-3 py-2 rounded-xl bg-slate-800/40 border border-slate-700 text-slate-400 text-xs cursor-not-allowed"
              />
              <p className="text-[10px] text-slate-400 mt-1">
                To protect student records, email modifications require identity OTP verification through the dedicated change-email flow.
              </p>
            </div>

            {/* Preparation Target Summary */}
            <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700 text-xs">
              <span className="text-slate-400 block mb-1">Target Exam Focus:</span>
              <div className="flex flex-wrap gap-1.5">
                {(student.targetExams || ['ssc-cgl']).map((ex) => (
                  <span
                    key={ex}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold ${
                      ex === student.primaryExamId
                        ? 'bg-primary/20 text-[#DFF19B] border border-primary/40'
                        : 'bg-slate-700/60 text-slate-300'
                    }`}
                  >
                    {ex.toUpperCase()} {ex === student.primaryExamId && '★ Primary'}
                  </span>
                ))}
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-xl bg-primary hover:bg-primary-600 disabled:opacity-50 text-white font-heading font-bold text-xs shadow transition-all flex items-center justify-center gap-2 mt-4"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  Saving Details...
                </>
              ) : (
                'Save Profile Changes'
              )}
            </button>
          </form>
        )}

        {/* ================= TAB 2: PASSWORD ================= */}
        {activeTab === 'PASSWORD' && (
          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-slate-300">Current Password</label>
                <button
                  type="button"
                  onClick={() => setShowCurrent(!showCurrent)}
                  className="text-[11px] text-slate-400 hover:text-white flex items-center gap-1"
                >
                  {showCurrent ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  {showCurrent ? 'Hide' : 'Show'}
                </button>
              </div>
              <input
                type={showCurrent ? 'text' : 'password'}
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Enter current password"
                className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs focus:ring-2 focus:ring-primary outline-none"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-slate-300">New Password</label>
                <button
                  type="button"
                  onClick={() => setShowNew(!showNew)}
                  className="text-[11px] text-slate-400 hover:text-white flex items-center gap-1"
                >
                  {showNew ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  {showNew ? 'Hide' : 'Show'}
                </button>
              </div>
              <input
                type={showNew ? 'text' : 'password'}
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter 8-14 character new password"
                className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs focus:ring-2 focus:ring-primary outline-none"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-slate-300">Confirm New Password</label>
                <button
                  type="button"
                  onClick={() => setShowConfirm(!showConfirm)}
                  className="text-[11px] text-slate-400 hover:text-white flex items-center gap-1"
                >
                  {showConfirm ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  {showConfirm ? 'Hide' : 'Show'}
                </button>
              </div>
              <input
                type={showConfirm ? 'text' : 'password'}
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter new password"
                className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs focus:ring-2 focus:ring-primary outline-none"
              />
              {confirmPassword.length > 0 && !passwordsMatch && (
                <p className="text-[11px] text-red-400 mt-1">Passwords do not match.</p>
              )}
            </div>

            <PasswordRequirements password={newPassword} />

            <button
              type="submit"
              disabled={!canChangePassword}
              className="w-full py-2.5 rounded-xl bg-primary hover:bg-primary-600 disabled:opacity-50 text-white font-heading font-bold text-xs shadow transition-all flex items-center justify-center gap-2 mt-4"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  Updating Password...
                </>
              ) : (
                <>
                  <KeyRound className="w-3.5 h-3.5" />
                  Update Password &amp; Revoke Other Sessions
                </>
              )}
            </button>
          </form>
        )}

        {/* ================= TAB 3: SESSIONS ================= */}
        {activeTab === 'SESSIONS' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400">
                {sessions.length} active login session(s)
              </span>
              {sessions.length > 1 && (
                <button
                  type="button"
                  onClick={handleRevokeOtherSessions}
                  className="text-xs text-red-400 hover:text-red-300 font-semibold"
                >
                  Revoke all other devices
                </button>
              )}
            </div>

            {sessionsLoading ? (
              <div className="text-center py-6 text-slate-400 text-xs">
                <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-primary" />
                Loading sessions...
              </div>
            ) : sessions.length === 0 ? (
              <div className="p-4 rounded-xl bg-slate-800/60 text-center text-slate-400 text-xs">
                No active session history found.
              </div>
            ) : (
              <div className="space-y-2">
                {sessions.map((sess) => (
                  <div
                    key={sess.id}
                    className="p-3 rounded-xl bg-slate-800/70 border border-slate-700 flex items-center justify-between text-xs"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-slate-700 flex items-center justify-center text-slate-300">
                        {sess.loginSource === 'app' ? (
                          <Smartphone className="w-4 h-4" />
                        ) : (
                          <Laptop className="w-4 h-4" />
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-white">
                            {sess.loginSource === 'app' ? 'Mobile App' : 'Web Browser'}
                          </span>
                          {sess.isCurrent && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400">
                              Current
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-400">
                          IP: {sess.ipAddress || '127.0.0.1'} • Started{' '}
                          {new Date(sess.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>

                    {!sess.isCurrent && (
                      <button
                        type="button"
                        onClick={() => handleRevokeSession(sess.id)}
                        className="text-slate-400 hover:text-red-400 p-1.5 rounded-lg hover:bg-slate-700"
                        title="Revoke session"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
