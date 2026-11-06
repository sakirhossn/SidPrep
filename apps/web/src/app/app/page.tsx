'use client';

import Link from 'next/link';
import { Smartphone, Download, ShieldCheck, CheckCircle2, AlertCircle, ArrowRight, BatteryCharging, WifiOff } from 'lucide-react';
import { PublicShell } from '@/components/public-shell';

export default function MobileAppPage() {
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
        <p className="text-base text-slate-600 leading-relaxed mb-8">
          Built with React Native + Expo. Small APK size (&lt; 25MB), instant cold start, zero battery drain, and transactional offline answer queueing.
        </p>

        {/* Action Button */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <a
            href="https://github.com/sakirhossn/SidPrep/releases/latest/download/SidPrep-Student-release.apk"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 px-7 py-4 rounded-xl bg-primary hover:bg-primary-600 text-white font-heading font-bold text-sm shadow-md hover:shadow-lg transition-all"
          >
            <Download className="w-4 h-4" />
            Download SidPrep Android APK (v2.0.1)
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
            Requires Android 8.0 (Oreo) or higher • Universal APK (~25 MB) • Signed & Verified
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
          <h3 className="font-heading font-bold text-base text-slate-900 mb-2">Passwordless Brevo OTP</h3>
          <p className="text-xs text-slate-600 leading-relaxed">
            Log in quickly using a 6-digit email OTP. No passwords to remember or leak. Session refresh tokens are safely stored in Android SecureKeystore.
          </p>
        </div>

        <div className="bg-white p-7 rounded-2xl border border-slate-200 shadow-sm">
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-accent-amber flex items-center justify-center mb-4">
            <BatteryCharging className="w-5 h-5" />
          </div>
          <h3 className="font-heading font-bold text-base text-slate-900 mb-2">Ultra-Low Power Mode</h3>
          <p className="text-xs text-slate-600 leading-relaxed">
            No heavy background network polls or bulky third-party tracking SDKs. Clean native rendering using Lucide icons and system-optimized typography.
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
          SidPrep 2.0 is currently distributed via verified direct APK install for beta learners. Google Play Store listing will launch following official closed testing completion. We never charge subscription fees for core educational catalogues.
        </p>
      </div>
    </div>
    </PublicShell>
  );
}
