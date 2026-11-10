#!/usr/bin/env node
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const SECRET_PATTERNS = [
  {
    name: 'Brevo SMTP Relay Password',
    regex: /xsmtpsib-[a-f0-9]{64}-[a-zA-Z0-9]+/i,
  },
  {
    name: 'Brevo API Key',
    regex: /xkeysib-[a-f0-9]{64}-[a-zA-Z0-9]+/i,
  },
  {
    name: 'Generic Brevo Token',
    regex: /x(?:smtp|key)sib-[a-f0-9]{20,}/i,
  },
  {
    name: 'Leaked Cloudflare R2 Account Endpoint',
    regex: /cbf7a4a2f0c78ae217205ffb1064ea54/i,
  },
  {
    name: 'Leaked Cloudflare R2 Access Key ID',
    regex: /1ffe7c761ee357af0998ece167f0ce6e/i,
  },
  {
    name: 'Leaked Cloudflare R2 Secret Access Key',
    regex: /5a8e1264ec4ab149ecafb317eb1397ea8c0b9e9810109c87d8ca7733ba58e661/i,
  },
  {
    name: 'Leaked Brevo SMTP Relay Username',
    regex: /c0cb63001@smtp-brevo\.com/i,
  },
  {
    name: 'Hardcoded Production R2 Access Key Assignment',
    regex: /R2_ACCESS_KEY_ID\s*[:=]\s*['"]?[a-f0-9]{32}['"]?/i,
    allow: /dev-only|REPLACE_ME/i,
  },
  {
    name: 'Hardcoded Production R2 Secret Access Key Assignment',
    regex: /R2_SECRET_ACCESS_KEY\s*[:=]\s*['"]?[a-f0-9]{64}['"]?/i,
    allow: /dev-only|REPLACE_ME/i,
  },
];

const IGNORED_PATHS = [
  'node_modules/',
  '.git/',
  '.next/',
  'dist/',
  '.pnpm-store/',
  'scripts/scan-secrets.mjs', // allow self reference
];

function getTrackedFiles() {
  try {
    const stdout = execSync('git ls-files', { encoding: 'utf8' });
    return stdout
      .split(/\r?\n/)
      .map((f) => f.trim())
      .filter((f) => f.length > 0);
  } catch (err) {
    console.warn('[Security Scanner] git ls-files failed, falling back to directory traversal');
    return getLocalFiles('.');
  }
}

function getLocalFiles(dir) {
  const files = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relPath = fullPath.replace(/\\/g, '/');
    if (IGNORED_PATHS.some((ignored) => relPath.includes(ignored))) continue;
    if (entry.isDirectory()) {
      files.push(...getLocalFiles(fullPath));
    } else {
      files.push(relPath);
    }
  }
  return files;
}

let violations = 0;
const trackedFiles = getTrackedFiles();

console.log(`[Security Scanner] Scanning ${trackedFiles.length} tracked files for leaked secrets...`);

for (const relPath of trackedFiles) {
  const normPath = relPath.replace(/\\/g, '/');
  if (IGNORED_PATHS.some((ignored) => normPath.includes(ignored))) {
    continue;
  }

  if (!fs.existsSync(relPath)) continue;

  let content = '';
  try {
    content = fs.readFileSync(relPath, 'utf8');
  } catch {
    // Skip binary files
    continue;
  }

  const lines = content.split(/\r?\n/);
  lines.forEach((line, index) => {
    for (const rule of SECRET_PATTERNS) {
      if (rule.regex.test(line)) {
        if (rule.allow && rule.allow.test(line)) {
          continue;
        }
        violations++;
        console.error(`\x1b[31m[LEAK DETECTED]\x1b[0m ${normPath}:${index + 1} - ${rule.name}`);
        const maskedLine = line.trim().replace(/([a-zA-Z0-9_-]{4})[a-zA-Z0-9_-]{8,}([a-zA-Z0-9_-]{4})/g, '$1...[REDACTED]...$2');
        console.error(`  Line ${index + 1}: ${maskedLine}`);
      }
    }
  });
}

if (violations > 0) {
  console.error(`\n\x1b[31mFATAL: Detected ${violations} hardcoded secret violation(s) in repository.\x1b[0m`);
  console.error('Please remove or replace all real secrets with secure environment variables before committing.\n');
  process.exit(1);
} else {
  console.log(`\x1b[32m[Security Scanner] All ${trackedFiles.length} files scanned cleanly. No leaked secrets found!\x1b[0m\n`);
  process.exit(0);
}
