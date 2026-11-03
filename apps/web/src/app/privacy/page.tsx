import { PublicShell } from '@/components/public-shell';

export default function PrivacyPage() {
  return (
    <PublicShell>
      <div className="py-16 md:py-24 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <h1 className="font-heading font-extrabold text-3xl text-slate-900 mb-6">
          Privacy Policy
        </h1>
        <div className="prose prose-slate text-sm leading-relaxed space-y-5 text-slate-700">
          <p><strong>Effective Date:</strong> November 2026</p>
          <p>
            SidPrep (&quot;we&quot;, &quot;our&quot;, &quot;us&quot;) prioritizes candidate privacy. This privacy notice explains how we collect, use, and safeguard your data when using the SidPrep website, mobile app, and API.
          </p>
          <h3 className="font-heading font-bold text-base text-slate-900">1. Data We Collect</h3>
          <ul className="list-disc pl-5 space-y-1.5 text-xs">
            <li><strong>Account Information:</strong> Email address for login OTP dispatch. Optional phone number.</li>
            <li><strong>Learning Activity:</strong> Target exam selections, test attempt responses, scores, accuracy, and study plan completion status.</li>
            <li><strong>Technical Telemetry:</strong> Anonymized app diagnostic logs (crashes, rendering failures, API latency) strictly excluding passwords, JWTs, or answers.</li>
          </ul>
          <h3 className="font-heading font-bold text-base text-slate-900">2. How We Use Data</h3>
          <p className="text-xs">
            Your data is used solely to provide your personalized learning experience, compute accurate test analytics, and ensure platform security. We do NOT sell candidate data to coaching centers or third-party advertisers.
          </p>
          <h3 className="font-heading font-bold text-base text-slate-900">3. Email Communications</h3>
          <p className="text-xs">
            We use Brevo to deliver transactional one-time passwords (OTP). We do not send marketing spam or promotional blasts.
          </p>
        </div>
      </div>
    </PublicShell>
  );
}
