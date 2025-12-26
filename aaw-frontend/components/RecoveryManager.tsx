'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useTaskContext } from '@/contexts/TaskContext';
import TaskRecoveryModal from './TaskRecoveryModal';
import { Task } from '@/types/task';
import { toast } from 'sonner';
import { shouldAutoRetry, calculateRetryDelay, getRetryDelayMessage } from '@/lib/auto-retry';

/**
 * Phase 4.5: Monitors for INTERRUPTED tasks and shows recovery modal.
 */
export default function RecoveryManager() {
  const { tasks, retryTask, skipTask, restartRunner } = useTaskContext();
  const [interruptedTask, setInterruptedTask] = useState<Task | null>(null);
  const [autoRetryCountdown, setAutoRetryCountdown] = useState<number | null>(null);
  const autoRetryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Clear auto-retry timers
  const clearAutoRetryTimers = useCallback(() => {
    if (autoRetryTimeoutRef.current) {
      clearTimeout(autoRetryTimeoutRef.current);
      autoRetryTimeoutRef.current = null;
    }
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    setAutoRetryCountdown(null);
  }, []);

  // Schedule auto-retry for a task
  const scheduleAutoRetry = useCallback((task: Task) => {
    clearAutoRetryTimers();

    if (!shouldAutoRetry(task)) {
      return;
    }

    const delayMs = calculateRetryDelay(task.retryCount);
    const delayMessage = getRetryDelayMessage(delayMs);

    console.log(`[RecoveryManager] Auto-retry scheduled for task #${task.id} in ${delayMessage}`);

    toast.info(`Auto-retry scheduled`, {
      id: `auto-retry-${task.id}`,
      description: `Task #${task.id} will retry in ${delayMessage}`,
    });

    // Set initial countdown in seconds
    setAutoRetryCountdown(Math.ceil(delayMs / 1000));

    // Countdown interval
    countdownIntervalRef.current = setInterval(() => {
      setAutoRetryCountdown(prev => {
        if (prev === null || prev <= 1) {
          if (countdownIntervalRef.current) {
            clearInterval(countdownIntervalRef.current);
            countdownIntervalRef.current = null;
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    // Auto-retry timeout
    autoRetryTimeoutRef.current = setTimeout(async () => {
      console.log(`[RecoveryManager] Auto-retry triggered for task #${task.id}`);
      clearAutoRetryTimers();

      try {
        await retryTask(task.id);
        toast.success(`Task #${task.id} auto-retried`, {
          id: `auto-retry-${task.id}`,
          description: `Attempt #${task.retryCount + 1}`,
        });
      } catch (error) {
        console.error('[RecoveryManager] Auto-retry failed:', error);
        toast.error(`Auto-retry failed for task #${task.id}`, {
          id: `auto-retry-${task.id}`,
          description: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }, delayMs);
  }, [clearAutoRetryTimers, retryTask]);

  useEffect(() => {
    // Find the first INTERRUPTED task
    const interrupted = tasks.find(task => task.status === 'INTERRUPTED');

    if (interrupted) {
      if (!interruptedTask || interruptedTask.id !== interrupted.id) {
        console.log('[RecoveryManager] Interrupted task detected:', interrupted.id);
        setInterruptedTask(interrupted);
        scheduleAutoRetry(interrupted);
      }
    } else if (interruptedTask) {
      // Task was resolved, close modal and clear timers
      console.log('[RecoveryManager] Interrupted task resolved');
      setInterruptedTask(null);
      clearAutoRetryTimers();
    }
  }, [tasks, interruptedTask, scheduleAutoRetry, clearAutoRetryTimers]);

  const handleRetryCurrent = async () => {
    if (!interruptedTask) return;

    // Cancel auto-retry on manual intervention
    clearAutoRetryTimers();

    const toastId = `retry-${interruptedTask.id}`;
    toast.loading(`Retrying task #${interruptedTask.id}...`, { id: toastId });

    try {
      console.log('[RecoveryManager] Retrying task:', interruptedTask.id);
      await retryTask(interruptedTask.id);
      toast.success(`Task #${interruptedTask.id} queued for retry`, {
        id: toastId,
        description: `Attempt #${interruptedTask.retryCount + 1}`,
      });
      setInterruptedTask(null);
    } catch (error) {
      console.error('[RecoveryManager] Failed to retry task:', error);
      toast.error(`Failed to retry task #${interruptedTask.id}`, {
        id: toastId,
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };

  const handleSkipToNext = async () => {
    if (!interruptedTask) return;

    // Cancel auto-retry on manual intervention
    clearAutoRetryTimers();

    const toastId = `skip-${interruptedTask.id}`;
    toast.loading(`Skipping task #${interruptedTask.id}...`, { id: toastId });

    try {
      console.log('[RecoveryManager] Skipping task:', interruptedTask.id);
      await skipTask(interruptedTask.id);
      toast.info(`Task #${interruptedTask.id} marked as failed`, {
        id: toastId,
        description: 'Moving to next task in queue',
      });
      setInterruptedTask(null);
    } catch (error) {
      console.error('[RecoveryManager] Failed to skip task:', error);
      toast.error(`Failed to skip task #${interruptedTask.id}`, {
        id: toastId,
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };

  const handleRestartSession = async () => {
    if (!interruptedTask) return;

    // Cancel auto-retry on manual intervention
    clearAutoRetryTimers();

    const toastId = 'restart-session';
    toast.loading('Restarting runner session...', { id: toastId });

    try {
      console.log('[RecoveryManager] Restarting runner session');
      await restartRunner();
      toast.success('Runner session restarted', {
        id: toastId,
        description: 'All tasks will be re-queued with clean state',
      });
      setInterruptedTask(null);
    } catch (error) {
      console.error('[RecoveryManager] Failed to restart session:', error);
      toast.error('Failed to restart runner session', {
        id: toastId,
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };

  if (!interruptedTask) {
    return null;
  }

  return (
    <TaskRecoveryModal
      task={interruptedTask}
      open={true}
      onOpenChange={(open) => {
        if (!open) {
          clearAutoRetryTimers();
          setInterruptedTask(null);
        }
      }}
      onRetryCurrent={handleRetryCurrent}
      onSkipToNext={handleSkipToNext}
      onRestartSession={handleRestartSession}
      autoRetryCountdown={autoRetryCountdown}
    />
  );
}
