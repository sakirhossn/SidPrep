import { z } from 'zod';

export const NotificationTypeSchema = z.enum([
  'OFFICIAL_EXAM_ALERT',
  'CURRENT_AFFAIRS_DIGEST',
  'STUDY_REMINDER',
  'TEST_EVENT',
  'RESOURCE_UPDATE'
]);
export type NotificationType = z.infer<typeof NotificationTypeSchema>;

export const NotificationItemSchema = z.object({
  id: z.string(),
  type: NotificationTypeSchema,
  title: z.string(),
  body: z.string(),
  examId: z.string().optional(),
  examCode: z.string().optional(),
  deepLink: z.string().optional(), // e.g. "sidprep://exam/ssc-cgl"
  isOfficialVerified: z.boolean().default(false),
  officialSourceUrl: z.string().url().optional(),
  receivedAt: z.string(),
  isRead: z.boolean().default(false)
});
export type NotificationItem = z.infer<typeof NotificationItemSchema>;
