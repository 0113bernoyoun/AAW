'use client';

import { useState, useEffect } from 'react';
import { Task } from '@/types/task';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import StatusBadge from '@/components/StatusBadge';
import { useTaskContext } from '@/contexts/TaskContext';
import { Calendar, Clock, RefreshCcw, Shield, Layers, X, AlertTriangle } from 'lucide-react';

interface TaskMetadataHeaderProps {
  task: Task;
}

export default function TaskMetadataHeader({ task }: TaskMetadataHeaderProps) {
  const { cancelRunningTask, forceKillTask } = useTaskContext();
  const [cancelStartTime, setCancelStartTime] = useState<number | null>(null);
  const [showForceKill, setShowForceKill] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isForceKilling, setIsForceKilling] = useState(false);

  // Track when cancellation started and show Force Kill after 10 seconds
  useEffect(() => {
    if (task.status === 'CANCELLING' && !cancelStartTime) {
      setCancelStartTime(Date.now());
    } else if (task.status !== 'CANCELLING') {
      setCancelStartTime(null);
      setShowForceKill(false);
    }
  }, [task.status, cancelStartTime]);

  useEffect(() => {
    if (cancelStartTime) {
      const timer = setInterval(() => {
        if (Date.now() - cancelStartTime > 10000) {
          setShowForceKill(true);
        }
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [cancelStartTime]);

  const handleCancel = async () => {
    try {
      setIsCancelling(true);
      await cancelRunningTask(task.id);
    } catch (error) {
      console.error('[TaskMetadataHeader] Failed to cancel:', error);
    } finally {
      setIsCancelling(false);
    }
  };

  const handleForceKill = async () => {
    try {
      setIsForceKilling(true);
      await forceKillTask(task.id);
    } catch (error) {
      console.error('[TaskMetadataHeader] Failed to force-kill:', error);
    } finally {
      setIsForceKilling(false);
    }
  };
  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleString();
  };

  const getDuration = () => {
    if (!task.startedAt) return null;
    const start = new Date(task.startedAt).getTime();
    const end = task.completedAt ? new Date(task.completedAt).getTime() : Date.now();
    const durationMs = end - start;
    const seconds = Math.floor(durationMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  };

  return (
    <div className="bg-card border-b p-4">
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <h2 className="text-xl font-semibold">Task #{task.id}</h2>
            <StatusBadge status={task.status} />
            <Badge variant="outline" className="text-xs">
              Priority: {task.priority}
            </Badge>

            {/* Cancel button for RUNNING tasks */}
            {task.status === 'RUNNING' && (
              <Button
                variant="destructive"
                size="sm"
                onClick={handleCancel}
                disabled={isCancelling}
              >
                <X className="w-4 h-4 mr-1" />
                {isCancelling ? 'Cancelling...' : 'Cancel'}
              </Button>
            )}

            {/* Cancelling state with optional Force Kill */}
            {task.status === 'CANCELLING' && (
              <div className="flex items-center gap-2">
                {showForceKill && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleForceKill}
                    disabled={isForceKilling}
                    className="bg-red-700 hover:bg-red-800"
                  >
                    <AlertTriangle className="w-4 h-4 mr-1" />
                    {isForceKilling ? 'Killing...' : 'Force Kill'}
                  </Button>
                )}
              </div>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            {task.instruction}
          </p>
        </div>
      </div>

      <Separator className="my-4" />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-muted-foreground" />
          <div>
            <p className="text-xs text-muted-foreground">Created</p>
            <p className="font-medium">{formatDate(task.createdAt)}</p>
          </div>
        </div>

        {task.startedAt && (
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">Duration</p>
              <p className="font-medium">{getDuration()}</p>
            </div>
          </div>
        )}

        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-muted-foreground" />
          <div>
            <p className="text-xs text-muted-foreground">Session</p>
            <p className="font-medium">{task.sessionMode}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-muted-foreground" />
          <div>
            <p className="text-xs text-muted-foreground">Permissions</p>
            <p className="font-medium">
              {task.skipPermissions ? (
                <span className="text-destructive">Skipped</span>
              ) : (
                <span className="text-green-600">Required</span>
              )}
            </p>
          </div>
        </div>

        {task.retryCount > 0 && (
          <div className="flex items-center gap-2">
            <RefreshCcw className="w-4 h-4 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">Retries</p>
              <p className="font-medium text-orange-600">{task.retryCount}</p>
            </div>
          </div>
        )}

        {task.queuePosition !== null && (
          <div className="flex items-center gap-2">
            <div>
              <p className="text-xs text-muted-foreground">Queue Position</p>
              <p className="font-medium">#{task.queuePosition}</p>
            </div>
          </div>
        )}
      </div>

      {task.failureReason && (
        <>
          <Separator className="my-4" />
          <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3">
            <p className="text-xs font-semibold text-destructive mb-1">Failure Reason:</p>
            <p className="text-sm text-destructive/90">{task.failureReason}</p>
          </div>
        </>
      )}
    </div>
  );
}
