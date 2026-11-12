'use client';

import { useState, useEffect } from 'react';
import { Smartphone, Download, ShieldCheck, AlertCircle, ArrowRight, BatteryCharging, WifiOff } from 'lucide-react';
import { PublicShell } from '@/components/public-shell';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';

export default function MobileAppPage() {
  const [releaseVersion, setReleaseVersion] = useState('2.0.3');
  const [downloadUrl, setDownloadUrl] = useState(
    'https://github.com/sakirhossn/SidPrep/releases/latest/download/SidPrep-Student-release.apk'
  );
  const [releaseNotes, setReleaseNotes] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API_BASE}/v1/app/updates/check?platform=ANDROID&channel=PRODUCTION&version=0.0.0&build=0`, {
      cache: 'no-store',
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.latestRelease) {
          setReleaseVersion(data.latestRelease.version || '2.0.3');
          if (data.latestRelease.downloadUrl) {
            setDownloadUrl(data.latestRelease.downloadUrl);
          }
          if (data.latestRelease.releaseNotes) {
            setReleaseNotes(data.latestRelease.releaseNotes);
          }
        }
      })
      .catch(() => {});
  }, []);

  return (
    <PublicShell>
      <div className="py-16 md:py-24 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto text-center mb-16">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-bold mb-4">
            <Smartphone className="w-3.5 h-3.5" />
            <span>SidPrep 2.0 Android Companion App</span>
          </div>
          <h1 className="font-heading font-extrabold text-3xl sm:text-5xl text-slate-900 mb-6 tracking-tight">
            Fast, Offline-Ready Learning in Your Pocket
          </h1>
          <p className="text-base text-slate-600 leading-relaxed mb-4">
            Built with React Native + Expo. Instant cold start, transactional offline answer queueing, Argon2id password security, and automatic release update alerts.
          </p>
          {releaseNotes && (
            <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2.5 inline-block mb-6">
              <strong>Latest v{releaseVersion}:</strong> {releaseNotes}
            </p>
          )}

          {/* Action Button */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mt-2">
            <a
              href={downloadUrl}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 px-7 py-4 rounded-xl bg-primary hover:bg-primary-600 text-white font-heading font-bold text-sm shadow-md hover:shadow-lg transition-all"
            >
              <Download className="w-4 h-4" />
              Download SidPrep Android APK (v{releaseVersion})
            </a>
            <a
              href="https://github.com/sakirhossn/SidPrep/releases/latest"
              target="_blank"
              rel="noopener noreferrer"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-heading font-semibold text-sm transition-all"
            >
              <span>GitHub Releases & Changelog</span>
              <ArrowRight className="w-4 h-4 text-slate-500" />
            </a>
          </div>
          <div className="mt-4 text-center">
            <span className="text-xs text-slate-500 font-medium">
              Requires Android 8.0 (Oreo) or higher • Signed Release APK • Verified Installation Flow
            </span>
          </div>
        </div>

        {/* App Key Highlights */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16">
          <div className="bg-white p-7 rounded-2xl border border-slate-200 shadow-sm">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-accent-teal flex items-center justify-center mb-4">
              <WifiOff className="w-5 h-5" />
            </div>
            <h3 className="font-heading font-bold text-base text-slate-900 mb-2">Offline Mock Runner</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Answer questions during network fluctuations. SQLite safely persists responses with monotonic sequence IDs and syncs automatically when connection restores.
            </p>
          </div>

          <div className="bg-white p-7 rounded-2xl border border-slate-200 shadow-sm">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-primary flex items-center justify-center mb-4">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <h3 className="font-heading font-bold text-base text-slate-900 mb-2">Verified Password & OTP Security</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Sign in smoothly with Argon2id-protected credentials, verified email onboarding grants, secure token storage, and instant session management across devices.
            </p>
          </div>

          <div className="bg-white p-7 rounded-2xl border border-slate-200 shadow-sm">
            <div className="w-10 h-10 rounded-xl bg-amber-50 text-accent-amber flex items-center justify-center mb-4">
              <BatteryCharging className="w-5 h-5" />
            </div>
            <h3 className="font-heading font-bold text-base text-slate-900 mb-2">Safe Automatic Update Alerts</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Receive notifications when a verified release is ready, review what changed, and install updates without ever interrupting an active mock exam.
            </p>
          </div>
        </div>

        {/* Honest App-Store Notice */}
        <div className="max-w-2xl mx-auto p-6 rounded-2xl bg-white border border-slate-200 text-center">
          <div className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-700 mb-2">
            <AlertCircle className="w-4 h-4 text-primary" />
            <span>App Distribution Notice</span>
          </div>
          <p className="text-xs text-slate-500 leading-relaxed">
            SidPrep 2.0 is currently distributed via verified direct APK install through standard Android package confirmation. Official store listings will roll out following closed testing completion.
          </p>
        </div>
      </div>
    </PublicShell>
  );
}
