'use client';

import { useState } from 'react';
import { useTaskContext } from '@/contexts/TaskContext';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import TaskListItem from '@/components/TaskListItem';
import { ThemeToggle } from '@/components/ThemeToggle';
import { ListTodo, RefreshCw, Trash2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TASK_CONFIG } from '@/config/tasks';

export default function TaskSidebar() {
  const { tasks, selectedTaskId, selectTask, refreshTasks } = useTaskContext();
  const [isBulkClearing, setIsBulkClearing] = useState(false);
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<number>>(new Set());

  // Filter out old completed/failed tasks based on configuration
  const filteredTasks = tasks.filter(task => {
    // Hide cancelled tasks completely (cleanup artifacts)
    if (TASK_CONFIG.HIDDEN_STATUSES?.includes(task.status as any)) {
      return false;
    }

    // Always show active tasks (QUEUED, RUNNING, PAUSED, RATE_LIMITED)
    if (TASK_CONFIG.ACTIVE_STATUSES.includes(task.status as any)) {
      return true;
    }

    // For completed/failed/interrupted tasks, check age
    if (TASK_CONFIG.FILTERABLE_STATUSES.includes(task.status as any)) {
      // If threshold is 0, show all tasks
      if (TASK_CONFIG.HIDE_COMPLETED_AFTER_MINUTES === 0) {
        return true;
      }

      const completedAt = new Date(task.completedAt || task.createdAt);
      const now = new Date();
      const ageMinutes = (now.getTime() - completedAt.getTime()) / 1000 / 60;

      // Only show if task is newer than threshold
      return ageMinutes < TASK_CONFIG.HIDE_COMPLETED_AFTER_MINUTES;
    }

    // Show any other status
    return true;
  });

  // Mission Control Priority Score Formula: (Priority × -1) + (Timestamp ÷ 10^13)
  // Lower score = higher priority (negative priority values move tasks up)
  // Recent tasks get slight boost from timestamp component
  const calculatePriorityScore = (task: typeof filteredTasks[0]) => {
    const priorityComponent = task.priority * -1;
    const timestampComponent = new Date(task.createdAt).getTime() / 1e13;
    return priorityComponent + timestampComponent;
  };

  // Sort tasks by Mission Control priority score
  const sortedTasks = [...filteredTasks].sort((a, b) => {
    // RUNNING tasks always first (highest priority)
    if (a.status === 'RUNNING' && b.status !== 'RUNNING') return -1;
    if (a.status !== 'RUNNING' && b.status === 'RUNNING') return 1;

    // INTERRUPTED tasks second (need recovery attention)
    if (a.status === 'INTERRUPTED' && b.status !== 'INTERRUPTED') return -1;
    if (a.status !== 'INTERRUPTED' && b.status === 'INTERRUPTED') return 1;

    // For QUEUED tasks, use priority score formula
    if (a.status === 'QUEUED' && b.status === 'QUEUED') {
      const scoreA = calculatePriorityScore(a);
      const scoreB = calculatePriorityScore(b);
      return scoreA - scoreB; // Lower score = higher priority
    }

    // QUEUED tasks before paused/rate limited
    if (a.status === 'QUEUED' && b.status !== 'QUEUED') return -1;
    if (a.status !== 'QUEUED' && b.status === 'QUEUED') return 1;

    // Paused/rate limited states
    const pausedStates = ['PAUSED', 'RATE_LIMITED'];
    const aIsPaused = pausedStates.includes(a.status);
    const bIsPaused = pausedStates.includes(b.status);
    if (aIsPaused && !bIsPaused) return -1;
    if (!aIsPaused && bIsPaused) return 1;

    // Finally by creation time (newest first)
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  // Count clearable tasks for button label
  const clearableCount = filteredTasks.filter(task =>
    TASK_CONFIG.FILTERABLE_STATUSES.includes(task.status as any)
  ).length;

  const handleBulkClear = async () => {
    if (clearableCount === 0) return;

    const confirmed = window.confirm(
      `${clearableCount}개의 완료/실패 작업을 정리하시겠습니까?\n\n` +
      `이 작업은 되돌릴 수 없습니다.`
    );

    if (!confirmed) return;

    setIsBulkClearing(true);

    try {
      const response = await fetch('http://localhost:8080/api/tasks/bulk-cleanup', {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error(`Bulk cleanup failed: ${response.status}`);
      }

      const result = await response.json();
      console.log(`[TaskSidebar] Bulk cleanup completed: ${result.cleanedCount} tasks cleaned`);

      // Refresh task list
      await refreshTasks();

    } catch (error) {
      console.error('[TaskSidebar] Bulk cleanup error:', error);
      alert('정리 중 오류가 발생했습니다. 다시 시도해주세요.');
    } finally {
      setIsBulkClearing(false);
    }
  };

  const handleSelectTask = (taskId: number, selected: boolean) => {
    setSelectedTaskIds(prev => {
      const next = new Set(prev);
      if (selected) next.add(taskId);
      else next.delete(taskId);
      return next;
    });
  };

  const handleSelectAll = () => {
    const allIds = filteredTasks
      .filter(t => TASK_CONFIG.FILTERABLE_STATUSES.includes(t.status as any))
      .map(t => t.id);
    setSelectedTaskIds(new Set(allIds));
  };

  const handleClearSelection = () => setSelectedTaskIds(new Set());

  const handleBulkDeleteSelected = async () => {
    const taskIds = Array.from(selectedTaskIds);
    if (taskIds.length === 0) return;

    const confirmed = window.confirm(
      `${taskIds.length}개의 선택된 작업을 삭제하시겠습니까?\n\n` +
      `이 작업은 되돌릴 수 없습니다.`
    );
    if (!confirmed) return;

    setIsBulkClearing(true);

    try {
      const response = await fetch('http://localhost:8080/api/tasks/bulk-cleanup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskIds }),
      });

      if (!response.ok) throw new Error(`Bulk cleanup failed: ${response.status}`);

      const result = await response.json();
      console.log(`[TaskSidebar] Bulk cleanup: ${result.cleanedCount} tasks cleaned`);

      setSelectedTaskIds(new Set());
      await refreshTasks();

    } catch (error) {
      console.error('[TaskSidebar] Bulk cleanup error:', error);
      alert('정리 중 오류가 발생했습니다. 다시 시도해주세요.');
    } finally {
      setIsBulkClearing(false);
    }
  };

  return (
    <div className="h-full flex flex-col bg-card border-r overflow-hidden">
      <div className="p-4 border-b overflow-hidden">
        <div className="flex items-center justify-between gap-3 mb-2 w-full min-w-0">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <ListTodo className="w-5 h-5 flex-shrink-0" />
            <h2 className="text-lg font-semibold truncate">Task List UPDATED</h2>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <ThemeToggle />

            {/* Selection controls */}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSelectAll}
              disabled={clearableCount === 0}
              className="h-8 px-2 text-xs"
              title={`모든 ${clearableCount}개 정리 가능 작업 선택`}
            >
              전체 선택
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearSelection}
              disabled={selectedTaskIds.size === 0}
              className="h-8 px-2 text-xs"
            >
              선택 해제
            </Button>

            {/* Delete selected */}
            <Button
              variant="destructive"
              size="sm"
              onClick={handleBulkDeleteSelected}
              disabled={isBulkClearing || selectedTaskIds.size === 0}
              className="h-8 w-8 p-0"
              title={selectedTaskIds.size > 0 ? `${selectedTaskIds.size}개 선택 삭제` : '선택된 작업 없음'}
            >
              {isBulkClearing ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4" />
              )}
            </Button>

            {/* Refresh */}
            <Button
              variant="ghost"
              size="sm"
              onClick={refreshTasks}
              className="h-8 w-8 p-0"
            >
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground truncate">
          {filteredTasks.length} shown
        </p>
      </div>

      {/* New Task Button */}
      <div className="px-4 pb-2">
        <Button
          variant="default"
          size="sm"
          onClick={() => selectTask(null)}
          disabled={selectedTaskId === null}
          className="w-full"
        >
          <Plus className="w-4 h-4 mr-2" />
          New Task
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {sortedTasks.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-sm text-muted-foreground">No tasks yet</p>
              <p className="text-xs text-muted-foreground mt-1">
                Create a task to get started
              </p>
            </div>
          ) : (
            sortedTasks.map((task) => (
              <TaskListItem
                key={task.id}
                task={task}
                isSelected={selectedTaskId === task.id}
                onClick={() => selectTask(task.id)}
                showCheckbox={TASK_CONFIG.FILTERABLE_STATUSES.includes(task.status as any)}
                isChecked={selectedTaskIds.has(task.id)}
                onCheckChange={(checked) => handleSelectTask(task.id, checked)}
              />
            ))
          )}
        </div>
      </ScrollArea>

      <Separator />

      <div className="p-4">
        <div className="space-y-2 text-xs text-muted-foreground">
          <div className="flex items-center justify-between">
            <span>Running:</span>
            <span className="font-semibold">
              {filteredTasks.filter(t => t.status === 'RUNNING').length}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span>Queued:</span>
            <span className="font-semibold">
              {filteredTasks.filter(t => t.status === 'QUEUED').length}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span>Completed:</span>
            <span className="font-semibold text-green-600">
              {filteredTasks.filter(t => t.status === 'COMPLETED').length}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span>Failed:</span>
            <span className="font-semibold text-red-600">
              {filteredTasks.filter(t => t.status === 'FAILED').length}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
