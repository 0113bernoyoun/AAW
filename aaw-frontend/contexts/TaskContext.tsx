'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Task, TaskEvent, TaskStatus, RecoveryAttempt, SystemState } from '@/types/task';
import { createReconnectingSSE, closeGlobalSSE, ReconnectingSSEManager, SSECallbacks } from '@/lib/sse-client';
import { SSE_CONFIG } from '@/config/sse';
import { toast } from 'sonner';

// Interface for historical log entries from the API
export interface LogEntry {
  id: number;
  taskId: number;
  logChunk: string;
  isError: boolean;
  createdAt: string;
}

interface TaskContextValue {
  tasks: Task[];
  selectedTaskId: number | null;
  isSystemReady: boolean;
  isConnected: boolean;
  isRateLimited: boolean;
  runnerStatus: 'IDLE' | 'BUSY' | 'UNKNOWN';
  sseEvents: TaskEvent[];
  selectTask: (taskId: number | null) => void;
  refreshTasks: () => Promise<void>;
  cancelTask: (taskId: number) => Promise<void>;
  cancelRunningTask: (taskId: number) => Promise<void>;
  forceKillTask: (taskId: number) => Promise<void>;
  retryTask: (taskId: number) => Promise<void>;
  skipTask: (taskId: number) => Promise<void>;
  restartRunner: () => Promise<void>;
  createTask: (data: {
    instruction: string;
    scriptContent: string;
    skipPermissions: boolean;
    sessionMode: string;
    priority?: number;
    executionMode?: string;
  }) => Promise<Task>;
  fetchTaskLogs: (taskId: number) => Promise<LogEntry[]>;
  fetchSystemState: () => Promise<SystemState | null>;
}

const TaskContext = createContext<TaskContextValue | undefined>(undefined);

export function useTaskContext() {
  const context = useContext(TaskContext);
  if (!context) {
    throw new Error('useTaskContext must be used within a TaskProvider');
  }
  return context;
}

