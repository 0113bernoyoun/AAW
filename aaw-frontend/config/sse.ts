/**
 * SSE (Server-Sent Events) configuration
 */

export const SSE_CONFIG = {
  // Base URL for the SSE log stream endpoint
  BASE_URL: 'http://localhost:8080/api/logs/stream',

  // Set to true to reconnect SSE on task selection change
  // This enables server-side filtering but causes brief reconnect gaps
  // When false, frontend receives all logs and filters client-side
  ENABLE_TASK_SPECIFIC_FILTERING: false,

  // Maximum number of reconnection attempts before giving up
  MAX_RETRIES: 5,

  // Initial delay for reconnection (in milliseconds)
  INITIAL_RETRY_DELAY_MS: 1000,

  // Maximum delay cap for reconnection (in milliseconds)
  MAX_RETRY_DELAY_MS: 30000,

  // Debounce delay for task selection changes (in milliseconds)
  // Prevents rapid reconnections when quickly switching between tasks
  TASK_SWITCH_DEBOUNCE_MS: 300,
} as const;
