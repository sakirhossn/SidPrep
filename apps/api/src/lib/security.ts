import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/index.js';

/**
 * Strong password hashing using PBKDF2 with SHA-512
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString('hex');
  return new Promise((resolve, reject) => {
    crypto.pbkdf2(password, salt, 100000, 64, 'sha512', (err, derivedKey) => {
      if (err) return reject(err);
      resolve(`${salt}:${derivedKey.toString('hex')}`);
    });
  });
}

/**
 * Constant-time password verification
 */
export async function verifyPassword(password: string, combinedHash: string): Promise<boolean> {
  const parts = combinedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, hash] = parts;
  return new Promise((resolve) => {
    crypto.pbkdf2(password, salt, 100000, 64, 'sha512', (err, derivedKey) => {
      if (err) return resolve(false);
      const hashBuffer = Buffer.from(hash, 'hex');
      if (hashBuffer.length !== derivedKey.length) return resolve(false);
      resolve(crypto.timingSafeEqual(hashBuffer, derivedKey));
    });
  });
}

/**
 * Generate a cryptographically secure random password
 */
export function generateRandomPassword(length = 14): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*';
  const bytes = crypto.randomBytes(length);
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars[bytes[i] % chars.length];
  }
  return result;
}

/**
 * Generate 6-digit numeric OTP with cryptographically secure randomness
 */
export function generateOtp(): string {
  const num = crypto.randomInt(100000, 999999);
  return num.toString();
}

/**
 * RFC 6238 Standard TOTP Implementation (Google Authenticator / Authy compatible)
 */
export function generateTotpSecret(): string {
  // 20-byte base32 secret
  const buffer = crypto.randomBytes(20);
  const base32Chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let secret = '';
  for (let i = 0; i < buffer.length; i++) {
    secret += base32Chars[buffer[i] % 32];
  }
  return secret;
}

export function verifyTotp(secret: string, token: string, window = 1): boolean {
  if (!token || token.length !== 6) return false;
  const timeStep = 30; // 30-second window
  const currentTime = Math.floor(Date.now() / 1000);
  const currentStep = Math.floor(currentTime / timeStep);

  for (let i = -window; i <= window; i++) {
    const step = currentStep + i;
    const computed = computeTotpAtStep(secret, step);
    if (crypto.timingSafeEqual(Buffer.from(token), Buffer.from(computed))) {
      return true;
    }
  }
  return false;
}

function computeTotpAtStep(secret: string, step: number): string {
  const key = base32Decode(secret);
  const buffer = Buffer.alloc(8);
  buffer.writeBigInt64BE(BigInt(step));

  const hmac = crypto.createHmac('sha1', key).update(buffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  const otp = (code % 1000000).toString().padStart(6, '0');
  return otp;
}

function base32Decode(base32: string): Buffer {
  const base32Chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const clean = base32.toUpperCase().replace(/=+$/, '');
  let bits = 0;
  let value = 0;
  const output: number[] = [];

  for (let i = 0; i < clean.length; i++) {
    const idx = base32Chars.indexOf(clean[i]);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(output);
}

/**
 * Cryptographic SHA-256 hash for OTPs and single-use tokens
 */
export function hashOtp(otp: string): string {
  return crypto.createHash('sha256').update(otp.trim()).digest('hex');
}

export function verifyOtpHash(otp: string, expectedHash: string): boolean {
  if (!otp || !expectedHash) return false;
  const computedHash = hashOtp(otp);
  const bufA = Buffer.from(computedHash, 'hex');
  const bufB = Buffer.from(expectedHash, 'hex');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token.trim()).digest('hex');
}

/**
 * JWT Helpers
 */
export function signJwt(payload: object, expiresIn: string | number = '1h', options?: jwt.SignOptions): string {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn, ...options } as jwt.SignOptions);
}

export function verifyJwt<T = any>(token: string, options?: jwt.VerifyOptions): T | null {
  try {
    return jwt.verify(token, env.JWT_SECRET, options) as T;
  } catch {
    return null;
  }
}

export function signRefreshToken(payload: object, expiresIn: string | number = '30d'): string {
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, { expiresIn } as jwt.SignOptions);
}

export function verifyRefreshToken<T = any>(token: string): T | null {
  try {
    return jwt.verify(token, env.JWT_REFRESH_SECRET) as T;
  } catch {
    return null;
  }
}

/**
 * SSRF Protection: Guard URL fetcher against private / loopback IP addresses
 */
export function isSafePublicUrl(urlStr: string): boolean {
  try {
    const parsed = new URL(urlStr);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false;
    }
    const hostname = parsed.hostname.toLowerCase();
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '::1' ||
      hostname === '0.0.0.0' ||
      hostname.endsWith('.local') ||
      hostname.endsWith('.internal')
    ) {
      return false;
    }

    // Check private IPv4 ranges
    const ipv4Regex = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/;
    const match = hostname.match(ipv4Regex);
    if (match) {
      const octet1 = parseInt(match[1], 10);
      const octet2 = parseInt(match[2], 10);
      if (octet1 === 10) return false; // 10.0.0.0/8
      if (octet1 === 127) return false; // 127.0.0.0/8
      if (octet1 === 172 && octet2 >= 16 && octet2 <= 31) return false; // 172.16.0.0/12
      if (octet1 === 192 && octet2 === 168) return false; // 192.168.0.0/16
      if (octet1 === 169 && octet2 === 254) return false; // Link-local
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Magic-Byte file validation
 */
export function validateFileMagicBytes(buffer: Buffer, declaredType: string): boolean {
  if (!buffer || buffer.length < 4) return false;

  // PDF magic byte: %PDF (25 50 44 46)
  if (declaredType === 'PDF' || declaredType === 'application/pdf') {
    return (
      buffer[0] === 0x25 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x44 &&
      buffer[3] === 0x46
    );
  }

  // PNG magic byte: 89 50 4E 47
  if (declaredType === 'PNG' || declaredType === 'image/png') {
    return (
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47
    );
  }

  // JPEG magic byte: FF D8 FF
  if (declaredType === 'JPEG' || declaredType === 'image/jpeg' || declaredType === 'JPG' || declaredType === 'image/jpg') {
    return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }

  // WebP magic byte: RIFF....WEBP
  if (declaredType === 'WEBP' || declaredType === 'image/webp') {
    if (buffer.length < 12) return false;
    return (
      buffer[0] === 0x52 &&
      buffer[1] === 0x49 &&
      buffer[2] === 0x46 &&
      buffer[3] === 0x46 &&
      buffer.subarray(8, 12).toString('ascii') === 'WEBP'
    );
  }

  // DOCX (ZIP archive magic byte: PK\x03\x04 or 50 4B 03 04)
  if (declaredType === 'DOCX' || declaredType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    return (
      buffer[0] === 0x50 &&
      buffer[1] === 0x4b &&
      buffer[2] === 0x03 &&
      buffer[3] === 0x04
    );
  }

  return true;
}
