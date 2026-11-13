import crypto from 'node:crypto';
import { db, QuestionRecord } from '../db/index.js';
import { query } from '../db/pool.js';

export interface ParsedOption {
  letter: string;
  text: string;
  isCorrect: boolean;
  id: string;
}

export interface ParsedQuestionRow {
  rowIndex: number;
  externalSourceId?: string;
  questionText: string;
  category: string;
  difficultyRaw: string;
  normalizedDifficulty: 'EASY' | 'MEDIUM' | 'HARD';
  options: ParsedOption[];
  correctLetter: string;
  explanation: string;
  marks?: number;
  negativeMarks?: number;
  marksSource: 'FILE' | 'IMPORT_DEFAULT';
  status: 'ACCEPTED' | 'DUPLICATE' | 'REVIEW_NEEDED' | 'REJECTED';
  rejectionReason?: string;
  reviewFlags: string[];
  fingerprint: string;
}

export interface ImportInspectionResult {
  format: 'CSV' | 'JSON';
  totalRows: number;
  acceptedCount: number;
  duplicateCount: number;
  reviewNeededCount: number;
  rejectedCount: number;
  examBasedCount: number;
  detectedCategories: { name: string; count: number; suggestedTopicId: string }[];
  samplePreview: {
    rowIndex: number;
    externalSourceId?: string;
    questionText: string;
    category: string;
    difficulty: string;
    correctLetter: string;
    optionsCount: number;
    status: string;
    reason?: string;
  }[];
  rows: ParsedQuestionRow[];
}

export interface CommitImportOptions {
  batchId?: string;
  filename?: string;
  format: 'CSV' | 'JSON';
  uploadedBy: string;
  defaultMarks?: number;
  defaultNegativeMarks?: number;
  examBasedMapping?: 'EASY' | 'MEDIUM' | 'HARD';
  categoryMappings?: Record<string, string>;
  updateExisting?: boolean;
}

/**
 * Standard RFC-4180 compliant CSV parser
 * Supports quoted strings, embedded newlines, escaped quotes (""), and UTF-8 BOM.
 */
export function parseRfc4180Csv(csvText: string): string[][] {
  // Strip UTF-8 BOM if present
  let cleanText = csvText;
  if (cleanText.charCodeAt(0) === 0xfeff) {
    cleanText = cleanText.substring(1);
  }

  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;
  let i = 0;
  const len = cleanText.length;

  while (i < len) {
    const char = cleanText[i];

    if (inQuotes) {
      if (char === '"') {
        if (i + 1 < len && cleanText[i + 1] === '"') {
          // Escaped quote
          currentField += '"';
          i += 2;
          continue;
        } else {
          // Closing quote
          inQuotes = false;
          i++;
          continue;
        }
      } else {
        currentField += char;
        i++;
        continue;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
        i++;
        continue;
      } else if (char === ',') {
        currentRow.push(currentField);
        currentField = '';
        i++;
        continue;
      } else if (char === '\r') {
        if (i + 1 < len && cleanText[i + 1] === '\n') {
          i++;
        }
        currentRow.push(currentField);
        currentField = '';
        rows.push(currentRow);
        currentRow = [];
        i++;
        continue;
      } else if (char === '\n') {
        currentRow.push(currentField);
        currentField = '';
        rows.push(currentRow);
        currentRow = [];
        i++;
        continue;
      } else {
        currentField += char;
        i++;
        continue;
      }
    }
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField);
    rows.push(currentRow);
  }

  // Filter out trailing blank lines
  return rows.filter((r) => r.length > 1 || (r.length === 1 && r[0].trim().length > 0));
}

/**
 * Computes deterministic SHA-256 content fingerprint for deduplication
 */
export function computeContentFingerprint(questionText: string, options: { text: string }[]): string {
  const normText = questionText.trim().replace(/\s+/g, ' ').toLowerCase();
  const sortedOptions = options
    .map((o) => o.text.trim().replace(/\s+/g, ' ').toLowerCase())
    .sort()
    .join('||');
  const payload = `${normText}###${sortedOptions}`;
  return crypto.createHash('sha256').update(payload).digest('hex');
}

