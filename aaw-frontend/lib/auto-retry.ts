import { Task } from '@/types/task';
import { AUTO_RETRY_CONFIG } from '@/config/auto-retry';

/**
 * Check if a task qualifies for auto-retry based on configuration
 */
export function shouldAutoRetry(task: Task): boolean {
  // Auto-retry must be enabled
  if (!AUTO_RETRY_CONFIG.ENABLED) {
    return false;
  }

  // Task must be in INTERRUPTED or FAILED status
  if (task.status !== 'INTERRUPTED' && task.status !== 'FAILED') {
    return false;
  }

  // Check retry count hasn't exceeded max
  if (task.retryCount >= AUTO_RETRY_CONFIG.MAX_AUTO_RETRIES) {
    console.log(`[AutoRetry] Task #${task.id} exceeded max retries (${task.retryCount}/${AUTO_RETRY_CONFIG.MAX_AUTO_RETRIES})`);
    return false;
  }

  // Check if error message is retryable
  const failureReason = task.failureReason || '';

  // Check non-retryable patterns first (take precedence)
  const isNonRetryable = AUTO_RETRY_CONFIG.NON_RETRYABLE_ERROR_PATTERNS.some(
    pattern => pattern.test(failureReason)
  );

  if (isNonRetryable) {
    console.log(`[AutoRetry] Task #${task.id} has non-retryable error: ${failureReason}`);
    return false;
  }

  // Check retryable patterns
  const isRetryable = AUTO_RETRY_CONFIG.RETRYABLE_ERROR_PATTERNS.some(
    pattern => pattern.test(failureReason)
  );

  if (!isRetryable) {
    console.log(`[AutoRetry] Task #${task.id} error doesn't match retryable patterns: ${failureReason}`);
    return false;
  }

  console.log(`[AutoRetry] Task #${task.id} qualifies for auto-retry`);
  return true;
}

/**
 * Calculate retry delay with exponential backoff
 */
export function calculateRetryDelay(retryCount: number): number {
  if (!AUTO_RETRY_CONFIG.USE_EXPONENTIAL_BACKOFF) {
    return AUTO_RETRY_CONFIG.BASE_DELAY_MS;
  }

  // Exponential backoff: BASE_DELAY_MS * 2^retryCount
  const delay = AUTO_RETRY_CONFIG.BASE_DELAY_MS * Math.pow(2, retryCount);

  // Cap at maximum delay
  return Math.min(delay, AUTO_RETRY_CONFIG.MAX_DELAY_MS);
}

/**
 * Get human-readable delay message
 */
export function getRetryDelayMessage(delayMs: number): string {
  const seconds = Math.ceil(delayMs / 1000);

  if (seconds < 60) {
    return `${seconds} second${seconds !== 1 ? 's' : ''}`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  if (remainingSeconds === 0) {
    return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
  }

  return `${minutes} minute${minutes !== 1 ? 's' : ''} ${remainingSeconds} second${remainingSeconds !== 1 ? 's' : ''}`;
}
