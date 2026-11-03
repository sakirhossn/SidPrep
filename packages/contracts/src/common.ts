import { z } from 'zod';

export const SupportedLanguageSchema = z.enum(['en', 'hi', 'bn']);
export type SupportedLanguage = z.infer<typeof SupportedLanguageSchema>;

export const ApiErrorResponseSchema = z.object({
  statusCode: z.number(),
  error: z.string(),
  message: z.string(),
  code: z.string().optional(),
  correlationId: z.string().optional(),
  details: z.record(z.any()).optional()
});
export type ApiErrorResponse = z.infer<typeof ApiErrorResponseSchema>;

export const PaginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20)
});
export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;

export const PaginatedResponseSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({
    items: z.array(itemSchema),
    total: z.number().int().min(0),
    page: z.number().int().min(1),
    limit: z.number().int().min(1),
    totalPages: z.number().int().min(0),
    hasMore: z.boolean()
  });