/**
 * Suggests default topic ID based on source category
 */
export function getSuggestedTopicId(category: string): string {
  const norm = (category || '').toLowerCase().trim();
  if (norm.includes('reasoning') || norm.includes('mental ability')) return 'topic_reasoning';
  if (norm.includes('quantitative') || norm.includes('arithmetic')) return 'topic_quantitative';
  if (norm.includes('english')) return 'topic_english';
  if (norm.includes('nursing')) return 'topic_nursing';
  if (norm.includes('bengal') || norm.includes('revolts')) return 'topic_wb_gk';
  if (norm.includes('history')) return 'topic_history';
  if (norm.includes('geography')) return 'topic_geography';
  if (norm.includes('polity') || norm.includes('constitution')) return 'topic_polity';
  if (norm.includes('science') || norm.includes('physics') || norm.includes('chemistry') || norm.includes('biology')) return 'topic_general_science';
  return 'topic_general_awareness';
}

/**
 * Inspects and parses CSV or JSON question exports before committing
 */
export async function inspectQuestionImport(
  rawContent: string,
  formatHint?: 'CSV' | 'JSON',
  examBasedMapping: 'EASY' | 'MEDIUM' | 'HARD' = 'MEDIUM',
  defaultMarks = 1.0,
  defaultNegativeMarks = 0.25
): Promise<ImportInspectionResult> {
  const trimmed = rawContent.trim();
  const format: 'CSV' | 'JSON' =
    formatHint ||
    (trimmed.startsWith('[') || trimmed.startsWith('{') ? 'JSON' : 'CSV');

  // Query existing external IDs and content fingerprints from PostgreSQL
  const existingIdSet = new Set<string>();
  const existingFingerprintSet = new Set<string>();

  try {
    const existingIdsRes = await query<{ external_source_id: string; content_fingerprint: string }>(
      'SELECT external_source_id, content_fingerprint FROM questions WHERE external_source_id IS NOT NULL OR content_fingerprint IS NOT NULL'
    );
    for (const row of existingIdsRes.rows) {
      if (row.external_source_id) existingIdSet.add(row.external_source_id);
      if (row.content_fingerprint) existingFingerprintSet.add(row.content_fingerprint);
    }
  } catch (err: any) {
    console.warn('[QuestionImport] Existing question lookup warning:', err.message);
  }

  const parsedRows: ParsedQuestionRow[] = [];
  const categoryCounts: Record<string, number> = {};
  let examBasedCount = 0;

  if (format === 'CSV') {
    const table = parseRfc4180Csv(trimmed);
    if (table.length < 2) {
      throw new Error('CSV file is empty or missing headers.');
    }

    const headers = table[0].map((h) => h.trim().toLowerCase());
    const idIdx = headers.findIndex((h) => h === 'id');
    const qIdx = headers.findIndex((h) => h === 'question');
    const catIdx = headers.findIndex((h) => h === 'category');
    const diffIdx = headers.findIndex((h) => h === 'difficulty');
    const optAIdx = headers.findIndex((h) => h === 'option a');
    const optBIdx = headers.findIndex((h) => h === 'option b');
    const optCIdx = headers.findIndex((h) => h === 'option c');
    const optDIdx = headers.findIndex((h) => h === 'option d');
    const ansIdx = headers.findIndex((h) => h === 'correct answer');
    const expIdx = headers.findIndex((h) => h === 'explanation');

    if (qIdx === -1 || optAIdx === -1 || optBIdx === -1 || ansIdx === -1) {
      throw new Error('CSV header missing mandatory columns: Question, Option A, Option B, Correct Answer.');
    }

    for (let r = 1; r < table.length; r++) {
      const row = table[r];
      const externalId = idIdx !== -1 && row[idIdx] ? row[idIdx].trim() : undefined;
      const questionText = row[qIdx] ? row[qIdx].trim() : '';
      const category = catIdx !== -1 && row[catIdx] ? row[catIdx].trim() : 'General Awareness';
      const diffRaw = diffIdx !== -1 && row[diffIdx] ? row[diffIdx].trim().toLowerCase() : 'moderate';
      const optAText = row[optAIdx] ? row[optAIdx].trim() : '';
      const optBText = row[optBIdx] ? row[optBIdx].trim() : '';
      const optCText = optCIdx !== -1 && row[optCIdx] ? row[optCIdx].trim() : '';
      const optDText = optDIdx !== -1 && row[optDIdx] ? row[optDIdx].trim() : '';
      const ansRaw = row[ansIdx] ? row[ansIdx].trim() : '';
      const explanation = expIdx !== -1 && row[expIdx] ? row[expIdx].trim() : '';

      categoryCounts[category] = (categoryCounts[category] || 0) + 1;
      if (diffRaw === 'exam_based') examBasedCount++;

      const reviewFlags: string[] = [];
      let status: ParsedQuestionRow['status'] = 'ACCEPTED';
      let rejectionReason: string | undefined;

      // Question text check
      if (!questionText) {
        status = 'REJECTED';
        rejectionReason = 'MISSING_QUESTION_TEXT: Row has empty question body.';
      }

      // Options validation
      if (!optAText || !optBText) {
        status = 'REJECTED';
        rejectionReason = 'INSUFFICIENT_OPTIONS: Option A and Option B are mandatory.';
      }

      // Parse answer letter and verify agreement with option text
      let correctLetter = '';
      const ansMatch = ansRaw.match(/^[\(\[]?([A-D])[\)\]\.\:\s]*(.*)/i);
      if (ansMatch) {
        correctLetter = ansMatch[1].toUpperCase();
        const trailingAnsText = ansMatch[2] ? ansMatch[2].trim() : '';

        // If trailing answer text is provided, verify it agrees with declared option
        if (trailingAnsText) {
          let expectedOptionText = '';
          if (correctLetter === 'A') expectedOptionText = optAText;
          else if (correctLetter === 'B') expectedOptionText = optBText;
          else if (correctLetter === 'C') expectedOptionText = optCText;
          else if (correctLetter === 'D') expectedOptionText = optDText;

          if (
            expectedOptionText &&
            trailingAnsText.toLowerCase() !== expectedOptionText.toLowerCase()
          ) {
            reviewFlags.push(`ANSWER_TEXT_DISAGREEMENT: Declared answer letter (${correctLetter}) declares text '${trailingAnsText}' which disagrees with Option ${correctLetter} '${expectedOptionText}'.`);
            status = 'REVIEW_NEEDED';
          }
        }
      } else {
        status = 'REJECTED';
        rejectionReason = `INVALID_ANSWER_FORMAT: Could not parse correct option letter from '${ansRaw}'.`;
      }

      // Difficulty normalization
      let normalizedDifficulty: 'EASY' | 'MEDIUM' | 'HARD' = 'MEDIUM';
      if (diffRaw === 'easy') normalizedDifficulty = 'EASY';
      else if (diffRaw === 'moderate') normalizedDifficulty = 'MEDIUM';
      else if (diffRaw === 'hard') normalizedDifficulty = 'HARD';
      else if (diffRaw === 'exam_based') {
        normalizedDifficulty = examBasedMapping;
        reviewFlags.push(`EXAM_BASED_DIFFICULTY: Explicitly mapped 'exam_based' to ${examBasedMapping}.`);
      }

      const options: ParsedOption[] = [
        { letter: 'A', text: optAText, isCorrect: correctLetter === 'A', id: 'opt_a' },
        { letter: 'B', text: optBText, isCorrect: correctLetter === 'B', id: 'opt_b' },
      ];
      if (optCText) options.push({ letter: 'C', text: optCText, isCorrect: correctLetter === 'C', id: 'opt_c' });
      if (optDText) options.push({ letter: 'D', text: optDText, isCorrect: correctLetter === 'D', id: 'opt_d' });

      const fingerprint = computeContentFingerprint(questionText, options);

      // Check duplicates
      if (status !== 'REJECTED') {
        if (externalId && existingIdSet.has(externalId)) {
          status = 'DUPLICATE';
          rejectionReason = `DUPLICATE_EXTERNAL_ID: Question with source ID ${externalId} already exists in database.`;
        } else if (existingFingerprintSet.has(fingerprint)) {
          status = 'DUPLICATE';
          rejectionReason = `DUPLICATE_CONTENT: Question with identical text and options already exists in database.`;
        }
      }

      parsedRows.push({
        rowIndex: r,
        externalSourceId: externalId,
        questionText,
        category,
        difficultyRaw: diffRaw,
        normalizedDifficulty,
        options,
        correctLetter,
        explanation,
        marks: defaultMarks,
        negativeMarks: defaultNegativeMarks,
        marksSource: 'IMPORT_DEFAULT',
        status,
        rejectionReason,
        reviewFlags,
        fingerprint,
      });
    }
  } else {
    // JSON Import Mode
    let jsonArray: any[];
    try {
      const parsed = JSON.parse(trimmed);
      jsonArray = Array.isArray(parsed) ? parsed : [parsed];
    } catch (err: any) {
      throw new Error(`Invalid JSON syntax: ${err.message}`);
    }

    for (let i = 0; i < jsonArray.length; i++) {
      const item = jsonArray[i];
      const rowIndex = i + 1;
      const externalId = item.id || undefined;
      const questionText = item.questionText ? String(item.questionText).trim() : '';
      const category = item.category ? String(item.category).trim() : 'General Awareness';
      const diffRaw = item.difficulty ? String(item.difficulty).trim().toLowerCase() : 'moderate';
      const explanation = item.explanation ? String(item.explanation).trim() : '';
      const marks = typeof item.marks === 'number' ? item.marks : defaultMarks;
      const negativeMarks = typeof item.negativeMarks === 'number' ? item.negativeMarks : defaultNegativeMarks;
      const marksSource: 'FILE' | 'IMPORT_DEFAULT' = typeof item.marks === 'number' ? 'FILE' : 'IMPORT_DEFAULT';

      categoryCounts[category] = (categoryCounts[category] || 0) + 1;
      if (diffRaw === 'exam_based') examBasedCount++;

      const reviewFlags: string[] = [];
      let status: ParsedQuestionRow['status'] = 'ACCEPTED';
      let rejectionReason: string | undefined;

      if (!questionText) {
        status = 'REJECTED';
        rejectionReason = 'MISSING_QUESTION_TEXT: Record has empty questionText.';
      }

      // Difficulty mapping
      let normalizedDifficulty: 'EASY' | 'MEDIUM' | 'HARD' = 'MEDIUM';
      if (diffRaw === 'easy') normalizedDifficulty = 'EASY';
      else if (diffRaw === 'moderate') normalizedDifficulty = 'MEDIUM';
      else if (diffRaw === 'hard') normalizedDifficulty = 'HARD';
      else if (diffRaw === 'exam_based') {
        normalizedDifficulty = examBasedMapping;
        reviewFlags.push(`EXAM_BASED_DIFFICULTY: Explicitly mapped 'exam_based' to ${examBasedMapping}.`);
      }

      // Options parsing and validation
      const rawOptions = Array.isArray(item.options) ? item.options : [];
      if (rawOptions.length < 2) {
        status = 'REJECTED';
        rejectionReason = 'INSUFFICIENT_OPTIONS: Question must have at least 2 options.';
      }

      let correctCount = 0;
      let declaredCorrectLetter = item.correctAnswer?.letter || '';

      const options: ParsedOption[] = rawOptions.map((opt: any, optIdx: number) => {
        const letter = (opt.letter || String.fromCharCode(65 + optIdx)).toUpperCase();
        const isCorrect = Boolean(opt.isCorrect);
        if (isCorrect) {
          correctCount++;
          if (!declaredCorrectLetter) declaredCorrectLetter = letter;
        }
        return {
          letter,
          text: opt.text ? String(opt.text).trim() : '',
          isCorrect,
          id: `opt_${letter.toLowerCase()}`,
        };
      });

      // Verification: exactly one option must be marked correct
      if (status !== 'REJECTED') {
        if (correctCount === 0) {
          status = 'REJECTED';
          rejectionReason = 'NO_CORRECT_OPTION: No option marked with isCorrect: true.';
        } else if (correctCount > 1) {
          status = 'REJECTED';
          rejectionReason = `MULTIPLE_CORRECT_OPTIONS: Found ${correctCount} options marked correct. Exactly 1 is required for single-choice format.`;
        }

        // Cross-check declared correctAnswer vs option marked isCorrect
        if (item.correctAnswer && declaredCorrectLetter) {
          const markedCorrect = options.find((o) => o.isCorrect);
          if (markedCorrect && markedCorrect.letter !== item.correctAnswer.letter?.toUpperCase()) {
            reviewFlags.push(`CORRECT_ANSWER_MISMATCH: Declared correctAnswer.letter (${item.correctAnswer.letter}) differs from isCorrect option (${markedCorrect.letter}).`);
            status = 'REVIEW_NEEDED';
          }
        }
      }

      const fingerprint = computeContentFingerprint(questionText, options);

      // Check duplicates
      if (status !== 'REJECTED') {
        if (externalId && existingIdSet.has(externalId)) {
          status = 'DUPLICATE';
          rejectionReason = `DUPLICATE_EXTERNAL_ID: Question with source ID ${externalId} already exists in database.`;
        } else if (existingFingerprintSet.has(fingerprint)) {
          status = 'DUPLICATE';
          rejectionReason = `DUPLICATE_CONTENT: Question with identical text and options already exists in database.`;
        }
      }

      parsedRows.push({
        rowIndex,
        externalSourceId: externalId,
        questionText,
        category,
        difficultyRaw: diffRaw,
        normalizedDifficulty,
        options,
        correctLetter: declaredCorrectLetter,
        explanation,
        marks,
        negativeMarks,
        marksSource,
        status,
        rejectionReason,
        reviewFlags,
        fingerprint,
      });
    }
  }

  const detectedCategories = Object.entries(categoryCounts).map(([name, count]) => ({
    name,
    count,
    suggestedTopicId: getSuggestedTopicId(name),
  }));

  const acceptedCount = parsedRows.filter((r) => r.status === 'ACCEPTED').length;
  const duplicateCount = parsedRows.filter((r) => r.status === 'DUPLICATE').length;
  const reviewNeededCount = parsedRows.filter((r) => r.status === 'REVIEW_NEEDED').length;
  const rejectedCount = parsedRows.filter((r) => r.status === 'REJECTED').length;

  const samplePreview = parsedRows.slice(0, 10).map((r) => ({
    rowIndex: r.rowIndex,
    externalSourceId: r.externalSourceId,
    questionText: r.questionText.length > 120 ? `${r.questionText.substring(0, 120)}...` : r.questionText,
    category: r.category,
    difficulty: r.normalizedDifficulty,
    correctLetter: r.correctLetter,
    optionsCount: r.options.length,
    status: r.status,
    reason: r.rejectionReason || (r.reviewFlags.length > 0 ? r.reviewFlags[0] : undefined),
  }));

  return {
    format,
    totalRows: parsedRows.length,
    acceptedCount,
    duplicateCount,
    reviewNeededCount,
    rejectedCount,
    examBasedCount,
    detectedCategories,
    samplePreview,
    rows: parsedRows,
  };
}

