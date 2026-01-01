// Task filtering and display configuration

export const TASK_CONFIG = {
  // Hide completed/failed tasks older than this (in minutes)
  // Set to 0 to show all tasks, or increase to hide older tasks
  // 1440 = 24 hours (matches backend retention policy)
  HIDE_COMPLETED_AFTER_MINUTES: 1440,

  // Statuses to filter when old (beyond the time threshold)
  FILTERABLE_STATUSES: ['COMPLETED', 'FAILED', 'INTERRUPTED', 'PENDING'] as const,

  // Statuses to always show (regardless of age)
  ACTIVE_STATUSES: ['QUEUED', 'RUNNING', 'PAUSED', 'RATE_LIMITED'] as const,

  // Statuses to hide completely (cleanup artifacts)
  HIDDEN_STATUSES: ['CANCELLED'] as const,
};

export type FilterableStatus = typeof TASK_CONFIG.FILTERABLE_STATUSES[number];
export type ActiveStatus = typeof TASK_CONFIG.ACTIVE_STATUSES[number];
export type HiddenStatus = typeof TASK_CONFIG.HIDDEN_STATUSES[number];
