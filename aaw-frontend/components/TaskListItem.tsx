'use client';

import { Task } from '@/types/task';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Clock, AlertCircle, CheckCircle2, XCircle, Pause, Loader2, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TaskListItemProps {
  task: Task;
  isSelected: boolean;
  onClick: () => void;
  showCheckbox?: boolean;
  isChecked?: boolean;
  onCheckChange?: (checked: boolean) => void;
}

export default function TaskListItem({
  task,
  isSelected,
  onClick,
  showCheckbox,
  isChecked,
  onCheckChange
}: TaskListItemProps) {
  // Mission Control status icon mapping
  const getStatusIcon = () => {
    switch (task.status) {
      case 'QUEUED':
        return <Clock className="w-4 h-4 text-mc-accent-blue" />;
      case 'RUNNING':
        return <Loader2 className="w-4 h-4 text-mc-accent-green animate-spin" />;
      case 'CANCELLING':
        return <XCircle className="w-4 h-4 text-mc-accent-yellow animate-spin" />;
      case 'COMPLETED':
        return <CheckCircle2 className="w-4 h-4 text-mc-accent-green" />;
      case 'FAILED':
        return <XCircle className="w-4 h-4 text-mc-accent-red" />;
      case 'INTERRUPTED':
        return <AlertCircle className="w-4 h-4 text-mc-accent-red" />;
      case 'CANCELLED':
        return <XCircle className="w-4 h-4 text-mc-text-muted" />;
      case 'KILLED':
        return <AlertTriangle className="w-4 h-4 text-mc-accent-red" />;
      case 'PAUSED':
        return <Pause className="w-4 h-4 text-mc-accent-yellow" />;
      case 'RATE_LIMITED':
        return <AlertTriangle className="w-4 h-4 text-mc-accent-yellow" />;
      default:
        return <Clock className="w-4 h-4 text-mc-text-muted" />;
    }
  };

  // Mission Control status badge styling
  const getStatusBadgeClass = () => {
    switch (task.status) {
      case 'QUEUED':
        return 'bg-mc-accent-blue/10 text-mc-accent-blue border-mc-accent-blue';
      case 'RUNNING':
        return 'bg-mc-accent-green/10 text-mc-accent-green border-mc-accent-green animate-pulse-slow';
      case 'CANCELLING':
        return 'bg-mc-accent-yellow/10 text-mc-accent-yellow border-mc-accent-yellow animate-pulse';
      case 'COMPLETED':
        return 'bg-mc-accent-green/10 text-mc-accent-green border-mc-accent-green';
      case 'FAILED':
        return 'bg-mc-accent-red/10 text-mc-accent-red border-mc-accent-red';
      case 'INTERRUPTED':
        return 'bg-mc-accent-red/10 text-mc-accent-red border-mc-accent-red';
      case 'CANCELLED':
        return 'bg-mc-text-muted/10 text-mc-text-muted border-mc-text-muted';
      case 'KILLED':
        return 'bg-mc-accent-red/10 text-mc-accent-red border-mc-accent-red';
      case 'RATE_LIMITED':
        return 'bg-mc-accent-yellow/10 text-mc-accent-yellow border-mc-accent-yellow';
      case 'PAUSED':
        return 'bg-mc-accent-yellow/10 text-mc-accent-yellow border-mc-accent-yellow';
      default:
        return 'bg-mc-bg-secondary text-mc-text-muted border-mc-border';
    }
  };

  // Urgent mode: Priority > 0 gets red border and pulse animation
  const isUrgent = task.priority > 0;

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left p-3 rounded-lg border-2 transition-all',
        'hover:bg-mc-bg-secondary hover:border-mc-accent-blue/50',
        isSelected
          ? 'border-mc-accent-blue bg-mc-bg-secondary'
          : isUrgent
            ? 'border-mc-accent-red bg-mc-bg-secondary animate-pulse-urgent'
            : 'border-transparent bg-card'
      )}
    >
      <div className="flex items-start gap-3 w-full">
        {showCheckbox && (
          <Checkbox
            checked={isChecked}
            onCheckedChange={onCheckChange}
            onClick={(e) => e.stopPropagation()}
            className="mt-1"
          />
        )}
        <div className="pt-0.5 flex-shrink-0">
          {getStatusIcon()}
        </div>
        <div className="flex-1 min-w-0 overflow-hidden">
          <div className="flex items-center gap-2 mb-1 min-w-0">
            <span className="text-xs font-mono text-mc-text-muted flex-shrink-0">#{task.id}</span>
            <Badge
              variant="outline"
              className={cn('text-xs flex-shrink-0', getStatusBadgeClass())}
              data-testid="task-status-badge"
            >
              {task.status}
            </Badge>
            {isUrgent && (
              <Badge
                variant="outline"
                className="text-xs flex-shrink-0 bg-mc-accent-purple/10 text-mc-accent-purple border-mc-accent-purple"
              >
                URGENT
              </Badge>
            )}
          </div>
          <p className="text-sm font-medium line-clamp-2 mb-2 break-words text-mc-text-primary">
            {task.instruction || 'No instruction'}
          </p>
          <div className="flex items-center gap-2 text-xs text-mc-text-muted flex-wrap">
            <span className={cn(
              'font-semibold flex-shrink-0',
              isUrgent ? 'text-mc-accent-purple' : 'text-mc-accent-blue'
            )}>
              P{task.priority}
            </span>
            {task.queuePosition !== null && (
              <span className="flex-shrink-0">Queue: {task.queuePosition}</span>
            )}
            {task.retryCount > 0 && (
              <span className="text-mc-accent-yellow flex-shrink-0">Retry: {task.retryCount}</span>
            )}
          </div>
          {task.failureReason && (
            <p className="text-xs text-mc-accent-red mt-1 line-clamp-1">
              {task.failureReason}
            </p>
          )}
        </div>
      </div>
    </button>
  );
}
