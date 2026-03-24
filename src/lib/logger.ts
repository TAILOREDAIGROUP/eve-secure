/**
 * Logger re-export for convenience
 * Many modules import from @/lib/logger instead of @/lib/logging/logger
 */
export { logger, createRequestLogger as createLogger } from './logging/logger';
