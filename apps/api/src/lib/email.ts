import nodemailer from 'nodemailer';
import { env } from '../config/index.js';
import { db } from '../db/index.js';
import { query } from '../db/pool.js';

export interface SendEmailOptions {
  toEmail: string;
  toName?: string;
  subject: string;
  htmlContent: string;
  textContent?: string;
  isPriorityOtp?: boolean;
}

/**
 * Brevo SMTP Relay Transporter
 * Host: smtp-relay.brevo.com
 * Port: 587 (STARTTLS)
 */
function createTransporter() {
  const host = env.BREVO_SMTP_HOST || 'smtp-relay.brevo.com';
  const port = Number(env.BREVO_SMTP_PORT) || 587;
  const user = env.BREVO_SMTP_USER || '';
  const pass = env.BREVO_SMTP_PASS || env.BREVO_API_KEY;

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465, // false for 587 (STARTTLS)
    auth: {
      user,
      pass,
    },
    tls: {
      // INVARIANT F19: Strict CA certificate verification; reject unauthorized certificates in production
      rejectUnauthorized: env.NODE_ENV === 'production',
    },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });
}

/**
 * Send transactional email using Brevo SMTP relay with durable quota reservations
 */
export async function sendEmail(
  options: SendEmailOptions
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  // Check durable daily quota before attempting dispatch (F20)
  const quotaRes = await db.reserveEmailQuota('brevo', Boolean(options.isPriorityOtp));
  if (!quotaRes.allowed) {
    console.error(`[Email] Daily email quota exceeded (${quotaRes.usedToday}/${env.BREVO_DAILY_QUOTA_LIMIT}). Dispatch blocked for ${options.toEmail}`);
    return {
      success: false,
      error: quotaRes.reason || 'DAILY_QUOTA_EXHAUSTED',
    };
  }

  // Check mock conditions
  const isMockConfigured =
    !env.BREVO_SMTP_PASS ||
    env.BREVO_SMTP_PASS.includes('dev-only') ||
    env.BREVO_SMTP_PASS.includes('REPLACE_ME') ||
    !env.BREVO_API_KEY ||
    env.BREVO_API_KEY.includes('mock');

  // INVARIANT F19: In production mode, mock delivery is strictly prohibited. Real SMTP must be configured.
  if (isMockConfigured) {
    if (env.NODE_ENV === 'production') {
      console.error(`[Email] FATAL: Production environment cannot use mock SMTP. Real credentials required.`);
      return { success: false, error: 'PRODUCTION_SMTP_UNCONFIGURED' };
    }
    console.log(`[Email] MOCK SMTP DISPATCH to ${options.toEmail}: ${options.subject}`);
    return { success: true, messageId: `mock_msg_${Date.now()}` };
  }

  try {
    const transporter = createTransporter();
    const senderName = env.BREVO_SENDER_NAME && env.BREVO_SENDER_NAME !== 'SidPrep Notifications' ? env.BREVO_SENDER_NAME : 'SidPrep';
    const senderEmail = env.BREVO_SENDER_EMAIL || 'no-reply@sidprep.in';
    const sender = `"${senderName}" <${senderEmail}>`;

    const info = await transporter.sendMail({
      from: sender,
      to: options.toName ? `"${options.toName}" <${options.toEmail}>` : options.toEmail,
      subject: options.subject,
      html: options.htmlContent,
      text: options.textContent,
    });

    console.log(`[Email] Successfully dispatched email to ${options.toEmail}. MessageId: ${info.messageId}`);
    return { success: true, messageId: info.messageId };
  } catch (err: any) {
    console.error(`[Email] Brevo SMTP error sending to ${options.toEmail}:`, err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Dispatch Student 6-digit verification code OTP
 */
export async function sendStudentOtpEmail(
  studentEmail: string,
  otp: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const htmlContent = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="utf-8">
      <title>SidPrep Verification Code</title>
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f7f7f2; margin: 0; padding: 24px; color: #1e293b;">
      <div style="max-width: 540px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
        <div style="background-color: #1E3C2C; padding: 28px 24px; text-align: center;">
          <h1 style="color: #ffffff; margin: 0; font-size: 22px; font-weight: 800; letter-spacing: -0.5px;">
            SidPrep <span style="background: rgba(223, 241, 155, 0.25); color: #DFF19B; font-size: 13px; padding: 2px 8px; border-radius: 6px; font-weight: 600;">2.0</span>
          </h1>
          <p style="color: #94a3b8; font-size: 12px; margin: 6px 0 0 0;">SSC • RRB • WBPSC • IBPS Preparation Portal</p>
        </div>
        
        <div style="padding: 32px 28px;">
          <h2 style="color: #0f172a; font-size: 18px; font-weight: 700; margin-top: 0; margin-bottom: 8px;">
            Your Login Verification Code
          </h2>
          <p style="color: #475569; font-size: 14px; line-height: 1.6; margin-top: 0; margin-bottom: 24px;">
            Enter the 6-digit code below to sign in or register your student account. This code is valid for 10 minutes.
          </p>
          
          <div style="background-color: #f0fdf4; border: 1.5px dashed #22c55e; border-radius: 12px; padding: 20px; text-align: center; margin-bottom: 24px;">
            <div style="font-family: 'Courier New', Courier, monospace; font-size: 34px; font-weight: 800; letter-spacing: 10px; color: #166534;">
              ${otp}
            </div>
            <p style="color: #15803d; font-size: 11px; font-weight: 600; margin: 8px 0 0 0;">
              SINGLE-USE VERIFICATION CODE (EXPIRES IN 10 MINUTES)
            </p>
          </div>
          
          <p style="color: #64748b; font-size: 12px; line-height: 1.5; margin-bottom: 0;">
            If you did not request this verification code, you can safely ignore this email. No changes will be made to your account.
          </p>
        </div>
        
        <div style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 16px 24px; text-align: center;">
          <p style="color: #94a3b8; font-size: 11px; margin: 0;">
            SidPrep 2.0 Notification Service • Sourced via Brevo SMTP Relay
          </p>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail({
    toEmail: studentEmail,
    subject: `Your SidPrep Login Code: ${otp}`,
    htmlContent,
    textContent: `Your SidPrep 2.0 verification code is: ${otp}. It will expire in 10 minutes.`,
    isPriorityOtp: true,
  });
}

export interface AdminOtpEmailMetadata {
  expiryMinutes?: number;
  requestTime?: string;
  deviceInfo?: string;
  ipAddress?: string;
}

/**
 * Dispatch Admin 2FA Login OTP via email (Redesigned per Req 1)
 * Clean, responsive, high-contrast, accessible layout with device/time info and NO OTP in subject.
 */
export async function sendAdminOtpEmail(
  adminEmail: string,
  otp: string,
  meta: AdminOtpEmailMetadata = {}
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const expiryMinutes = meta.expiryMinutes || 10;
  const requestTime = meta.requestTime || new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' }) + ' IST';
  const deviceInfo = meta.deviceInfo || 'Standard Web Browser';
  const ipAddress = meta.ipAddress ? ` (IP: ${meta.ipAddress})` : '';

  const htmlContent = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Your SidPrep sign-in verification code</title>
      <style>
        @media only screen and (max-width: 600px) {
          .email-container { width: 100% !important; padding: 16px !important; }
          .code-box { font-size: 30px !important; letter-spacing: 6px !important; }
        }
      </style>
    </head>
    <body style="margin: 0; padding: 24px; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #0f172a; -webkit-font-smoothing: antialiased;">
      <!-- Invisible preheader text for preview windows - no OTP exposed -->
      <div style="display: none; max-height: 0px; overflow: hidden; opacity: 0; font-size: 1px; line-height: 1px; color: #fff;">
        Use this verification code to complete your SidPrep administrator sign-in. This code expires in ${expiryMinutes} minutes.
      </div>

      <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
        <tr>
          <td align="center">
            <table role="presentation" class="email-container" border="0" cellpadding="0" cellspacing="0" width="560" style="max-width: 560px; background-color: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03);">
              <!-- Brand Header -->
              <tr>
                <td style="background-color: #1e1b4b; padding: 24px 32px; text-align: left; border-bottom: 3px solid #4f46e5;">
                  <span style="display: inline-block; font-size: 22px; font-weight: 800; color: #ffffff; letter-spacing: -0.5px;">
                    Sid<span style="color: #818cf8;">Prep</span>
                  </span>
                  <span style="display: inline-block; margin-left: 8px; padding: 3px 8px; background-color: rgba(99, 102, 241, 0.2); border: 1px solid #6366f1; border-radius: 6px; color: #c7d2fe; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">
                    Staff Console
                  </span>
                </td>
              </tr>

              <!-- Body Content -->
              <tr>
                <td style="padding: 36px 32px 28px 32px;">
                  <h1 style="margin: 0 0 12px 0; font-size: 20px; font-weight: 800; color: #0f172a; line-height: 1.3;">
                    Sign-in Verification
                  </h1>
                  <p style="margin: 0 0 24px 0; font-size: 14px; line-height: 1.6; color: #334155;">
                    A sign-in attempt was initiated for your administrator account (<strong style="color: #0f172a;">${adminEmail}</strong>). Enter the verification code below to complete sign-in:
                  </p>

                  <!-- 6-digit Code Box -->
                  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin: 0 0 24px 0;">
                    <tr>
                      <td align="center" style="background-color: #f1f5f9; border: 2px dashed #cbd5e1; border-radius: 10px; padding: 22px 16px;">
                        <div class="code-box" style="font-family: 'SF Mono', Consolas, Monaco, 'Courier New', monospace; font-size: 34px; font-weight: 800; letter-spacing: 10px; color: #312e81; user-select: all;">
                          ${otp}
                        </div>
                        <p style="margin: 8px 0 0 0; font-size: 12px; font-weight: 600; color: #64748b;">
                          Valid for ${expiryMinutes} minutes
                        </p>
                      </td>
                    </tr>
                  </table>

                  <!-- Context / Request Details -->
                  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px 16px; margin: 0 0 24px 0;">
                    <tr>
                      <td style="font-size: 12px; line-height: 1.6; color: #475569;">
                        <strong style="color: #1e293b;">Request Time:</strong> ${requestTime}<br>
                        <strong style="color: #1e293b;">Device / Browser:</strong> ${deviceInfo}${ipAddress}
                      </td>
                    </tr>
                  </table>

                  <!-- "If this wasn't you" Security Guidance -->
                  <div style="background-color: #fef2f2; border-left: 4px solid #ef4444; border-radius: 4px; padding: 12px 16px; margin: 0 0 20px 0;">
                    <p style="margin: 0; font-size: 12px; line-height: 1.6; color: #991b1b;">
                      <strong>If you did not make this request:</strong> Someone may know your password. Change your administrator password immediately, revoke all active sessions and trusted devices, and alert your Super Admin.
                    </p>
                  </div>

                  <p style="margin: 0; font-size: 12px; line-height: 1.5; color: #64748b;">
                    Never share this code with anyone. SidPrep staff will never ask you for your verification code.
                  </p>
                </td>
              </tr>

              <!-- Clean Footer without SMTP / provider names -->
              <tr>
                <td style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 18px 32px; text-align: center;">
                  <p style="margin: 0; font-size: 11px; color: #64748b; line-height: 1.5;">
                    SidPrep Educational Platform • Security & Identity Service<br>
                    This is an automated operational notification.
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;

  const textContent = [
    'SidPrep Staff Console - Sign-in Verification',
    '',
    `Your 6-digit sign-in verification code is: ${otp}`,
    `This code expires in ${expiryMinutes} minutes.`,
    '',
    `Account: ${adminEmail}`,
    `Request Time: ${requestTime}`,
    `Device / Browser: ${deviceInfo}${ipAddress}`,
    '',
    "If you did not make this request, someone may know your password. Change your password immediately, revoke all trusted devices, and alert your Super Admin.",
    '',
    'Never share this code with anyone. SidPrep will never ask for your code.',
  ].join('\n');

  return sendEmail({
    toEmail: adminEmail,
    subject: 'Your SidPrep sign-in verification code',
    htmlContent,
    textContent,
    isPriorityOtp: true,
  });
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
    textContent: `SidPrep 2.0 Admin Credentials:\nEmail: ${adminEmail}\nPassword: ${generatedPassword}\n2FA Seed: 123456`,
    isPriorityOtp: true,
  });
}

/**
 * Dispatch Admin Password Reset Link (15-minute single-use expiry)
 */
export async function sendAdminPasswordResetEmail(
  adminEmail: string,
  resetLink: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const htmlContent = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background: #0f172a; color: #f8fafc; border-radius: 16px; border: 1px solid #1e293b;">
      <h2 style="color: #6366f1; margin-top: 0;">SidPrep Administrator Password Reset</h2>
      <p style="color: #94a3b8; font-size: 14px;">A password reset request was initiated for your administrator account.</p>
      
      <div style="background: #1e293b; padding: 20px; border-radius: 12px; margin: 20px 0; text-align: center; border: 1px solid #334155;">
        <p style="margin: 0 0 16px 0; font-size: 13px; color: #cbd5e1;">Click the button below to reset your password. This link is valid for 15 minutes and can only be used once:</p>
        <a href="${resetLink}" style="display: inline-block; background: #6366f1; color: #ffffff; padding: 12px 24px; border-radius: 8px; font-weight: 700; text-decoration: none; font-size: 14px;">Reset Administrator Password</a>
      </div>

      <p style="font-size: 12px; color: #94a3b8;">If you did not request this password reset, please contact system security immediately. Your account remains secure.</p>
      <hr style="border: none; border-top: 1px solid #334155; margin: 24px 0;" />
      <p style="font-size: 11px; color: #64748b; margin: 0;">SidPrep 2.0 Security Operations • Automated Security Notification</p>
    </div>
  `;

  return sendEmail({
    toEmail: adminEmail,
    subject: 'SidPrep Admin Password Reset Request',
    htmlContent,
    textContent: `A password reset was requested for your SidPrep administrator account. Use this link within 15 minutes to reset your password: ${resetLink}\n\nIf you did not request this, contact security immediately.`,
    isPriorityOtp: true,
  });
}

/**
 * Dispatch Admin Password Changed Security Notification
 */
export async function sendAdminPasswordChangedEmail(
  adminEmail: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const htmlContent = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background: #0f172a; color: #f8fafc; border-radius: 16px; border: 1px solid #1e293b;">
      <h2 style="color: #22c55e; margin-top: 0;">SidPrep Administrator Password Updated</h2>
      <p style="color: #cbd5e1; font-size: 14px;">The password for your administrator account (<strong style="color: #ffffff;">${adminEmail}</strong>) has been successfully updated.</p>
      <p style="color: #94a3b8; font-size: 13px;">All existing administrative sessions have been terminated. You must sign in using your new password and complete standard 2FA.</p>
      <div style="background: #1e293b; padding: 14px; border-radius: 8px; margin: 18px 0; border: 1px solid #334155;">
        <p style="color: #f87171; font-size: 12px; margin: 0;"><strong>Security Notice:</strong> If you did not make this change, your credentials may be compromised. Alert security operations immediately.</p>
      </div>
      <p style="font-size: 11px; color: #64748b; margin: 0;">SidPrep 2.0 Security Operations</p>
    </div>
  `;

  return sendEmail({
    toEmail: adminEmail,
    subject: 'Security Alert: SidPrep Administrator Password Changed',
    htmlContent,
    textContent: `Your SidPrep administrator password has been updated. All active sessions have been terminated. If you did not make this change, alert security immediately.`,
    isPriorityOtp: true,
  });
}

/**
 * Dispatch Student Password Reset Link (15-minute single-use expiry)
 */
export async function sendStudentPasswordResetEmail(
  studentEmail: string,
  resetLink: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const htmlContent = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 540px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
      <div style="background-color: #1E3C2C; padding: 24px; text-align: center;">
        <h1 style="color: #ffffff; margin: 0; font-size: 20px; font-weight: 800;">SidPrep Preparation Portal</h1>
      </div>
      <div style="padding: 32px 28px;">
        <h2 style="color: #0f172a; font-size: 18px; font-weight: 700; margin-top: 0;">Password Reset Request</h2>
        <p style="color: #475569; font-size: 14px; line-height: 1.6;">
          We received a request to reset the password for your student account. Click the button below to set a new password:
        </p>
        <div style="text-align: center; margin: 28px 0;">
          <a href="${resetLink}" style="display: inline-block; background-color: #1E3C2C; color: #ffffff; padding: 12px 28px; border-radius: 10px; font-weight: 700; text-decoration: none; font-size: 14px;">Reset Password</a>
        </div>
        <p style="color: #64748b; font-size: 12px; line-height: 1.5;">
          This link will expire in 15 minutes and can only be used once. If you did not request a password reset, you can safely ignore this email.
        </p>
      </div>
      <div style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 16px 24px; text-align: center;">
        <p style="color: #94a3b8; font-size: 11px; margin: 0;">SidPrep 2.0 Student Identity Service</p>
      </div>
    </div>
  `;

  return sendEmail({
    toEmail: studentEmail,
    subject: 'Reset Your SidPrep Student Password',
    htmlContent,
    textContent: `We received a request to reset your SidPrep password. Visit the following link within 15 minutes to reset it: ${resetLink}\n\nIf you did not request this, you can ignore this email.`,
    isPriorityOtp: true,
  });
}

/**
 * Dispatch Student Password Setup Link (For existing OTP-only accounts)
 */
export async function sendStudentPasswordSetupEmail(
  studentEmail: string,
  setupLink: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const htmlContent = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 540px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
      <div style="background-color: #1E3C2C; padding: 24px; text-align: center;">
        <h1 style="color: #ffffff; margin: 0; font-size: 20px; font-weight: 800;">SidPrep Preparation Portal</h1>
      </div>
      <div style="padding: 32px 28px;">
        <h2 style="color: #0f172a; font-size: 18px; font-weight: 700; margin-top: 0;">Set Up Your Student Password</h2>
        <p style="color: #475569; font-size: 14px; line-height: 1.6;">
          Your SidPrep account is ready for direct password login. Click below to establish your password. Your existing preparation history and progress will remain intact.
        </p>
        <div style="text-align: center; margin: 28px 0;">
          <a href="${setupLink}" style="display: inline-block; background-color: #1E3C2C; color: #ffffff; padding: 12px 28px; border-radius: 10px; font-weight: 700; text-decoration: none; font-size: 14px;">Set My Password</a>
        </div>
        <p style="color: #64748b; font-size: 12px; line-height: 1.5;">
          This link is valid for 15 minutes. Once set, you can log in directly using your email and password on both the web and mobile apps.
        </p>
      </div>
      <div style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 16px 24px; text-align: center;">
        <p style="color: #94a3b8; font-size: 11px; margin: 0;">SidPrep 2.0 Student Identity Service</p>
      </div>
    </div>
  `;

  return sendEmail({
    toEmail: studentEmail,
    subject: 'Set Your SidPrep Student Password',
    htmlContent,
    textContent: `Set up your password for direct login on SidPrep: ${setupLink}\n\nThis single-use link expires in 15 minutes.`,
    isPriorityOtp: true,
  });
}

/**
 * Dispatch Student Password Changed Notification
 */
export async function sendStudentPasswordChangedEmail(
  studentEmail: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const htmlContent = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 540px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
      <div style="background-color: #1E3C2C; padding: 24px; text-align: center;">
        <h1 style="color: #ffffff; margin: 0; font-size: 20px; font-weight: 800;">SidPrep Security Notification</h1>
      </div>
      <div style="padding: 32px 28px;">
        <h2 style="color: #0f172a; font-size: 18px; font-weight: 700; margin-top: 0;">Your Password Was Changed</h2>
        <p style="color: #475569; font-size: 14px; line-height: 1.6;">
          The password for your SidPrep account was successfully updated. All other active sessions have been revoked.
        </p>
        <p style="color: #dc2626; font-size: 13px; font-weight: 600;">
          If you did not make this change, please contact SidPrep support immediately.
        </p>
      </div>
      <div style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 16px 24px; text-align: center;">
        <p style="color: #94a3b8; font-size: 11px; margin: 0;">SidPrep 2.0 Account Security</p>
      </div>
    </div>
  `;

  return sendEmail({
    toEmail: studentEmail,
    subject: 'Your SidPrep Password Has Been Changed',
    htmlContent,
    textContent: `Your SidPrep student password was changed. If you did not make this change, contact support immediately.`,
    isPriorityOtp: true,
  });
}

/**
 * Live Brevo Quota Monitor & Synchronizer
 * Queries Brevo API v3 directly if real key is configured,
 * otherwise falls back seamlessly to durable PostgreSQL ledger.
 */
export async function getLiveBrevoQuota(): Promise<{
  usedToday: number;
  limit: number;
  remaining: number;
  warnThreshold: number;
  dateIst: string;
  source: 'BREVO_LIVE_API' | 'POSTGRES_LEDGER' | 'LOCAL_FALLBACK';
  syncedAt: string;
}> {
  const dateIst = db.getTodayIst();
  const limit = env.BREVO_DAILY_QUOTA_LIMIT || 300;
  const warnThreshold = env.BREVO_DAILY_QUOTA_WARN_THRESHOLD || 250;

  const apiKey = env.BREVO_API_KEY;
  const isRealApiKey =
    apiKey &&
    !apiKey.includes('mock') &&
    !apiKey.includes('REPLACE_ME') &&
    apiKey.trim().length > 10;

  if (isRealApiKey) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);

      const resp = await fetch(
        `https://api.brevo.com/v3/smtp/statistics/reports?startDate=${dateIst}&endDate=${dateIst}`,
        {
          method: 'GET',
          headers: {
            'api-key': apiKey.trim(),
            accept: 'application/json',
          },
          signal: controller.signal,
        }
      );
      clearTimeout(timeout);

      if (resp.ok) {
        const data = (await resp.json()) as any;
        const reports = Array.isArray(data?.reports) ? data.reports : [];
        const totalSent = reports.reduce((acc: number, r: any) => {
          return acc + (Number(r.delivered || r.requests) || 0);
        }, 0);

        db.brevoSendsToday = totalSent;
        try {
          const quotaId = `eql_brevo_${dateIst}`;
          await query(
            `INSERT INTO email_quota_ledger (id, provider, date_ist, sent_count, cap_limit, updated_at)
             VALUES ($1, 'brevo', $2, $3, $4, NOW())
             ON CONFLICT (provider, date_ist)
             DO UPDATE SET sent_count = $3, updated_at = NOW()`,
            [quotaId, dateIst, totalSent, limit]
          );
        } catch (dbErr: any) {
          console.warn('[Brevo] Failed to update email_quota_ledger with live count:', dbErr.message);
        }

        return {
          usedToday: totalSent,
          limit,
          remaining: Math.max(0, limit - totalSent),
          warnThreshold,
          dateIst,
          source: 'BREVO_LIVE_API',
          syncedAt: new Date().toISOString(),
        };
      } else {
        console.warn(`[Brevo] Live API returned status ${resp.status}`);
      }
    } catch (err: any) {
      console.warn('[Brevo] Live API quota fetch warning:', err.message);
    }
  }

  // Fallback to durable PostgreSQL ledger
  const ledger = await db.getEmailQuotaUsage('brevo');
  return {
    usedToday: ledger.usedToday,
    limit: ledger.limit,
    remaining: ledger.remaining,
    warnThreshold,
    dateIst: ledger.dateIst,
    source: isRealApiKey ? 'POSTGRES_LEDGER' : 'LOCAL_FALLBACK',
    syncedAt: new Date().toISOString(),
  };
}
