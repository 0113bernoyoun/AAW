import { SSE_CONFIG } from '@/config/sse';

export interface LogChunk {
  type: string;
  taskId: number;
  line: string | null;
  status: string | null;
  isError: boolean;
}

export interface SSECallbacks {
  onLog: (log: LogChunk) => void;
  onStatusUpdate: (status: string, taskId?: number) => void;
  onSystemReady: () => void;
  onSystemDisconnected: () => void;
  onDispatcherPaused?: () => void;
  onDispatcherResumed?: () => void;
  onTaskRunning?: (taskId: number) => void;
  onTaskDeleted?: (taskId: number, reason: string) => void;
  onTaskArchived?: (taskId: number) => void;
  onError?: (error: Event) => void;
}

// Global singleton to prevent duplicate connections
let globalEventSource: EventSource | null = null;

// Track the current filter taskId for reconnection logic
let currentFilterTaskId: number | null = null;

/**
 * Build the SSE URL with optional taskId filter
 */
function buildSSEUrl(taskId?: number | null): string {
  const baseUrl = SSE_CONFIG.BASE_URL;
  if (taskId != null) {
    return `${baseUrl}?taskId=${taskId}`;
  }
  return baseUrl;
}

/**
 * Get the current filter task ID
 */
export function getCurrentFilterTaskId(): number | null {
  return currentFilterTaskId;
}

export function connectToLogStream(
  callbacks: SSECallbacks,
  taskId?: number | null
): EventSource {
  // Close existing connection if any
  if (globalEventSource) {
    console.log('[SSE] Closing existing connection before creating new one');
    globalEventSource.close();
    globalEventSource = null;
  }

  // Build URL with optional taskId filter
  const url = buildSSEUrl(taskId);
  currentFilterTaskId = taskId ?? null;

  console.log(`[SSE] Connecting to: ${url}`);

  const eventSource = new EventSource(url);
  globalEventSource = eventSource;

  eventSource.addEventListener('log-event', (event: MessageEvent) => {
    try {
      const data: LogChunk = JSON.parse(event.data);

      switch (data.type) {
        case 'LOG':
        case 'SYSTEM':
          callbacks.onLog(data);
          break;
        case 'STATUS_UPDATE':
          if (data.status) {
            callbacks.onStatusUpdate(data.status, data.taskId);
          }
          break;
        case 'SYSTEM_READY':
          callbacks.onSystemReady();
          if (data.line) {
            callbacks.onLog(data);
          }
          break;
        case 'SYSTEM_DISCONNECTED':
          callbacks.onSystemDisconnected();
          if (data.line) {
            callbacks.onLog(data);
          }
          break;
        case 'DISPATCHER_PAUSED':
          if (callbacks.onDispatcherPaused) {
            callbacks.onDispatcherPaused();
          }
          if (data.line) {
            callbacks.onLog(data);
          }
          break;
        case 'DISPATCHER_RESUMED':
          if (callbacks.onDispatcherResumed) {
            callbacks.onDispatcherResumed();
          }
          if (data.line) {
            callbacks.onLog(data);
          }
          break;
        case 'TASK_RUNNING':
          // Phase 4: Snapshot event for running tasks
          if (callbacks.onTaskRunning && data.taskId) {
            callbacks.onTaskRunning(data.taskId);
          }
          if (data.line) {
            callbacks.onLog(data);
          }
          break;
        case 'TASK_DELETED':
          // Manual deletion - show toast notification
          if (callbacks.onTaskDeleted && data.taskId) {
            const reason = (data as any).metadata?.reason || 'MANUAL_OVERRIDE';
            callbacks.onTaskDeleted(data.taskId, reason);
            console.log(`[SSE] Task ${data.taskId} deleted (reason: ${reason})`);
          }
          break;
        case 'TASK_ARCHIVED':
          // Retention cleanup - silent removal (no toast)
          if (callbacks.onTaskArchived && data.taskId) {
            callbacks.onTaskArchived(data.taskId);
            console.log(`[SSE] Task ${data.taskId} archived by retention policy`);
          }
          break;
      }
    } catch (error) {
      console.error('Failed to parse SSE data:', error);
    }
  });

  eventSource.onerror = (error) => {
    const errorEvent = error as Event;
    const target = errorEvent.target as EventSource;

    console.error('SSE connection error. ReadyState:', target.readyState);

    if (callbacks.onError) {
      callbacks.onError(errorEvent);
    }

    // Clear global reference if connection is closed
    if (target.readyState === EventSource.CLOSED && globalEventSource === target) {
      globalEventSource = null;
    }
  };

  return eventSource;
}

