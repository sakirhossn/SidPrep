/**
 * SidPrep PDF Security & Validation Subsystem
 * Enforces strict MIME header inspection and rejects dangerous embedded executable payloads
 */

export interface PdfValidationResult {
  isValid: boolean;
  reason?: string;
  pdfVersion?: string;
}

/**
 * Validates a PDF buffer:
 * 1. Verifies %PDF- magic header (PDF 1.0 to 2.0)
 * 2. Scans for dangerous active scripts and execution triggers:
 *    - /JavaScript or /JS (Active client scripts)
 *    - /Launch (Spawning external processes)
 *    - /OpenAction pointing to scripts
 */
export function validatePdfSecurity(buffer: Buffer): PdfValidationResult {
  if (!buffer || buffer.length < 5) {
    return { isValid: false, reason: 'File buffer is too small to be a valid PDF document.' };
  }

  // 1. Verify %PDF- header within the first 1024 bytes (some PDFs have leading BOM or whitespace)
  const headerSlice = buffer.subarray(0, Math.min(buffer.length, 1024)).toString('latin1');
  const pdfHeaderMatch = headerSlice.match(/%PDF-(\d+\.\d+)/);

  if (!pdfHeaderMatch) {
    return {
      isValid: false,
      reason: 'Invalid PDF signature: File does not contain standard %PDF- header.',
    };
  }

  const pdfVersion = pdfHeaderMatch[1];

  // 2. Scan entire buffer for dangerous active execution tokens
  // Convert to latin1 string for fast binary token scanning
  const binaryString = buffer.toString('latin1');

  // Check for active JavaScript
  // Match /JavaScript, /JS, \x2f\x4a\x61\x76\x61\x53\x63\x72\x69\x70\x74 (escaped /JavaScript)
  if (
    /\/JavaScript\b/i.test(binaryString) ||
    /\/JS\b/i.test(binaryString)
  ) {
    return {
      isValid: false,
      reason: 'UNSAFE_PDF_CONTENT: Document contains embedded /JavaScript or /JS actions, which violate SidPrep security policy.',
      pdfVersion,
    };
  }

  // Check for process Launch actions (/Launch)
  if (/\/Launch\b/i.test(binaryString)) {
    return {
      isValid: false,
      reason: 'UNSAFE_PDF_CONTENT: Document contains /Launch process spawning actions, which are strictly prohibited.',
      pdfVersion,
    };
  }

  // Check for /OpenAction with dangerous script actions
  if (/\/OpenAction\s*<<[^>]*\/(?:JavaScript|JS|Launch)/i.test(binaryString)) {
    return {
      isValid: false,
      reason: 'UNSAFE_PDF_CONTENT: Document contains automated /OpenAction execution triggers.',
      pdfVersion,
    };
  }

  return {
    isValid: true,
    pdfVersion,
  };
}
