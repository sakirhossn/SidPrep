import nodemailer from 'nodemailer';
import { env } from '../config/index.js';

export interface SendEmailOptions {
  toEmail: string;
  toName?: string;
  subject: string;
  htmlContent: string;
  textContent?: string;
}

/**
 * Brevo SMTP Relay Transporter
 * Host: smtp-relay.brevo.com
 * Port: 587 (STARTTLS)
 */
function createTransporter() {
  const host = env.BREVO_SMTP_HOST || 'smtp-relay.brevo.com';
  const port = Number(env.BREVO_SMTP_PORT) || 587;
  const user = env.BREVO_SMTP_USER || 'c0cb63001@smtp-brevo.com';
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
      rejectUnauthorized: false,
    },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });
}

/**
 * Send transactional email using Brevo SMTP relay
 */
export async function sendEmail(
  options: SendEmailOptions
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  // If explicitly mock in testing or development without credentials
  if (!env.BREVO_SMTP_PASS && (!env.BREVO_API_KEY || env.BREVO_API_KEY.includes('mock-local'))) {
    console.log(`[Email] MOCK SMTP DISPATCH to ${options.toEmail}: ${options.subject}`);
    return { success: true, messageId: `mock_msg_${Date.now()}` };
  }

  try {
    const transporter = createTransporter();
    const senderName = env.BREVO_SENDER_NAME && env.BREVO_SENDER_NAME !== 'SidPrep Notifications' ? env.BREVO_SENDER_NAME : 'SidPrep';
    const senderEmail = env.BREVO_SENDER_EMAIL && env.BREVO_SENDER_EMAIL !== 'c0cb63001@smtp-brevo.com' ? env.BREVO_SENDER_EMAIL : 'no-reply@sidprep.in';
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
  });
}

/**
 * Dispatch Admin 2FA Login OTP via email
 */
export async function sendAdminOtpEmail(
  adminEmail: string,
  otp: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const htmlContent = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="utf-8">
      <title>SidPrep Staff Security 2FA Code</title>
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #090d16; margin: 0; padding: 24px; color: #f8fafc;">
      <div style="max-width: 540px; margin: 0 auto; background: #0f172a; border-radius: 16px; border: 1px solid #1e293b; overflow: hidden; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5);">
        <div style="background-color: #1e1b4b; padding: 24px; border-b: 1px solid #312e81; text-align: center;">
          <h1 style="color: #ffffff; margin: 0; font-size: 20px; font-weight: 800; letter-spacing: -0.5px;">
            SidPrep 2.0 Security Console
          </h1>
          <p style="color: #a5b4fc; font-size: 12px; margin: 6px 0 0 0;">Mandatory Staff Two-Factor Authentication</p>
        </div>
        
        <div style="padding: 32px 28px;">
          <h2 style="color: #f8fafc; font-size: 16px; font-weight: 700; margin-top: 0; margin-bottom: 8px;">
            Administrative Access Request
          </h2>
          <p style="color: #94a3b8; font-size: 13px; line-height: 1.6; margin-top: 0; margin-bottom: 24px;">
            A staff sign-in attempt was initiated for <strong style="color: #e2e8f0;">${adminEmail}</strong>. Enter the 2FA security code below:
          </p>
          
          <div style="background-color: #1e293b; border: 1.5px solid #6366f1; border-radius: 12px; padding: 20px; text-align: center; margin-bottom: 24px;">
            <div style="font-family: 'Courier New', Courier, monospace; font-size: 34px; font-weight: 800; letter-spacing: 10px; color: #818cf8;">
              ${otp}
            </div>
            <p style="color: #a5b4fc; font-size: 11px; font-weight: 600; margin: 8px 0 0 0;">
              STAFF 2FA CODE (EXPIRES IN 5 MINUTES)
            </p>
          </div>
          
          <p style="color: #64748b; font-size: 11px; line-height: 1.5; margin-bottom: 0;">
            All administrative sign-in attempts are recorded in the immutable audit ledger. If you did not initiate this request, contact system security immediately.
          </p>
        </div>
        
        <div style="background-color: #020617; border-top: 1px solid #1e293b; padding: 16px 24px; text-align: center;">
          <p style="color: #475569; font-size: 11px; margin: 0;">
            SidPrep 2.0 Security Infrastructure • Automated Delivery via Brevo SMTP Relay
          </p>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail({
    toEmail: adminEmail,
    subject: `SidPrep Admin 2FA Code: ${otp}`,
    htmlContent,
    textContent: `Your SidPrep 2.0 staff 2FA code is: ${otp}. Valid for 5 minutes.`,
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
  });
}