// Function to manually close the global SSE connection
export function closeGlobalSSE() {
  if (globalEventSource) {
    console.log('[SSE] Manually closing global connection');
    globalEventSource.close();
    globalEventSource = null;
    currentFilterTaskId = null;
  }
}

/**
 * Reconnect to the SSE stream with a new taskId filter
 * This closes the existing connection and creates a new one
 */
export function reconnectToTaskStream(
  callbacks: SSECallbacks,
  taskId?: number | null
): EventSource {
  console.log(`[SSE] Reconnecting for task: ${taskId ?? 'all'}`);
  return connectToLogStream(callbacks, taskId);
}

export interface ReconnectingSSEManager {
  connect: () => void;
  disconnect: () => void;
  reconnectForTask: (taskId: number | null) => void;
  getCurrentTaskId: () => number | null;
}

export function createReconnectingSSE(
  callbacks: SSECallbacks,
  maxRetries: number = SSE_CONFIG.MAX_RETRIES,
  initialTaskId?: number | null
): ReconnectingSSEManager {
  let eventSource: EventSource | null = null;
  let retryCount = 0;
  let retryTimeout: NodeJS.Timeout | null = null;
  let isManuallyDisconnected = false;
  let currentTaskId: number | null = initialTaskId ?? null;

  const connectWithTaskId = (taskId: number | null) => {
    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }

    isManuallyDisconnected = false;
    currentTaskId = taskId;

    eventSource = connectToLogStream(
      {
        ...callbacks,
        onError: (error) => {
          const target = (error as Event).target as EventSource;

          if (callbacks.onError) {
            callbacks.onError(error);
          }

          // EventSource automatically reconnects, but we track manual disconnects
          if (target.readyState === EventSource.CLOSED && !isManuallyDisconnected) {
            if (retryCount < maxRetries) {
              retryCount++;
              const delay = Math.min(
                SSE_CONFIG.INITIAL_RETRY_DELAY_MS * Math.pow(2, retryCount),
                SSE_CONFIG.MAX_RETRY_DELAY_MS
              );
              console.log(`[SSE] Reconnecting in ${delay}ms (attempt ${retryCount}/${maxRetries})`);

              retryTimeout = setTimeout(() => {
                eventSource = null;
                connectWithTaskId(currentTaskId);
              }, delay);
            } else {
              console.error('[SSE] Max retries reached');
            }
          }
        },
      },
      taskId
    );

    // Reset retry count on successful connection
    eventSource.onopen = () => {
      console.log(`[SSE] Connection established (taskId: ${taskId ?? 'all'})`);
      retryCount = 0;
    };
  };

  const connect = () => {
    if (eventSource) {
      return; // Already connected
    }
    connectWithTaskId(currentTaskId);
  };

  const disconnect = () => {
    isManuallyDisconnected = true;
    if (retryTimeout) {
      clearTimeout(retryTimeout);
      retryTimeout = null;
    }
    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }
    // Clear global reference when manually disconnecting
    closeGlobalSSE();
  };

  const reconnectForTask = (taskId: number | null) => {
    if (taskId === currentTaskId) {
      console.log(`[SSE] Already connected to task: ${taskId ?? 'all'}, skipping reconnect`);
      return;
    }

    console.log(`[SSE] Switching from task ${currentTaskId ?? 'all'} to ${taskId ?? 'all'}`);

    // Clear any pending retry
    if (retryTimeout) {
      clearTimeout(retryTimeout);
      retryTimeout = null;
    }

    retryCount = 0;
    connectWithTaskId(taskId);
  };

  const getCurrentTaskId = () => currentTaskId;

  return { connect, disconnect, reconnectForTask, getCurrentTaskId };
}
