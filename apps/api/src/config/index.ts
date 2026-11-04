import { config } from 'dotenv';
import { z } from 'zod';

config();

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.coerce.number().default(4000),
    API_PORT: z.coerce.number().default(4000),
    WEB_PORT: z.coerce.number().default(3000),
    DATABASE_URL: z.string().optional(),
    JWT_SECRET: z.string().default('sidprep_development_secret_do_not_use_in_production_key_12345'),
    JWT_REFRESH_SECRET: z.string().default('sidprep_dev_refresh_secret_key_67890'),
    ADMIN_SESSION_SECRET: z.string().default('sidprep_admin_session_secret_cookie_key'),
    CORS_ALLOWED_ORIGINS: z.string().default('http://localhost:3000,https://sidprep.in'),
    BREVO_API_KEY: z.string().default('xkeysib-mock-local'),
    BREVO_SENDER_EMAIL: z.string().default('no-reply@sidprep.in'),
    BREVO_SENDER_NAME: z.string().default('SidPrep Notifications'),
    BREVO_DAILY_QUOTA_LIMIT: z.coerce.number().default(300),
    BREVO_DAILY_QUOTA_WARN_THRESHOLD: z.coerce.number().default(250),
    STORAGE_DRIVER: z.enum(['local', 'r2']).default('local'),
    STORAGE_LOCAL_DIR: z.string().default('./uploads'),
    R2_MONTHLY_QUOTA_BYTES: z.coerce.number().default(10737418240), // 10 GB
    NEWS_TIMEZONE: z.string().default('Asia/Kolkata'),
    NEWS_AUTO_PUBLISH_ENABLED: z.coerce.boolean().default(false),
    NEWS_AUTO_PUBLISH_CONFIDENCE_THRESHOLD: z.coerce.number().default(0.92),
  })
  .refine(
    (data) => {
      if (data.NODE_ENV === 'production') {
        const isDefaultSecret =
          data.JWT_SECRET.includes('do_not_use_in_production') || data.JWT_SECRET.length < 32;
        return !isDefaultSecret;
      }
      return true;
    },
    {
      message:
        'FATAL: In production mode, a strong non-default JWT_SECRET (minimum 32 characters) must be configured in environment variables.',
      path: ['JWT_SECRET'],
    }
  );

export type Env = z.infer<typeof EnvSchema>;

export const env: Env = EnvSchema.parse(process.env);
