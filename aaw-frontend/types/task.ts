export type TaskStatus =
  | 'PENDING'
  | 'QUEUED'
  | 'RUNNING'
  | 'COMPLETED'
  | 'FAILED'
  | 'PAUSED'
  | 'PAUSED_BY_LIMIT'
  | 'RATE_LIMITED'
  | 'INTERRUPTED'
  | 'CANCELLED'
  | 'CANCELLING'
  | 'TERMINATING'
  | 'KILLED';

export interface RecoveryAttempt {
  attemptNumber: number;
  timestamp: string;
  action: 'RETRY' | 'SKIP' | 'RESTART_SESSION';
  result: 'SUCCESS' | 'FAILED';
  errorMessage?: string;
}

export interface Task {
  id: number;
  instruction: string;
  scriptContent: string;
  scriptPath: string | null;
  status: TaskStatus;
  priority: number;
  queuePosition: number | null;
  skipPermissions: boolean;
  sessionMode: 'NEW' | 'PERSIST';
  executionMode?: 'QUEUED' | 'DIRECT';
  failureReason: string | null;
  retryCount: number;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  isArchived: boolean;
  deletedAt: string | null;
  recoveryHistory?: RecoveryAttempt[];
}

export interface TaskEvent {
  type: 'TASK_QUEUED' | 'TASK_DEQUEUED' | 'STATUS_UPDATE' | 'TASK_INTERRUPTED' | 'TASK_RUNNING' | 'LOG' | 'SYSTEM' | 'SYSTEM_READY' | 'SYSTEM_DISCONNECTED';
  taskId?: number;
  task?: Task;
  status?: TaskStatus;
  line?: string | null;
  isError?: boolean;
}

/**
 * Phase 4: System state snapshot for frontend re-attachment.
 */
export interface SystemState {
  isRunnerConnected: boolean;
  isRateLimited: boolean;
  runnerStatus: 'IDLE' | 'BUSY';
  runningTasks: RunningTaskInfo[];
  queuedTaskCount: number;
  timestamp: number;
}

export interface RunningTaskInfo {
  id: number;
  instruction: string;
  status: string;
  startedAt: string | null;
}
