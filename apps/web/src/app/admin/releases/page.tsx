'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Smartphone,
  Plus,
  Send,
  Edit3,
  Ban,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Bell,
  ExternalLink,
  ShieldAlert,
  BarChart3,
  Clock,
  XCircle,
} from 'lucide-react';
import type {
  AppReleaseRecord,
  ReleasePlatform,
  ReleaseChannel,
  ReleaseStatus,
  ReleaseDeliverySummary,
} from '@sidprep/contracts';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';

interface DeliveryRow {
  id: string;
  deviceId: string;
  studentId?: string;
  installedVersion: string;
  installedBuild: number;
  tokenValid: boolean;
  invalidReason?: string;
  status: string;
  attemptCount: number;
  maxAttempts: number;
  providerTicketId?: string;
  providerReceiptStatus?: string;
  errorCode?: string;
  errorMessage?: string;
  acceptedAt?: string;
  deliveredAt?: string;
  tappedAt?: string;
  updatedAt: string;
}

function getAdminToken(): string {
  if (typeof window === 'undefined') return '';
  return (
    sessionStorage.getItem('sidprep_admin_token') ||
    localStorage.getItem('sidprep_admin_token') ||
    ''
  );
}

export default function AdminReleasesPage() {
  const [releases, setReleases] = useState<AppReleaseRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Filter state
  const [filterPlatform, setFilterPlatform] = useState<string>('ALL');
  const [filterChannel, setFilterChannel] = useState<string>('ALL');

  // Form state (Create or Edit)
  const [editingId, setEditingId] = useState<string | null>(null);
  const [platform, setPlatform] = useState<ReleasePlatform>('ANDROID');
  const [releaseChannel, setReleaseChannel] = useState<ReleaseChannel>('PRODUCTION');
  const [version, setVersion] = useState('2.0.3');
  const [buildNumber, setBuildNumber] = useState('203');
  const [minSupportedVersion, setMinSupportedVersion] = useState('2.0.0');
  const [isMandatory, setIsMandatory] = useState(false);
  const [otaCompatible, setOtaCompatible] = useState(false);
  const [requiresNativeBinary, setRequiresNativeBinary] = useState(true);
  const [releaseNotes, setReleaseNotes] = useState('');
  const [downloadUrl, setDownloadUrl] = useState(
    'https://github.com/sakirhossn/SidPrep/releases/latest/download/SidPrep-Student-release.apk'
  );
  const [initialStatus, setInitialStatus] = useState<ReleaseStatus>('DRAFT');

  // Delivery monitor drawer state
  const [selectedRelease, setSelectedRelease] = useState<AppReleaseRecord | null>(null);
  const [deliverySummary, setDeliverySummary] = useState<ReleaseDeliverySummary | null>(null);
  const [deliveries, setDeliveries] = useState<DeliveryRow[]>([]);
  const [loadingDeliveries, setLoadingDeliveries] = useState(false);

  const loadReleases = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      if (filterPlatform !== 'ALL') qs.set('platform', filterPlatform);
      if (filterChannel !== 'ALL') qs.set('channel', filterChannel);
      const res = await fetch(`${API_BASE}/v1/admin/releases?${qs.toString()}`, {
        headers: { Authorization: `Bearer ${getAdminToken()}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || 'Failed to load app releases');
      setReleases(data.releases || []);
    } catch (err: any) {
      setError(err.message || 'Unable to load releases');
    } finally {
      setLoading(false);
    }
  }, [filterPlatform, filterChannel]);

  useEffect(() => {
    loadReleases();
  }, [loadReleases]);

  const resetForm = () => {
    setEditingId(null);
    setPlatform('ANDROID');
    setReleaseChannel('PRODUCTION');
    setVersion('2.0.4');
    setBuildNumber('204');
    setMinSupportedVersion('2.0.0');
    setIsMandatory(false);
    setOtaCompatible(false);
    setRequiresNativeBinary(true);
    setReleaseNotes('');
    setDownloadUrl(
      'https://github.com/sakirhossn/SidPrep/releases/latest/download/SidPrep-Student-release.apk'
    );
    setInitialStatus('DRAFT');
  };

  const handleEditClick = (rel: AppReleaseRecord) => {
    setEditingId(rel.id);
    setPlatform(rel.platform);
    setReleaseChannel(rel.releaseChannel);
    setVersion(rel.version);
    setBuildNumber(String(rel.buildNumber));
    setMinSupportedVersion(rel.minSupportedVersion);
    setIsMandatory(rel.isMandatory);
    setOtaCompatible(rel.otaCompatible);
    setRequiresNativeBinary(rel.requiresNativeBinary);
    setReleaseNotes(rel.releaseNotes || '');
    setDownloadUrl(rel.downloadUrl);
    setInitialStatus(rel.status);
    setSuccessMsg(null);
    setError(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSubmit = async (e: React.FormEvent, targetStatus?: ReleaseStatus) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const token = getAdminToken();
      if (editingId) {
        // Editing metadata only — NEVER re-enqueues push notifications for all devices
        const res = await fetch(`${API_BASE}/v1/admin/releases/${editingId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            platform,
            releaseChannel,
            version,
            buildNumber: Number(buildNumber),
            minSupportedVersion,
            releaseNotes,
            downloadUrl,
            isMandatory,
            otaCompatible,
            requiresNativeBinary,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error?.message || 'Failed to update release');
        setSuccessMsg(`Release v${version} metadata updated without re-notifying existing users.`);
        resetForm();
      } else {
        const chosenStatus = targetStatus || initialStatus;
        const res = await fetch(`${API_BASE}/v1/admin/releases`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            platform,
            releaseChannel,
            version,
            buildNumber: Number(buildNumber),
            minSupportedVersion,
            releaseNotes,
            downloadUrl,
            isMandatory,
            status: chosenStatus,
            isPublished: chosenStatus === 'PUBLISHED',
            otaCompatible,
            requiresNativeBinary,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error?.message || 'Failed to create release');
        setSuccessMsg(
          chosenStatus === 'PUBLISHED'
            ? `Release v${version} saved and published. Notification job ${data.notificationJobId || ''} enqueued for older ${platform}/${releaseChannel} installs.`
            : `Draft release v${version} saved.`
        );
        resetForm();
      }
      await loadReleases();
    } catch (err: any) {
      setError(err.message || 'Action failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatusChange = async (rel: AppReleaseRecord, nextStatus: ReleaseStatus) => {
    let withdrawnReason: string | undefined;
    if (nextStatus === 'WITHDRAWN') {
      const reason = window.prompt(
        `Withdraw release v${rel.version} (${rel.platform}/${rel.releaseChannel})? Enter optional reason:`,
        'Superseded or critical issue discovered'
      );
      if (reason === null) return;
      withdrawnReason = reason;
    }

    setError(null);
    setSuccessMsg(null);
    try {
      const res = await fetch(`${API_BASE}/v1/admin/releases/${rel.id}/publish`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getAdminToken()}`,
        },
        body: JSON.stringify({
          status: nextStatus,
          isPublished: nextStatus === 'PUBLISHED',
          withdrawnReason,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || 'Status update failed');
      setSuccessMsg(
        nextStatus === 'PUBLISHED'
          ? `Published v${rel.version}. ${data.notificationJobId ? `Durable job ${data.notificationJobId} enqueued.` : 'Already notified earlier (duplicate prevented).'}`
          : nextStatus === 'WITHDRAWN'
          ? `Withdrew v${rel.version}. Pending notifications cancelled and version hidden from app update checks.`
          : `Moved v${rel.version} back to DRAFT.`
      );
      await loadReleases();
    } catch (err: any) {
      setError(err.message || 'Status change failed');
    }
  };

  const openDeliveryMonitor = async (rel: AppReleaseRecord) => {
    setSelectedRelease(rel);
    setLoadingDeliveries(true);
    try {
      const res = await fetch(`${API_BASE}/v1/admin/releases/${rel.id}/deliveries`, {
        headers: { Authorization: `Bearer ${getAdminToken()}` },
      });
      const data = await res.json();
      if (res.ok) {
        setDeliverySummary(data.summary);
        setDeliveries(data.deliveries || []);
      }
    } catch {
      // keep existing
    } finally {
      setLoadingDeliveries(false);
    }
  };

  const handleFlushNotifications = async (relId: string) => {
    setLoadingDeliveries(true);
    try {
      await fetch(`${API_BASE}/v1/admin/releases/${relId}/process-notifications`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getAdminToken()}` },
      });
      if (selectedRelease) {
        await openDeliveryMonitor(selectedRelease);
      }
      await loadReleases();
    } finally {
      setLoadingDeliveries(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-heading font-extrabold text-2xl text-white flex items-center gap-2.5">
            <Smartphone className="w-6 h-6 text-primary" />
            App Releases & Update Notifications
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Publish mobile releases, enforce minimum supported versions, and monitor durable push delivery.
          </p>
        </div>
        <button
          onClick={loadReleases}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Release Publisher / Editor Form */}
      <form
        onSubmit={(e) => handleSubmit(e)}
        className="p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-sm space-y-5"
      >
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <h2 className="font-heading font-bold text-sm text-white flex items-center gap-2">
            {editingId ? (
              <>
                <Edit3 className="w-4 h-4 text-amber-400" />
                Edit Release Metadata (Updates Metadata Only — Will Not Re-Notify Devices)
              </>
            ) : (
              <>
                <Plus className="w-4 h-4 text-primary" />
                Create New App Release
              </>
            )}
          </h2>
          {editingId && (
            <button
              type="button"
              onClick={resetForm}
              className="text-xs text-slate-400 hover:text-white underline"
            >
              Cancel Edit
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">Platform</label>
            <select
              value={platform}
              onChange={(e) => setPlatform(e.target.value as ReleasePlatform)}
              className="w-full p-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs outline-none"
            >
              <option value="ANDROID">ANDROID</option>
              <option value="IOS">IOS</option>
              <option value="WEB">WEB</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">Release Channel</label>
            <select
              value={releaseChannel}
              onChange={(e) => setReleaseChannel(e.target.value as ReleaseChannel)}
              className="w-full p-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs outline-none"
            >
              <option value="PRODUCTION">PRODUCTION</option>
              <option value="BETA">BETA</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">Version (Semver)</label>
            <input
              type="text"
              required
              placeholder="2.0.3"
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs outline-none font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">Build Number</label>
            <input
              type="number"
              required
              min={1}
              placeholder="203"
              value={buildNumber}
              onChange={(e) => setBuildNumber(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs outline-none font-mono"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Minimum Supported Version
            </label>
            <input
              type="text"
              required
              placeholder="2.0.0"
              value={minSupportedVersion}
              onChange={(e) => setMinSupportedVersion(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs outline-none font-mono"
            />
            <p className="text-[10px] text-slate-400 mt-1">
              Installs older than this version become mandatory upgrades automatically.
            </p>
          </div>

          <div className="lg:col-span-2">
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Approved Store / Download URL (HTTPS only)
            </label>
            <input
              type="url"
              required
              placeholder="https://github.com/sakirhossn/SidPrep/releases/download/v2.0.3/SidPrep-Student-v2.0.3.apk"
              value={downloadUrl}
              onChange={(e) => setDownloadUrl(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs outline-none font-mono"
            />
            <div className="flex flex-wrap gap-2 mt-1.5">
              <button
                type="button"
                onClick={() =>
                  setDownloadUrl(
                    `https://github.com/sakirhossn/SidPrep/releases/download/v${version}/SidPrep-Student-v${version}.apk`
                  )
                }
                className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-300 hover:bg-slate-700"
              >
                Use GitHub v{version} APK
              </button>
              <button
                type="button"
                onClick={() =>
                  setDownloadUrl('https://play.google.com/store/apps/details?id=in.sidprep.student')
                }
                className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-300 hover:bg-slate-700"
              >
                Google Play Store
              </button>
              <button
                type="button"
                onClick={() => setDownloadUrl('https://apps.apple.com/app/sidprep/id0000000000')}
                className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-300 hover:bg-slate-700"
              >
                Apple App Store
              </button>
            </div>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1">Release Notes</label>
          <textarea
            rows={3}
            required
            placeholder="Describe new features, bug fixes, or security improvements..."
            value={releaseNotes}
            onChange={(e) => setReleaseNotes(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs outline-none"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
          <label className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-800/60 border border-slate-700/70 cursor-pointer">
            <input
              type="checkbox"
              checked={isMandatory}
              onChange={(e) => setIsMandatory(e.target.checked)}
              className="mt-0.5 accent-primary"
            />
            <div>
              <span className="text-xs font-bold text-white block">Mandatory Update</span>
              <span className="text-[10px] text-slate-400">
                Blocks use at a safe point (never interrupts active mock tests).
              </span>
            </div>
          </label>

          <label className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-800/60 border border-slate-700/70 cursor-pointer">
            <input
              type="checkbox"
              checked={requiresNativeBinary}
              onChange={(e) => setRequiresNativeBinary(e.target.checked)}
              className="mt-0.5 accent-primary"
            />
            <div>
              <span className="text-xs font-bold text-white block">Requires Native Binary</span>
              <span className="text-[10px] text-slate-400">
                Native permission/SDK changes require store or APK install.
              </span>
            </div>
          </label>

          <label className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-800/60 border border-slate-700/70 cursor-pointer">
            <input
              type="checkbox"
              checked={otaCompatible}
              onChange={(e) => setOtaCompatible(e.target.checked)}
              className="mt-0.5 accent-primary"
            />
            <div>
              <span className="text-xs font-bold text-white block">OTA Compatible</span>
              <span className="text-[10px] text-slate-400">
                JS-only bundle compatible if EAS/Expo OTA is configured.
              </span>
            </div>
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-2">
          {editingId ? (
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs transition disabled:opacity-50"
            >
              <Edit3 className="w-4 h-4" />
              Save Metadata Updates
            </button>
          ) : (
            <>
              <button
                type="button"
                disabled={submitting}
                onClick={(e) => handleSubmit(e, 'DRAFT')}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 font-semibold text-xs transition disabled:opacity-50"
              >
                Save as Draft
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={(e) => handleSubmit(e, 'PUBLISHED')}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary hover:bg-primary/90 text-white font-bold text-xs transition disabled:opacity-50"
              >
                <Send className="w-4 h-4" />
                Save, Publish & Enqueue Push Notification
              </button>
            </>
          )}
        </div>
      </form>

      {/* Filters + Release Table */}
      <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-heading font-bold text-sm text-white">Published & Draft Releases</h2>
          <div className="flex items-center gap-2">
            <select
              value={filterPlatform}
              onChange={(e) => setFilterPlatform(e.target.value)}
              className="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs text-slate-200"
            >
              <option value="ALL">All Platforms</option>
              <option value="ANDROID">ANDROID</option>
              <option value="IOS">IOS</option>
              <option value="WEB">WEB</option>
            </select>
            <select
              value={filterChannel}
              onChange={(e) => setFilterChannel(e.target.value)}
              className="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs text-slate-200"
            >
              <option value="ALL">All Channels</option>
              <option value="PRODUCTION">PRODUCTION</option>
              <option value="BETA">BETA</option>
            </select>
          </div>
        </div>

        <div className="space-y-3">
          {releases.length === 0 && !loading && (
            <div className="p-8 text-center text-xs text-slate-400 border border-dashed border-slate-800 rounded-xl">
              No releases found matching these filters.
            </div>
          )}

          {releases.map((rel) => {
            const sum = rel.deliverySummary;
            return (
              <div
                key={rel.id}
                className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
              >
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono font-extrabold text-sm text-white">
                      v{rel.version}
                    </span>
                    <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                      Build {rel.buildNumber}
                    </span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-500/15 text-blue-300 border border-blue-500/30">
                      {rel.platform} / {rel.releaseChannel}
                    </span>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                        rel.status === 'PUBLISHED'
                          ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                          : rel.status === 'WITHDRAWN'
                          ? 'bg-red-500/15 text-red-300 border-red-500/30'
                          : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                      }`}
                    >
                      {rel.status}
                    </span>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                        rel.isMandatory
                          ? 'bg-amber-500/20 text-amber-300'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {rel.isMandatory ? 'MANDATORY' : 'OPTIONAL'}
                    </span>
                  </div>

                  <p className="text-xs text-slate-300">{rel.releaseNotes || 'No release notes.'}</p>

                  <div className="flex flex-wrap items-center gap-4 text-[11px] text-slate-400">
                    <span>Min supported: v{rel.minSupportedVersion}</span>
                    <a
                      href={rel.downloadUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-primary hover:underline"
                    >
                      Download URL <ExternalLink className="w-3 h-3" />
                    </a>
                    {rel.notificationJobId && (
                      <span className="text-emerald-400/90 flex items-center gap-1">
                        <Bell className="w-3 h-3" /> Notified via {rel.notificationJobId}
                      </span>
                    )}
                  </div>

                  {sum && sum.totalTargeted > 0 && (
                    <div className="flex flex-wrap items-center gap-3 pt-1 text-[11px]">
                      <span className="text-slate-300">Targeted: {sum.totalTargeted}</span>
                      <span className="text-sky-400">Provider Accepted: {sum.acceptedCount}</span>
                      <span className="text-emerald-400">Receipt Delivered: {sum.deliveredCount}</span>
                      <span className="text-amber-400">Retrying: {sum.failedRetryableCount}</span>
                      <span className="text-red-400">Permanent Fail: {sum.failedPermanentCount}</span>
                      <span className="text-purple-400">Tapped: {sum.tappedCount}</span>
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    onClick={() => openDeliveryMonitor(rel)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold"
                  >
                    <BarChart3 className="w-3.5 h-3.5" />
                    Deliveries
                  </button>

                  <button
                    onClick={() => handleEditClick(rel)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    Edit
                  </button>

                  {rel.status !== 'PUBLISHED' && (
                    <button
                      onClick={() => handleStatusChange(rel, 'PUBLISHED')}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold"
                    >
                      <Send className="w-3.5 h-3.5" />
                      Publish
                    </button>
                  )}

                  {rel.status === 'PUBLISHED' && (
                    <button
                      onClick={() => handleStatusChange(rel, 'WITHDRAWN')}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600/20 hover:bg-red-600/30 text-red-300 border border-red-500/30 text-xs font-bold"
                    >
                      <Ban className="w-3.5 h-3.5" />
                      Withdraw
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Delivery Monitoring Drawer */}
      {selectedRelease && (
        <div className="p-6 rounded-2xl bg-slate-900 border border-slate-700 shadow-xl space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
            <div>
              <h3 className="font-heading font-bold text-base text-white flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-primary" />
                Delivery Monitoring — v{selectedRelease.version} ({selectedRelease.platform}/
                {selectedRelease.releaseChannel})
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Note: Provider acceptance indicates Expo/FCM queued the ticket; confirmed delivery requires push receipt or tap confirmation.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleFlushNotifications(selectedRelease.id)}
                disabled={loadingDeliveries}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-bold"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingDeliveries ? 'animate-spin' : ''}`} />
                Process Retries & Receipts
              </button>
              <button
                onClick={() => setSelectedRelease(null)}
                className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs"
              >
                Close
              </button>
            </div>
          </div>

          {deliverySummary && (
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
              {[
                { label: 'Targeted', val: deliverySummary.totalTargeted, cls: 'text-white' },
                { label: 'Pending', val: deliverySummary.pendingCount, cls: 'text-slate-300' },
                { label: 'Provider Accepted', val: deliverySummary.acceptedCount, cls: 'text-sky-400' },
                { label: 'Confirmed Delivered', val: deliverySummary.deliveredCount, cls: 'text-emerald-400' },
                { label: 'Retrying', val: deliverySummary.failedRetryableCount, cls: 'text-amber-400' },
                { label: 'Failed / Cleaned', val: deliverySummary.failedPermanentCount, cls: 'text-red-400' },
                { label: 'User Tapped', val: deliverySummary.tappedCount, cls: 'text-purple-400' },
              ].map((stat) => (
                <div key={stat.label} className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <div className="text-[10px] text-slate-400 uppercase font-semibold">{stat.label}</div>
                  <div className={`text-lg font-mono font-bold mt-0.5 ${stat.cls}`}>{stat.val}</div>
                </div>
              ))}
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-[10px] uppercase text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="py-2 pr-3">Device ID</th>
                  <th className="py-2 pr-3">Installed</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Attempts</th>
                  <th className="py-2 pr-3">Token Health</th>
                  <th className="py-2">Error / Ticket</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {deliveries.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-slate-500">
                      No delivery records yet for this release.
                    </td>
                  </tr>
                ) : (
                  deliveries.map((d) => (
                    <tr key={d.id} className="text-slate-300">
                      <td className="py-2 pr-3 font-mono text-[11px]">{d.deviceId.slice(0, 14)}</td>
                      <td className="py-2 pr-3 font-mono text-[11px]">
                        v{d.installedVersion} ({d.installedBuild})
                      </td>
                      <td className="py-2 pr-3">
                        <span className="px-2 py-0.5 rounded bg-slate-800 text-[10px] font-bold">
                          {d.status}
                        </span>
                      </td>
                      <td className="py-2 pr-3">
                        {d.attemptCount}/{d.maxAttempts}
                      </td>
                      <td className="py-2 pr-3">
                        {d.tokenValid ? (
                          <span className="text-emerald-400 text-[11px]">Valid</span>
                        ) : (
                          <span className="text-red-400 text-[11px]">
                            Invalid ({d.invalidReason || 'cleaned'})
                          </span>
                        )}
                      </td>
                      <td className="py-2 font-mono text-[10px] text-slate-400">
                        {d.errorCode || d.providerTicketId || '-'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