/**
 * Commits a parsed batch to PostgreSQL database
 */
export async function commitQuestionImport(
  inspection: ImportInspectionResult,
  options: CommitImportOptions
): Promise<{
  batchId: string;
  totalRows: number;
  acceptedCount: number;
  duplicateCount: number;
  reviewNeededCount: number;
  rejectedCount: number;
}> {
  const batchId = options.batchId || `qib_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const filename = options.filename || `questions_import_${Date.now()}.${options.format.toLowerCase()}`;
  const categoryMappings = options.categoryMappings || {};

  // Insert parent batch record in PostgreSQL
  await query(
    `INSERT INTO question_import_batches (
      id, filename, format, uploaded_by, status, total_rows, accepted_count, rejected_count,
      duplicate_count, review_needed_count, default_marks, default_negative_marks,
      exam_based_mapping, category_mappings, update_existing, created_at
    ) VALUES ($1, $2, $3, $4, 'PROCESSING', $5, 0, 0, 0, 0, $6, $7, $8, $9, $10, NOW())`,
    [
      batchId,
      filename,
      options.format,
      options.uploadedBy,
      inspection.totalRows,
      options.defaultMarks || null,
      options.defaultNegativeMarks || null,
      options.examBasedMapping || 'MEDIUM',
      JSON.stringify(categoryMappings),
      Boolean(options.updateExisting),
    ]
  );

  let acceptedCount = 0;
  let duplicateCount = 0;
  let reviewNeededCount = 0;
  let rejectedCount = 0;

  for (const row of inspection.rows) {
    // Determine mapped topicId
    const mappedTopicId = categoryMappings[row.category] || getSuggestedTopicId(row.category);

    if (row.status === 'REJECTED') {
      rejectedCount++;
      await query(
        `INSERT INTO question_import_rows (
          id, batch_id, row_index, external_source_id, status, reason, payload, created_at
        ) VALUES ($1, $2, $3, $4, 'REJECTED', $5, $6, NOW())`,
        [
          `qir_${batchId}_${row.rowIndex}`,
          batchId,
          row.rowIndex,
          row.externalSourceId || null,
          row.rejectionReason || 'Validation error',
          JSON.stringify({ row }),
        ]
      );
      continue;
    }

    if (row.status === 'DUPLICATE' && !options.updateExisting) {
      duplicateCount++;
      await query(
        `INSERT INTO question_import_rows (
          id, batch_id, row_index, external_source_id, status, reason, payload, created_at
        ) VALUES ($1, $2, $3, $4, 'DUPLICATE', $5, $6, NOW())`,
        [
          `qir_${batchId}_${row.rowIndex}`,
          batchId,
          row.rowIndex,
          row.externalSourceId || null,
          row.rejectionReason || 'Duplicate question skipped',
          JSON.stringify({ externalSourceId: row.externalSourceId, fingerprint: row.fingerprint }),
        ]
      );
      continue;
    }

    if (row.status === 'REVIEW_NEEDED') {
      reviewNeededCount++;
    } else {
      acceptedCount++;
    }

    // Question ID: prefer stable external ID or generate unique ID
    const qId = row.externalSourceId || `q_imp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const correctOpt = row.options.find((o) => o.isCorrect) || row.options[0];

    const questionRecord: QuestionRecord = {
      id: qId,
      topicId: mappedTopicId,
      difficulty: row.normalizedDifficulty,
      correctOptionId: correctOpt.id,
      createdBy: options.uploadedBy,
      status: 'DRAFT', // Invariant: Saved as DRAFT for editorial review
      externalSourceId: row.externalSourceId,
      contentFingerprint: row.fingerprint,
      marks: row.marks,
      negativeMarks: row.negativeMarks,
      marksSource: row.marksSource,
      importBatchId: batchId,
      needsReview: row.status === 'REVIEW_NEEDED',
      reviewFlags: row.reviewFlags,
      translations: [
        {
          language: 'en',
          text: row.questionText,
          explanation: row.explanation,
          options: row.options.map((o) => ({ id: o.id, text: o.text })),
        },
      ],
    };

    // Save to PostgreSQL & in-memory cache
    await db.questions.set(qId, questionRecord);

    await query(
      `INSERT INTO question_import_rows (
        id, batch_id, row_index, external_source_id, status, reason, mapped_question_id, payload, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
      [
        `qir_${batchId}_${row.rowIndex}`,
        batchId,
        row.rowIndex,
        row.externalSourceId || null,
        row.status === 'REVIEW_NEEDED' ? 'REVIEW_NEEDED' : 'ACCEPTED',
        row.reviewFlags.join('; ') || null,
        qId,
        JSON.stringify({ qId, topicId: mappedTopicId }),
      ]
    );
  }

  // Update batch summary status
  await query(
    `UPDATE question_import_batches
     SET status = 'COMPLETED', accepted_count = $2, rejected_count = $3,
         duplicate_count = $4, review_needed_count = $5, completed_at = NOW()
     WHERE id = $1`,
    [batchId, acceptedCount, rejectedCount, duplicateCount, reviewNeededCount]
  );

  return {
    batchId,
    totalRows: inspection.totalRows,
    acceptedCount,
    duplicateCount,
    reviewNeededCount,
    rejectedCount,
  };
}
