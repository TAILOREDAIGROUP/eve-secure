/**
 * Sanitization helpers re-exported for testing
 * Mirrors patterns from src/lib/pdf/generator.ts
 */

export function validateTemplateData(data: Record<string, unknown>): boolean {
  const jsonString = JSON.stringify(data);
  const dangerousPatterns = [
    /{{[\s\S]*?}}/,
    /{%[\s\S]*?%}/,
    /\$\{[\s\S]*?\}/,
    /eval\(/i,
    /script/i,
    /<iframe/i,
    /javascript:/i,
    /on\w+\s*=/i,
  ];
  for (const pattern of dangerousPatterns) {
    if (pattern.test(jsonString)) return false;
  }
  return true;
}

export function sanitizeData(data: unknown, depth: number = 0): unknown {
  if (depth > 20) return null;
  if (data === null || data === undefined) return data;
  if (typeof data === 'string') return data.replace(/\0/g, '');
  if (typeof data !== 'object') return data;
  if (Array.isArray(data)) return data.map((item) => sanitizeData(item, depth + 1));
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (!/^[a-zA-Z0-9_-]+$/.test(key)) continue;
    sanitized[key] = sanitizeData(value, depth + 1);
  }
  return sanitized;
}
