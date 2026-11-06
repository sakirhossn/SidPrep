import { S3Client, PutObjectCommand, GetObjectCommand, HeadBucketCommand } from '@aws-sdk/client-s3';
import fs from 'node:fs';
import path from 'node:path';
import { env } from '../config/index.js';

let s3ClientInstance: S3Client | null = null;

function getS3Client(): S3Client {
  if (!s3ClientInstance) {
    s3ClientInstance = new S3Client({
      region: 'auto',
      endpoint: env.R2_ENDPOINT,
      credentials: {
        accessKeyId: env.R2_ACCESS_KEY_ID,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY,
      },
    });
  }
  return s3ClientInstance;
}

export interface UploadResult {
  success: boolean;
  driver: 'r2' | 'local';
  url: string;
  key: string;
  sizeBytes: number;
  error?: string;
}

/**
 * Upload a file/buffer to Cloudflare R2 (or local fallback)
 */
export async function uploadFile(
  key: string,
  buffer: Buffer,
  contentType: string
): Promise<UploadResult> {
  const cleanKey = key.replace(/^\/+/, '');

  if (env.STORAGE_DRIVER === 'r2') {
    try {
      const s3 = getS3Client();
      await s3.send(
        new PutObjectCommand({
          Bucket: env.R2_BUCKET_NAME,
          Key: cleanKey,
          Body: buffer,
          ContentType: contentType,
        })
      );

      const publicUrl = `${env.R2_PUBLIC_DOMAIN.replace(/\/+$/, '')}/${cleanKey}`;
      console.log(`[Storage/R2] Successfully uploaded ${cleanKey} to Cloudflare R2: ${publicUrl}`);

      return {
        success: true,
        driver: 'r2',
        url: publicUrl,
        key: cleanKey,
        sizeBytes: buffer.length,
      };
    } catch (err: any) {
      console.error(`[Storage/R2] Cloudflare R2 upload error for ${cleanKey}:`, err.message);
      // Fallback to local storage if R2 fails
      return saveLocalFile(cleanKey, buffer);
    }
  }

  return saveLocalFile(cleanKey, buffer);
}

/**
 * Save file locally in STORAGE_LOCAL_DIR
 */
function saveLocalFile(key: string, buffer: Buffer): UploadResult {
  try {
    const dir = path.resolve(env.STORAGE_LOCAL_DIR);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const filePath = path.join(dir, key);
    fs.writeFileSync(filePath, buffer);

    return {
      success: true,
      driver: 'local',
      url: `/uploads/${key}`,
      key,
      sizeBytes: buffer.length,
    };
  } catch (err: any) {
    console.error(`[Storage/Local] Failed to save local file ${key}:`, err.message);
    return {
      success: false,
      driver: 'local',
      url: `/uploads/${key}`,
      key,
      sizeBytes: buffer.length,
      error: err.message,
    };
  }
}

/**
 * Get public download or streaming URL for a resource
 */
export function getResourcePublicUrl(key: string): string {
  const cleanKey = key.replace(/^\/+/, '').replace(/^uploads\//, '');
  if (env.STORAGE_DRIVER === 'r2') {
    return `${env.R2_PUBLIC_DOMAIN.replace(/\/+$/, '')}/${cleanKey}`;
  }
  return `/v1/downloads/stream/${cleanKey}`;
}

/**
 * Verify Cloudflare R2 bucket connectivity
 */
export async function testR2Connection(): Promise<{ connected: boolean; error?: string }> {
  try {
    const s3 = getS3Client();
    await s3.send(new HeadBucketCommand({ Bucket: env.R2_BUCKET_NAME }));
    return { connected: true };
  } catch (err: any) {
    return { connected: false, error: err.message };
  }
}
