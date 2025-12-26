/**
 * Auto-retry configuration for failed tasks
 */

export const AUTO_RETRY_CONFIG = {
  // Enable/disable auto-retry functionality
  ENABLED: true,

  // Maximum number of automatic retries before requiring manual intervention
  MAX_AUTO_RETRIES: 3,

  // Base delay in milliseconds (5 seconds)
  BASE_DELAY_MS: 5000,

  // Use exponential backoff for retry delays
  USE_EXPONENTIAL_BACKOFF: true,

  // Maximum delay cap in milliseconds (60 seconds)
  MAX_DELAY_MS: 60000,

  // Error patterns that should trigger auto-retry
  RETRYABLE_ERROR_PATTERNS: [
    /rate limit/i,
    /timeout/i,
    /503/,
    /429/,
    /connection/i,
    /network/i,
    /temporary/i,
  ],

  // Error patterns that should NOT trigger auto-retry
  NON_RETRYABLE_ERROR_PATTERNS: [
    /404/,
    /401/,
    /403/,
    /forbidden/i,
    /unauthorized/i,
    /not found/i,
    /invalid/i,
    /syntax/i,
  ],
} as const;