export function TaskProvider({ children }: { children: React.ReactNode }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [isSystemReady, setIsSystemReady] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isRateLimited, setIsRateLimited] = useState(false);
  const [runnerStatus, setRunnerStatus] = useState<'IDLE' | 'BUSY' | 'UNKNOWN'>('UNKNOWN');
  const [sseEvents, setSseEvents] = useState<TaskEvent[]>([]);
  const sseInitialized = useRef(false);
  const sseManagerRef = useRef<ReconnectingSSEManager | null>(null);
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Helper to add recovery attempt to task's history
  const addRecoveryAttempt = useCallback((
    taskId: number,
    action: RecoveryAttempt['action'],
    result: RecoveryAttempt['result'],
    errorMessage?: string
  ) => {
    setTasks(prev => prev.map(task => {
      if (task.id !== taskId) return task;

      const history = task.recoveryHistory || [];
      const attemptNumber = history.length + 1;
      const newAttempt: RecoveryAttempt = {
        attemptNumber,
        timestamp: new Date().toISOString(),
        action,
        result,
        errorMessage,
      };

      return {
        ...task,
        recoveryHistory: [...history, newAttempt],
      };
    }));
  }, []);

  // Fetch all tasks from backend
  const refreshTasks = useCallback(async () => {
    try {
      const response = await fetch('http://localhost:8080/api/tasks/list');
      if (response.ok) {
        const taskList = await response.json();
        // Preserve recovery history when refreshing
        setTasks(prev => {
          return taskList.map((newTask: Task) => {
            const existingTask = prev.find(t => t.id === newTask.id);
            return {
              ...newTask,
              recoveryHistory: existingTask?.recoveryHistory || [],
            };
          });
        });
      }
    } catch (error) {
      console.error('Failed to fetch tasks:', error);
    }
  }, []);

  // Cancel a task (legacy - queued tasks)
  const cancelTask = useCallback(async (taskId: number) => {
    try {
      const response = await fetch(`http://localhost:8080/api/tasks/${taskId}/cancel`, {
        method: 'POST',
      });
      if (response.ok) {
        await refreshTasks();
      }
    } catch (error) {
      console.error('Failed to cancel task:', error);
    }
  }, [refreshTasks]);

  // Cancel a running task (graceful cancellation)
  const cancelRunningTask = useCallback(async (taskId: number) => {
    try {
      console.log('[TaskContext] Cancelling running task:', taskId);
      const response = await fetch(`http://localhost:8080/api/tasks/${taskId}/cancel`, {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error(`Failed to cancel task: ${response.status}`);
      }

      await refreshTasks();
    } catch (error) {
      console.error('[TaskContext] Failed to cancel task:', error);
      throw error;
    }
  }, [refreshTasks]);

  // Force kill a task (immediate termination)
  const forceKillTask = useCallback(async (taskId: number) => {
    try {
      console.log('[TaskContext] Force killing task:', taskId);
      const response = await fetch(`http://localhost:8080/api/tasks/${taskId}/force-kill`, {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error(`Failed to force-kill task: ${response.status}`);
      }

      await refreshTasks();
    } catch (error) {
      console.error('[TaskContext] Failed to force-kill task:', error);
      throw error;
    }
  }, [refreshTasks]);

  // Retry an interrupted task
  const retryTask = useCallback(async (taskId: number) => {
    try {
      const response = await fetch(`http://localhost:8080/api/tasks/${taskId}/retry`, {
        method: 'POST',
      });
      if (response.ok) {
        addRecoveryAttempt(taskId, 'RETRY', 'SUCCESS');
        await refreshTasks();
      } else {
        addRecoveryAttempt(taskId, 'RETRY', 'FAILED', 'API request failed');
        throw new Error('Failed to retry task');
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      addRecoveryAttempt(taskId, 'RETRY', 'FAILED', errorMsg);
      console.error('Failed to retry task:', error);
      throw error;
    }
  }, [refreshTasks, addRecoveryAttempt]);

  // Skip an interrupted task
  const skipTask = useCallback(async (taskId: number) => {
    try {
      const response = await fetch(`http://localhost:8080/api/tasks/${taskId}/skip`, {
        method: 'POST',
      });
      if (response.ok) {
        addRecoveryAttempt(taskId, 'SKIP', 'SUCCESS');
        await refreshTasks();
      } else {
        addRecoveryAttempt(taskId, 'SKIP', 'FAILED', 'API request failed');
        throw new Error('Failed to skip task');
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      addRecoveryAttempt(taskId, 'SKIP', 'FAILED', errorMsg);
      console.error('Failed to skip task:', error);
      throw error;
    }
  }, [refreshTasks, addRecoveryAttempt]);

  // Restart runner session
  const restartRunner = useCallback(async () => {
    try {
      const response = await fetch('http://localhost:8080/api/runner/restart', {
        method: 'POST',
      });
      if (response.ok) {
        console.log('[TaskContext] Runner restart initiated');
        // Track restart for all INTERRUPTED tasks
        tasks.forEach(task => {
          if (task.status === 'INTERRUPTED') {
            addRecoveryAttempt(task.id, 'RESTART_SESSION', 'SUCCESS');
          }
        });
        await refreshTasks();
      } else {
        tasks.forEach(task => {
          if (task.status === 'INTERRUPTED') {
            addRecoveryAttempt(task.id, 'RESTART_SESSION', 'FAILED', 'API request failed');
          }
        });
        throw new Error('Failed to restart runner');
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      tasks.forEach(task => {
        if (task.status === 'INTERRUPTED') {
          addRecoveryAttempt(task.id, 'RESTART_SESSION', 'FAILED', errorMsg);
        }
      });
      console.error('Failed to restart runner:', error);
      throw error;
    }
  }, [refreshTasks, tasks, addRecoveryAttempt]);

  // Create a new task
  const createTask = useCallback(async (data: {
    instruction: string;
    scriptContent: string;
    skipPermissions: boolean;
    sessionMode: string;
    priority?: number;
    executionMode?: string;
  }): Promise<Task> => {
    const response = await fetch('http://localhost:8080/api/tasks/create-with-priority', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        instruction: data.instruction,
        scriptContent: data.scriptContent,
        skipPermissions: data.skipPermissions,
        sessionMode: data.sessionMode,
        priority: data.priority || 0,
        executionMode: data.executionMode || 'QUEUED',
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to create task');
    }

    const task = await response.json();
    await refreshTasks();
    return task;
  }, [refreshTasks]);

  // Select a task
  const selectTask = useCallback((taskId: number | null) => {
    setSelectedTaskId(taskId);
  }, []);

  // Fetch historical logs for a specific task
  const fetchTaskLogs = useCallback(async (taskId: number): Promise<LogEntry[]> => {
    try {
      const response = await fetch(`http://localhost:8080/api/tasks/${taskId}/logs`);
      if (response.ok) {
        const logs = await response.json();
        console.log(`[TaskContext] Fetched ${logs.length} logs for task ${taskId}`);
        return logs;
      }
      console.error(`[TaskContext] Failed to fetch logs for task ${taskId}: ${response.status}`);
      return [];
    } catch (error) {
      console.error(`[TaskContext] Error fetching logs for task ${taskId}:`, error);
      return [];
    }
  }, []);

  /**
   * Phase 4: Fetch system state for re-attachment after browser refresh.
   * Returns current runner status, running tasks, and queue info.
   */
  const fetchSystemState = useCallback(async (): Promise<SystemState | null> => {
    try {
      const response = await fetch('http://localhost:8080/api/runner/status');
      if (response.ok) {
        const state: SystemState = await response.json();
        console.log('[TaskContext] Fetched system state:', state);

        // Update local state based on fetched system state
        setIsSystemReady(state.isRunnerConnected);
        setIsConnected(state.isRunnerConnected);
        setIsRateLimited(state.isRateLimited);
        setRunnerStatus(state.runnerStatus as 'IDLE' | 'BUSY');

        return state;
      }
      console.error('[TaskContext] Failed to fetch system state:', response.status);
      return null;
    } catch (error) {
      console.error('[TaskContext] Error fetching system state:', error);
      return null;
    }
  }, []);

  // SSE callbacks - memoized to prevent unnecessary reconnections
  const sseCallbacks: SSECallbacks = useMemo(() => ({
    onLog: (logChunk) => {
      // Convert LogChunk to TaskEvent
      const taskEvent: TaskEvent = {
        type: logChunk.type as TaskEvent['type'],
        taskId: logChunk.taskId,
        line: logChunk.line,
        isError: logChunk.isError,
        status: logChunk.status as TaskStatus | undefined,
      };
      setSseEvents(prev => [...prev, taskEvent]);
    },
    onStatusUpdate: (status: string, taskId?: number) => {
      // Update the status of the specified task or currently running task
      setTasks(prev => prev.map(task => {
        if (taskId && task.id === taskId) {
          return { ...task, status: status as TaskStatus };
        }
        if (!taskId && task.status === 'RUNNING') {
          return { ...task, status: status as TaskStatus };
        }
        return task;
      }));

      // Add status update event
      setSseEvents(prev => [...prev, {
        type: 'STATUS_UPDATE',
        taskId,
        status: status as TaskStatus,
      }]);
    },
    onSystemReady: () => {
      console.log('[TaskContext] System ready - Runner connected');
      setIsSystemReady(true);
      setIsConnected(true);
      setRunnerStatus('IDLE'); // Assume IDLE on connect, will be updated if busy
      setSseEvents(prev => [...prev, {
        type: 'SYSTEM_READY',
      }]);
      // Note: refreshTasks is called separately to avoid dependency issues
    },
    onSystemDisconnected: () => {
      console.log('[TaskContext] System disconnected - Runner offline');
      setIsSystemReady(false);
      setIsConnected(false);
      setRunnerStatus('UNKNOWN');
      setSseEvents(prev => [...prev, {
        type: 'SYSTEM_DISCONNECTED',
      }]);
    },
    onDispatcherPaused: () => {
      console.log('[TaskContext] Dispatcher paused - Rate limited');
      setIsRateLimited(true);
    },
    onDispatcherResumed: () => {
      console.log('[TaskContext] Dispatcher resumed - Rate limit cleared');
      setIsRateLimited(false);
    },
    onTaskRunning: (taskId: number) => {
      console.log('[TaskContext] Task running (snapshot):', taskId);
      setRunnerStatus('BUSY');
      setSseEvents(prev => [...prev, {
        type: 'TASK_RUNNING',
        taskId,
      }]);
    },
    onTaskDeleted: (taskId: number, reason: string) => {
      console.log(`[TaskContext] Task ${taskId} deleted (reason: ${reason})`);

      // Remove task from UI
      setTasks(prev => prev.filter(task => task.id !== taskId));

      // Show toast notification for manual deletion
      toast.info(`Task ${taskId} manually deleted`, {
        duration: 3000,
      });

      // Add deletion event
      setSseEvents(prev => [...prev, {
        type: 'TASK_DELETED' as any,
        taskId,
      }]);
    },
    onTaskArchived: (taskId: number) => {
      console.log(`[TaskContext] Task ${taskId} archived by retention policy`);

      // Remove task from UI silently (no toast)
      setTasks(prev => prev.filter(task => task.id !== taskId));

      // Add archival event
      setSseEvents(prev => [...prev, {
        type: 'TASK_ARCHIVED' as any,
        taskId,
      }]);
    },
    onError: (error) => {
      console.error('[TaskContext] SSE error:', error);
      setIsSystemReady(false);
      setIsConnected(false);
    },
  }), []);

  // Set up SSE connection for real-time updates
  useEffect(() => {
    if (sseInitialized.current) return;
    sseInitialized.current = true;

    // Create SSE manager with initial connection (no task filter - receive all)
    const sseManager = createReconnectingSSE(sseCallbacks, SSE_CONFIG.MAX_RETRIES, null);
    sseManagerRef.current = sseManager;

    sseManager.connect();

    // Initial fetch: tasks and system state
    // Note: SSE will also send a snapshot, but fetching explicitly ensures
    // we have state even if SSE connection is delayed
    refreshTasks();
    fetchSystemState();

    return () => {
      sseManager.disconnect();
      closeGlobalSSE();
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, [sseCallbacks, refreshTasks, fetchSystemState]);

  // Refresh tasks when system becomes ready
  useEffect(() => {
    if (isSystemReady) {
      refreshTasks();
    }
  }, [isSystemReady, refreshTasks]);

  // OPTIONAL: Reconnect SSE when selectedTaskId changes for task-specific filtering
  // This is controlled by SSE_CONFIG.ENABLE_TASK_SPECIFIC_FILTERING
  useEffect(() => {
    // Skip if task-specific filtering is disabled
    if (!SSE_CONFIG.ENABLE_TASK_SPECIFIC_FILTERING) {
      return;
    }

    // Skip if SSE not initialized yet
    if (!sseInitialized.current || !sseManagerRef.current) {
      return;
    }

    // Debounce task selection changes to prevent rapid reconnections
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    debounceTimeoutRef.current = setTimeout(() => {
      const currentSSETaskId = sseManagerRef.current?.getCurrentTaskId() ?? null;
      const needsReconnect = selectedTaskId !== currentSSETaskId;

      if (needsReconnect) {
        console.log(`[TaskContext] Reconnecting SSE for task: ${selectedTaskId ?? 'all'} (was: ${currentSSETaskId ?? 'all'})`);
        sseManagerRef.current?.reconnectForTask(selectedTaskId);
      }
    }, SSE_CONFIG.TASK_SWITCH_DEBOUNCE_MS);

    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, [selectedTaskId]);

  const value: TaskContextValue = {
    tasks,
    selectedTaskId,
    isSystemReady,
    isConnected,
    isRateLimited,
    runnerStatus,
    sseEvents,
    selectTask,
    refreshTasks,
    cancelTask,
    cancelRunningTask,
    forceKillTask,
    retryTask,
    skipTask,
    restartRunner,
    createTask,
    fetchTaskLogs,
    fetchSystemState,
  };

  return <TaskContext.Provider value={value}>{children}</TaskContext.Provider>;
}
