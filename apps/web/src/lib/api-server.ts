/**
 * Server-only API URL resolver for Next.js SSR / Server Components (F30)
 * Prioritizes INTERNAL_API_URL (e.g. http://api:4000/v1 in Docker / http://localhost:4000/v1 in dev)
 */
export function getServerApiUrl(): string {
  const url =
    process.env.INTERNAL_API_URL ||
    process.env.API_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    'http://localhost:4000/v1';

  const clean = url.replace(/\/+$/, '');
  return clean.endsWith('/v1') ? clean : `${clean}/v1`;
}
