import { z } from 'zod';
import { SupportedLanguageSchema } from './common.js';

export const ResourceFileTypeSchema = z.enum(['PDF', 'DOCX', 'IMAGE']);
export type ResourceFileType = z.infer<typeof ResourceFileTypeSchema>;

export const ResourceItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  fileType: ResourceFileTypeSchema,
  fileSizeBytes: z.number().int().positive(),
  fileSizeFormatted: z.string(), // e.g. "2.4 MB"
  pageCount: z.number().int().optional(),
  language: SupportedLanguageSchema,
  examId: z.string(),
  examTitle: z.string(),
  stageName: z.string().optional(),
  subjectName: z.string(),
  topicName: z.string().optional(),
  uploadedAt: z.string(),
  sourceAttribution: z.string(),
  
  // Strict Security & Access Policy fields
  previewAllowed: z.boolean(),
  downloadAllowed: z.boolean(),
  offlineAllowed: z.boolean(),
  
  // Preview configuration (short-lived signed URL or page streaming endpoint)
  previewUrl: z.string().url().optional(),
  sanitizedDocxPdfPreviewUrl: z.string().url().optional(),
  thumbnailUrl: z.string().url().optional(),
  
  isOfflineCached: z.boolean().default(false)
});
export type ResourceItem = z.infer<typeof ResourceItemSchema>;

export const ResourceDownloadTicketResponseSchema = z.object({
  downloadUrl: z.string().url(),
  expiresAt: z.string(), // Short-lived (e.g. 15 minutes)
  fileName: z.string(),
  mimeType: z.string(),
  checksumSha256: z.string()
});
export type ResourceDownloadTicketResponse = z.infer<typeof ResourceDownloadTicketResponseSchema>;
