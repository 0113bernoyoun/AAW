'use client';

import { Task } from '@/types/task';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';

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
  // Get status color for the left border indicator
  const getStatusColor = () => {
    switch (task.status) {
      case 'RUNNING':
        return 'bg-emerald-500';
      case 'QUEUED':
        return 'bg-sky-500';
      case 'COMPLETED':
        return 'bg-emerald-500';
      case 'FAILED':
      case 'INTERRUPTED':
      case 'KILLED':
        return 'bg-red-500';
      case 'PAUSED':
      case 'RATE_LIMITED':
      case 'CANCELLING':
        return 'bg-amber-500';
      default:
        return 'bg-zinc-400';
    }
  };

  // Format status subtitle
  const getStatusSubtitle = () => {
    const timeAgo = formatDistanceToNow(new Date(task.completedAt || task.startedAt || task.createdAt), { addSuffix: true });

    switch (task.status) {
      case 'RUNNING':
        return `Active: ${timeAgo}`;
      case 'QUEUED':
        return `Queued: ${timeAgo}`;
      case 'COMPLETED':
        return `Completed: ${timeAgo}`;
      case 'FAILED':
        return `Failed: ${timeAgo}`;
      case 'INTERRUPTED':
        return `Interrupted: ${timeAgo}`;
      case 'CANCELLED':
        return `Cancelled: ${timeAgo}`;
      case 'KILLED':
        return `Killed: ${timeAgo}`;
      case 'PAUSED':
        return `Paused: ${timeAgo}`;
      case 'RATE_LIMITED':
        return `Rate Limited: ${timeAgo}`;
      case 'CANCELLING':
        return `Cancelling: ${timeAgo}`;
      default:
        return timeAgo;
    }
  };

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left p-3 rounded-lg transition-all duration-200 relative overflow-hidden',
        'hover:bg-zinc-800/50 group',
        isSelected
          ? 'bg-zinc-800/80'
          : 'bg-zinc-900/30'
      )}
    >
      {/* Left color indicator */}
      <div className={cn(
        'absolute left-0 top-0 bottom-0 w-1 rounded-l-lg transition-all duration-200',
        isSelected ? 'bg-sky-500' : getStatusColor()
      )} />

      <div className="flex items-start gap-3 w-full pl-2">
        {showCheckbox && (
          <Checkbox
            checked={isChecked}
            onCheckedChange={onCheckChange}
            onClick={(e) => e.stopPropagation()}
            className="mt-1"
          />
        )}
        <div className="flex-1 min-w-0 overflow-hidden">
          {/* Title */}
          <p className="text-sm font-medium line-clamp-2 break-words text-zinc-100 mb-1">
            {task.instruction || 'No instruction'}
          </p>
          {/* Status subtitle */}
          <p className="text-xs text-zinc-400">
            {getStatusSubtitle()}
          </p>
        </div>
      </div>
    </button>
  );
}
