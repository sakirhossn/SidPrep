'use client';

import { useState, useEffect } from 'react';
import {
  User,
  Shield,
  KeyRound,
  Mail,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Lock,
  BadgeCheck,
  Calendar,
  Smartphone,
  Laptop,
  Trash2,
  X,
  ShieldAlert,
} from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';

interface AdminProfile {
  id: string;
  email: string;
  name: string;
  role: string;
  is2faEnabled: boolean;
  createdAt: string;
}

interface TrustedDevice {
  id: string;
  deviceLabel: string;
  userAgent?: string;
  ipAddress?: string;
  createdAt: string;
  expiresAt: string;
  lastUsedAt?: string;
  isRevoked: boolean;
  revokedAt?: string;
  isCurrent?: boolean;
}

export default function AdminProfilePage() {
  const [profile, setProfile] = useState<AdminProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Profile Edit State
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [updatingProfile, setUpdatingProfile] = useState(false);

  // Password Change State
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [updatingPassword, setUpdatingPassword] = useState(false);

  // Trusted Devices State
  const [devices, setDevices] = useState<TrustedDevice[]>([]);
  const [loadingDevices, setLoadingDevices] = useState(false);
  const [revokingDeviceId, setRevokingDeviceId] = useState<string | null>(null);

  // Step-up MFA State
  const [mfaModalOpen, setMfaModalOpen] = useState(false);
  const [mfaCode, setMfaCode] = useState('');
  const [mfaLoading, setMfaLoading] = useState(false);
  const [mfaError, setMfaError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<(() => Promise<void>) | null>(null);

  const fetchProfile = async () => {
    setLoading(true);
    setError(null);
    try {
      const token =
        sessionStorage.getItem('sidprep_admin_token') ||
        localStorage.getItem('sidprep_admin_token');

      const res = await fetch(`${API_BASE}/v1/admin/profile`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) throw new Error('Failed to load admin profile');
      const data = await res.json();
      setProfile(data);
      setName(data.name);
      setEmail(data.email);
    } catch (err: any) {
      setError(err.message || 'Error fetching profile');
    } finally {
      setLoading(false);
    }
  };

  const fetchTrustedDevices = async () => {
    setLoadingDevices(true);
    try {
      const token =
        sessionStorage.getItem('sidprep_admin_token') ||
        localStorage.getItem('sidprep_admin_token');

      const res = await fetch(`${API_BASE}/v1/auth/admin/trusted-devices`, {
        headers: { Authorization: `Bearer ${token}` },
        credentials: 'include',
      });

      if (res.ok) {
        const data = await res.json();
        setDevices(data.devices || []);
      }
    } catch (err: any) {
      console.warn('Failed to load trusted devices:', err);
    } finally {
      setLoadingDevices(false);
    }
  };

  useEffect(() => {
    fetchProfile();
    fetchTrustedDevices();
  }, []);

  const handleUpdateProfile = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setUpdatingProfile(true);
    setError(null);
    setSuccess(null);

    const token =
      sessionStorage.getItem('sidprep_admin_token') ||
      localStorage.getItem('sidprep_admin_token');

    try {
      const res = await fetch(`${API_BASE}/v1/admin/profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name: name.trim(), email: email.trim() }),
      });

      const data = await res.json();
      if (res.status === 428) {
        setPendingAction(() => () => handleUpdateProfile());
        setMfaModalOpen(true);
        return;
      }

      if (!res.ok) throw new Error(data?.error?.message || 'Failed to update profile');

      setSuccess('Staff profile updated successfully.');
      if (profile) {
        const updated = { ...profile, name: name.trim(), email: email.trim() };
        setProfile(updated);
        sessionStorage.setItem('sidprep_admin_user', JSON.stringify(updated));
        localStorage.setItem('sidprep_admin_user', JSON.stringify(updated));
      }
    } catch (err: any) {
      setError(err.message || 'Error updating profile');
    } finally {
      setUpdatingProfile(false);
    }
  };

  const handleChangePassword = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError(null);
    setSuccess(null);

    if (newPassword !== confirmPassword) {
      setError('New passwords do not match.');
      return;
    }

    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters long.');
      return;
    }

    setUpdatingPassword(true);

    const token =
      sessionStorage.getItem('sidprep_admin_token') ||
      localStorage.getItem('sidprep_admin_token');

    try {
      const res = await fetch(`${API_BASE}/v1/admin/profile/password`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      const data = await res.json();
      if (res.status === 428) {
        setPendingAction(() => () => handleChangePassword());
        setMfaModalOpen(true);
        return;
      }

      if (!res.ok) throw new Error(data?.error?.message || 'Failed to change password');

      setSuccess('Password updated successfully. All other active sessions and trusted devices have been revoked.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      await fetchTrustedDevices();
    } catch (err: any) {
      setError(err.message || 'Error changing password');
    } finally {
      setUpdatingPassword(false);
    }
  };

  const handleMfaStepUpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMfaError(null);
    setMfaLoading(true);

    const token =
      sessionStorage.getItem('sidprep_admin_token') ||
      localStorage.getItem('sidprep_admin_token');

    try {
      const res = await fetch(`${API_BASE}/v1/auth/admin/mfa/step-up`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ code: mfaCode.trim() }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || 'Invalid verification code.');

      if (data.adminToken) {
        sessionStorage.setItem('sidprep_admin_token', data.adminToken);
        localStorage.setItem('sidprep_admin_token', data.adminToken);
      }

      setMfaModalOpen(false);
      setMfaCode('');
      if (pendingAction) {
        const action = pendingAction;
        setPendingAction(null);
        await action();
      }
    } catch (err: any) {
      setMfaError(err.message || 'Failed to confirm MFA');
    } finally {
      setMfaLoading(false);
    }
  };

  const handleRevokeDevice = async (id: string) => {
    setRevokingDeviceId(id);
    try {
      const token =
        sessionStorage.getItem('sidprep_admin_token') ||
        localStorage.getItem('sidprep_admin_token');

      const res = await fetch(`${API_BASE}/v1/auth/admin/trusted-devices/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
        credentials: 'include',
      });

      if (res.ok) {
        await fetchTrustedDevices();
        setSuccess('Trusted device revoked successfully.');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to revoke device');
    } finally {
      setRevokingDeviceId(null);
    }
  };

  const handleForgetAllDevices = async () => {
    if (!confirm('Are you sure you want to forget all trusted devices? This browser and any other trusted browsers will require 2FA OTP on next sign-in.')) return;
    try {
      const token =
        sessionStorage.getItem('sidprep_admin_token') ||
        localStorage.getItem('sidprep_admin_token');

      const res = await fetch(`${API_BASE}/v1/auth/admin/trusted-devices/forget-all`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        credentials: 'include',
      });

      if (res.ok) {
        await fetchTrustedDevices();
        setSuccess('All trusted devices have been forgotten. OTP will be required on next sign-in.');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to forget devices');
    }
  };

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div>
        <h1 className="font-heading font-extrabold text-xl text-white flex items-center gap-2">
          <User className="w-5 h-5 text-primary" />
          Admin Profile & Security Settings
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          Manage your administrative profile, credentials, and two-factor authentication preferences.
        </p>
      </div>

      {error && (
        <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {loading ? (
        <div className="py-12 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
          <RefreshCw className="w-4 h-4 animate-spin text-primary" />
          Loading profile...
        </div>
      ) : profile ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Left Column: Profile Card */}
          <div className="md:col-span-1 space-y-6">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl text-center">
              <div className="w-16 h-16 rounded-2xl bg-primary/20 border border-primary/30 flex items-center justify-center text-primary mx-auto mb-4 font-heading font-bold text-xl">
                {profile.name.charAt(0).toUpperCase()}
              </div>
              <h2 className="font-heading font-bold text-base text-white">{profile.name}</h2>
              <p className="text-xs text-slate-400 mt-0.5">{profile.email}</p>

              <div className="mt-4 pt-4 border-t border-slate-800 flex flex-col gap-2.5 text-left text-xs">
                <div className="flex items-center justify-between text-slate-400">
                  <span className="flex items-center gap-1.5">
                    <Shield className="w-3.5 h-3.5 text-primary" /> Role
                  </span>
                  <span className="font-bold text-white px-2 py-0.5 rounded bg-primary/10 text-primary">
                    {profile.role}
                  </span>
                </div>

                <div className="flex items-center justify-between text-slate-400">
                  <span className="flex items-center gap-1.5">
                    <BadgeCheck className="w-3.5 h-3.5 text-emerald-400" /> 2FA Status
                  </span>
                  <span className="text-emerald-400 font-semibold">Active (Brevo / TOTP)</span>
                </div>

                <div className="flex items-center justify-between text-slate-400">
                  <span className="flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-slate-400" /> Member Since
                  </span>
                  <span className="text-slate-300 font-medium">
                    {new Date(profile.createdAt).toLocaleDateString('en-IN', {
                      month: 'short',
                      year: 'numeric',
                    })}
                  </span>
                </div>
              </div>
            </div>

            {/* 2FA Info Card */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 text-xs space-y-2">
              <div className="font-bold text-white flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5 text-primary" />
                Two-Factor Channels
              </div>
              <p className="text-slate-400 leading-relaxed text-[11px]">
                You can authenticate using an authenticator app (Google Authenticator / Authy) or receive secure 6-digit one-time verification codes dispatched to your verified staff email address.
              </p>
            </div>
          </div>

          {/* Right Column: Edit Forms */}
          <div className="md:col-span-2 space-y-6">
            {/* Edit Profile Form */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
              <h2 className="font-heading font-bold text-sm text-white mb-4 flex items-center gap-2">
                <User className="w-4 h-4 text-primary" />
                Staff Profile Information
              </h2>
              <form onSubmit={handleUpdateProfile} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                      Full Name
                    </label>
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs focus:ring-2 focus:ring-primary outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                      Staff Email Address
                    </label>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs focus:ring-2 focus:ring-primary outline-none"
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="submit"
                    disabled={updatingProfile}
                    className="px-5 py-2.5 rounded-xl bg-primary hover:bg-primary-600 text-white text-xs font-bold shadow-md transition-all flex items-center gap-1.5"
                  >
                    {updatingProfile ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    )}
                    Update Details
                  </button>
                </div>
              </form>
            </div>

            {/* Change Password Form */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
              <h2 className="font-heading font-bold text-sm text-white mb-4 flex items-center gap-2">
                <Lock className="w-4 h-4 text-primary" />
                Change Password
              </h2>
              <form onSubmit={handleChangePassword} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Current Password
                  </label>
                  <input
                    type="password"
                    required
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs focus:ring-2 focus:ring-primary outline-none"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                      New Password (min 8 chars)
                    </label>
                    <input
                      type="password"
                      required
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs focus:ring-2 focus:ring-primary outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                      Confirm New Password
                    </label>
                    <input
                      type="password"
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs focus:ring-2 focus:ring-primary outline-none"
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="submit"
                    disabled={updatingPassword}
                    className="px-5 py-2.5 rounded-xl bg-primary hover:bg-primary-600 text-white text-xs font-bold shadow-md transition-all flex items-center gap-1.5"
                  >
                    {updatingPassword ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <KeyRound className="w-3.5 h-3.5" />
                    )}
                    Change Password
                  </button>
                </div>
              </form>
            </div>

            {/* Trusted Devices Manager (Requirement 1) */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div>
                  <h2 className="font-heading font-bold text-sm text-white flex items-center gap-2">
                    <Laptop className="w-4 h-4 text-primary" />
                    7-Day Trusted Devices
                  </h2>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Browsers remembered for 7 days skip 2FA OTP codes on sign-in. Expired or revoked devices require full 2FA.
                  </p>
                </div>
                {devices.filter((d) => !d.isRevoked).length > 0 && (
                  <button
                    type="button"
                    onClick={handleForgetAllDevices}
                    className="px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 text-xs font-semibold border border-rose-500/20 transition-all flex items-center gap-1.5"
                  >
                    <Trash2 className="w-3 h-3" />
                    Forget All Devices
                  </button>
                )}
              </div>

              {loadingDevices ? (
                <div className="py-6 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin text-primary" />
                  Loading trusted devices...
                </div>
              ) : devices.length === 0 ? (
                <div className="py-6 text-center text-xs text-slate-500 bg-slate-950/40 rounded-xl border border-slate-850 p-4">
                  No devices currently trusted. Check &ldquo;Trust this device for 7 days&rdquo; during sign-in to remember a browser.
                </div>
              ) : (
                <div className="divide-y divide-slate-800">
                  {devices.map((device) => {
                    const isExpired = new Date(device.expiresAt).getTime() <= Date.now();
                    const active = !device.isRevoked && !isExpired;
                    return (
                      <div key={device.id} className="py-3 flex items-center justify-between gap-3 text-xs">
                        <div className="flex items-start gap-3 min-w-0">
                          <div className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300 shrink-0 mt-0.5">
                            {device.userAgent?.includes('Mobile') || device.userAgent?.includes('Android') || device.userAgent?.includes('iPhone') ? (
                              <Smartphone className="w-4 h-4 text-primary" />
                            ) : (
                              <Laptop className="w-4 h-4 text-primary" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-slate-200 truncate">{device.deviceLabel}</span>
                              {device.isCurrent && (
                                <span className="px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 text-[10px] font-bold border border-indigo-500/30">
                                  This Browser
                                </span>
                              )}
                              {active ? (
                                <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-bold border border-emerald-500/30">
                                  Trusted
                                </span>
                              ) : (
                                <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 text-[10px] font-medium border border-slate-700">
                                  {device.isRevoked ? 'Revoked' : 'Expired'}
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-400 flex items-center gap-2 mt-0.5">
                              {device.ipAddress && <span>IP: {device.ipAddress}</span>}
                              <span>•</span>
                              <span>Expires: {new Date(device.expiresAt).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                            </div>
                          </div>
                        </div>

                        {active && (
                          <button
                            type="button"
                            disabled={revokingDeviceId === device.id}
                            onClick={() => handleRevokeDevice(device.id)}
                            className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 border border-slate-700 text-xs transition-colors shrink-0"
                          >
                            {revokingDeviceId === device.id ? 'Revoking...' : 'Revoke'}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {/* Fresh MFA Step-Up Modal (Requirement 1) */}
      {mfaModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-sm p-6 shadow-2xl text-white space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-amber-400" />
                <h3 className="font-heading font-bold text-sm text-white">Fresh MFA Required</h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setMfaModalOpen(false);
                  setPendingAction(null);
                  setMfaCode('');
                }}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              This sensitive operation (email or password change) requires multi-factor authentication verified within the last 10 minutes. Please enter your 6-digit verification code to proceed.
            </p>

            {mfaError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs">
                {mfaError}
              </div>
            )}

            <form onSubmit={handleMfaStepUpSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  6-Digit Verification Code
                </label>
                <input
                  type="text"
                  required
                  maxLength={6}
                  placeholder="000000"
                  autoFocus
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ''))}
                  className="w-full text-center tracking-[0.4em] font-mono text-xl py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setMfaModalOpen(false);
                    setPendingAction(null);
                    setMfaCode('');
                  }}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={mfaLoading || mfaCode.length !== 6}
                  className="px-5 py-2 rounded-xl bg-primary hover:bg-primary-600 disabled:opacity-50 text-white text-xs font-bold transition-all flex items-center gap-1.5"
                >
                  {mfaLoading && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  Confirm &amp; Proceed
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
