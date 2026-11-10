import { config } from 'dotenv';
import { z } from 'zod';

config();

const isDev = (process.env.NODE_ENV ?? 'development') !== 'production';

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.coerce.number().default(4000),
    API_PORT: z.coerce.number().default(4000),
    WEB_PORT: z.coerce.number().default(3000),
    DATABASE_URL: z.string().optional(),
    JWT_SECRET: isDev
      ? z.string().default('dev-only-do-not-use-jwt-secret-min-32-chars-long-12345')
      : z.string().min(32, 'FATAL: In production mode, JWT_SECRET must be at least 32 characters long.'),
    JWT_REFRESH_SECRET: isDev
      ? z.string().default('dev-only-do-not-use-jwt-refresh-secret-min-32-chars-67890')
      : z.string().min(32, 'FATAL: In production mode, JWT_REFRESH_SECRET must be at least 32 characters long.'),
    ADMIN_SESSION_SECRET: isDev
      ? z.string().default('dev-only-do-not-use-admin-session-cookie-secret-32-chars')
      : z.string().min(32, 'FATAL: In production mode, ADMIN_SESSION_SECRET must be at least 32 characters long.'),
    ADMIN_EMAIL: z.string().default('admin@sidprep.in'),
    ADMIN_PASSWORD: isDev
      ? z.string().default('dev-only-do-not-use-admin-password')
      : z.string().optional(),
    CORS_ALLOWED_ORIGINS: z.string().default('http://localhost:3000,https://sidprep.in'),
    BREVO_API_KEY: z.string().default('brevo-mock-local-key'),
    BREVO_SMTP_HOST: z.string().default('smtp-relay.brevo.com'),
    BREVO_SMTP_PORT: z.coerce.number().default(587),
    BREVO_SMTP_USER: z.string().default(''),
    BREVO_SMTP_PASS: isDev
      ? z.string().default('dev-only-do-not-use-brevo-smtp-pass')
      : z.string().min(1, 'FATAL: In production mode, BREVO_SMTP_PASS is required.'),
    BREVO_SENDER_EMAIL: z.string().default('no-reply@sidprep.in'),
    BREVO_SENDER_NAME: z.string().default('SidPrep'),
    BREVO_DAILY_QUOTA_LIMIT: z.coerce.number().default(300),
    BREVO_DAILY_QUOTA_WARN_THRESHOLD: z.coerce.number().default(250),
    STORAGE_DRIVER: z.enum(['local', 'r2']).default('r2'),
    STORAGE_LOCAL_DIR: z.string().default('./uploads'),
    R2_ENDPOINT: z.string().default(''),
    R2_ACCESS_KEY_ID: isDev
      ? z.string().default('dev-only-do-not-use-r2-access-key-id')
      : z.string().min(1, 'FATAL: In production mode, R2_ACCESS_KEY_ID is required.'),
    R2_SECRET_ACCESS_KEY: isDev
      ? z.string().default('dev-only-do-not-use-r2-secret-access-key')
      : z.string().min(1, 'FATAL: In production mode, R2_SECRET_ACCESS_KEY is required.'),
    R2_BUCKET_NAME: z.string().default('sidprep-cdn-prod'),
    R2_PUBLIC_DOMAIN: z.string().default('https://cdn.sidprep.in'),
    R2_MONTHLY_QUOTA_BYTES: z.coerce.number().default(10737418240), // 10 GB
    NEWS_TIMEZONE: z.string().default('Asia/Kolkata'),
    NEWS_AUTO_PUBLISH_ENABLED: z.coerce.boolean().default(false),
    NEWS_AUTO_PUBLISH_CONFIDENCE_THRESHOLD: z.coerce.number().default(0.92),
  })
  .superRefine((data, ctx) => {
    if (data.NODE_ENV === 'production') {
      const requiredSecrets: Array<{ key: keyof typeof data; name: string; minLen?: number }> = [
        { key: 'JWT_SECRET', name: 'JWT_SECRET', minLen: 32 },
        { key: 'JWT_REFRESH_SECRET', name: 'JWT_REFRESH_SECRET', minLen: 32 },
        { key: 'ADMIN_SESSION_SECRET', name: 'ADMIN_SESSION_SECRET', minLen: 32 },
        { key: 'BREVO_SMTP_PASS', name: 'BREVO_SMTP_PASS', minLen: 1 },
        { key: 'R2_ACCESS_KEY_ID', name: 'R2_ACCESS_KEY_ID', minLen: 1 },
        { key: 'R2_SECRET_ACCESS_KEY', name: 'R2_SECRET_ACCESS_KEY', minLen: 1 },
      ];

      for (const secret of requiredSecrets) {
        const val = data[secret.key] as string | undefined;
        if (!val || val.trim() === '') {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [secret.key],
            message: `FATAL: In production mode, ${secret.name} is required and must be configured in environment variables.`,
          });
        } else if (
          val.includes('dev-only') ||
          val.includes('do-not-use') ||
          val.includes('do_not_use') ||
          val.includes('REPLACE_ME')
        ) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [secret.key],
            message: `FATAL: In production mode, ${secret.name} cannot use placeholder or development default values.`,
          });
        } else if (secret.minLen && val.length < secret.minLen) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [secret.key],
            message: `FATAL: In production mode, ${secret.name} must be at least ${secret.minLen} characters long.`,
          });
        }
      }
    }
  });

export type Env = z.infer<typeof EnvSchema>;

export const env: Env = EnvSchema.parse(process.env);
