import { env } from '../config/index.js';

export interface SendEmailOptions {
  toEmail: string;
  toName?: string;
  subject: string;
  htmlContent: string;
}

/**
 * Lightweight transactional email client using native fetch to Brevo v3 API
 * Ponytail rule: Zero external SDK dependencies, uses native standard library.
 */
export async function sendEmail(
  options: SendEmailOptions
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  // If mock or missing API key
  if (!env.BREVO_API_KEY || env.BREVO_API_KEY.includes('mock-local')) {
    console.log(`[Email] MOCK DISPATCH to ${options.toEmail}: ${options.subject}`);
    return { success: true, messageId: `mock_msg_${Date.now()}` };
  }

  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': env.BREVO_API_KEY,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        sender: {
          name: env.BREVO_SENDER_NAME,
          email: env.BREVO_SENDER_EMAIL,
        },
        to: [{ email: options.toEmail, name: options.toName || options.toEmail }],
        subject: options.subject,
        htmlContent: options.htmlContent,
      }),
    });

    const data = (await res.json().catch(() => null)) as any;
    if (!res.ok) {
      const errMsg = data?.message || `Brevo API returned HTTP ${res.status}`;
      console.error(`[Email] Failed to send email to ${options.toEmail}:`, errMsg);
      return { success: false, error: errMsg };
    }

    return { success: true, messageId: data?.messageId };
  } catch (err: any) {
    console.error(`[Email] Network error sending email to ${options.toEmail}:`, err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Dispatch administrative access credentials directly to staff inbox
 */
export async function sendAdminCredentialsEmail(
  adminEmail: string,
  generatedPassword: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const htmlContent = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background: #0f172a; color: #f8fafc; border-radius: 16px; border: 1px solid #1e293b;">
      <h2 style="color: #6366f1; margin-top: 0;">SidPrep 2.0 Security Console Credentials</h2>
      <p style="color: #94a3b8; font-size: 14px;">Your administrative access has been initialized with system-generated credentials:</p>
      
      <div style="background: #1e293b; padding: 16px; border-radius: 12px; margin: 20px 0; border: 1px solid #334155;">
        <p style="margin: 6px 0; font-size: 13px;"><strong style="color: #94a3b8;">Staff Email:</strong> <code style="color: #38bdf8; font-size: 14px; font-weight: 600;">${adminEmail}</code></p>
        <p style="margin: 6px 0; font-size: 13px;"><strong style="color: #94a3b8;">System Password:</strong> <code style="color: #4ade80; font-size: 16px; font-weight: bold;">${generatedPassword}</code></p>
        <p style="margin: 6px 0; font-size: 13px;"><strong style="color: #94a3b8;">Initial 2FA Seed Code:</strong> <code style="color: #facc15; font-size: 14px; font-weight: 600;">123456</code></p>
      </div>

      <p style="font-size: 13px; color: #cbd5e1;">Access the console here: <a href="https://sidprep.in/admin/login" style="color: #6366f1; font-weight: 600; text-decoration: underline;">https://sidprep.in/admin/login</a></p>
      <hr style="border: none; border-top: 1px solid #334155; margin: 24px 0;" />
      <p style="font-size: 11px; color: #64748b; margin: 0;">This is an automated system dispatch from SidPrep 2.0. All administrative sessions are recorded in the immutable audit ledger.</p>
    </div>
  `;

  return sendEmail({
    toEmail: adminEmail,
    subject: 'SidPrep 2.0 Administrative Credentials & Login Access',
    htmlContent,
  });
}
