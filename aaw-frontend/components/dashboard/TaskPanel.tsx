'use client';

import { useState } from 'react';
import { useTaskContext } from '@/contexts/TaskContext';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import TaskListItem from '@/components/TaskListItem';
import { Plus, Trash2, ListTodo } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TASK_CONFIG } from '@/config/tasks';
import { buildApiUrl } from '@/lib/api';
import DashboardWidgets from './DashboardWidgets';

export default function TaskPanel() {
  const { tasks, selectedTaskId, selectTask, refreshTasks } = useTaskContext();
  const [isBulkClearing, setIsBulkClearing] = useState(false);
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<number>>(new Set());
  const [activeTab, setActiveTab] = useState<'active' | 'queued' | 'completed'>('active');

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

  // Tab-based filtering
  const getTasksByTab = (tab: string) => {
    switch (tab) {
      case 'active':
        return filteredTasks.filter(t =>
          ['RUNNING', 'INTERRUPTED', 'PAUSED', 'RATE_LIMITED', 'CANCELLING', 'TERMINATING'].includes(t.status)
        );
      case 'queued':
        return filteredTasks.filter(t => t.status === 'QUEUED');
      case 'completed':
        return filteredTasks.filter(t =>
          ['COMPLETED', 'FAILED', 'KILLED', 'CANCELLED'].includes(t.status) && !t.isArchived
        );
      default:
        return filteredTasks;
    }
  };

  const tasksForTab = getTasksByTab(activeTab);

  // Sort tasks by Mission Control priority score
  const sortedTasks = [...tasksForTab].sort((a, b) => {
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
      const response = await fetch(buildApiUrl('/api/tasks/bulk-cleanup'), {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error(`Bulk cleanup failed: ${response.status}`);
      }

      const result = await response.json();
      console.log(`[TaskPanel] Bulk cleanup completed: ${result.cleanedCount} tasks cleaned`);

      // Refresh task list
      await refreshTasks();

    } catch (error) {
      console.error('[TaskPanel] Bulk cleanup error:', error);
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
      const response = await fetch(buildApiUrl('/api/tasks/bulk-cleanup'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskIds }),
      });

      if (!response.ok) throw new Error(`Bulk cleanup failed: ${response.status}`);

      const result = await response.json();
      console.log(`[TaskPanel] Bulk cleanup: ${result.cleanedCount} tasks cleaned`);

      setSelectedTaskIds(new Set());
      await refreshTasks();

    } catch (error) {
      console.error('[TaskPanel] Bulk cleanup error:', error);
      alert('정리 중 오류가 발생했습니다. 다시 시도해주세요.');
    } finally {
      setIsBulkClearing(false);
    }
  };

  return (
    <div className="h-full flex flex-col bg-zinc-900 border-r border-zinc-800 overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-zinc-800">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <ListTodo className="w-5 h-5 text-teal-500" />
            <h2 className="text-lg font-semibold text-zinc-100">Tasks</h2>
          </div>
          <Button
            variant="default"
            size="sm"
            className="bg-teal-500 hover:bg-teal-600 text-white"
            onClick={() => selectTask(null)}
          >
            <Plus className="w-4 h-4 mr-1" />
            New Task
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="flex-1 flex flex-col">
        <div className="px-4 pt-3 pb-2">
          <TabsList className="grid w-full grid-cols-3 bg-zinc-950/50 border border-zinc-800">
            <TabsTrigger
              value="active"
              className="data-[state=active]:bg-teal-500/20 data-[state=active]:text-teal-500 text-zinc-400"
            >
              Active ({getTasksByTab('active').length})
            </TabsTrigger>
            <TabsTrigger
              value="queued"
              className="data-[state=active]:bg-teal-500/20 data-[state=active]:text-teal-500 text-zinc-400"
            >
              Queued ({getTasksByTab('queued').length})
            </TabsTrigger>
            <TabsTrigger
              value="completed"
              className="data-[state=active]:bg-teal-500/20 data-[state=active]:text-teal-500 text-zinc-400"
            >
              Completed ({getTasksByTab('completed').length})
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Bulk Actions - Only in Completed Tab */}
        {activeTab === 'completed' && selectedTaskIds.size > 0 && (
          <div className="px-4 py-2 border-b border-zinc-800 bg-zinc-950/30">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={handleSelectAll}>
                  Select All
                </Button>
                <Button variant="ghost" size="sm" onClick={handleClearSelection}>
                  Clear
                </Button>
              </div>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleBulkDeleteSelected}
                disabled={selectedTaskIds.size === 0 || isBulkClearing}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete ({selectedTaskIds.size})
              </Button>
            </div>
          </div>
        )}

        {/* Task List Content */}
        <TabsContent value={activeTab} className="flex-1 mt-0 overflow-hidden">
          <ScrollArea className="h-full">
            {/* Dashboard Widgets - Only in Active Tab */}
            {activeTab === 'active' && (
              <div className="pt-2">
                <DashboardWidgets />
              </div>
            )}

            <div className="p-2 space-y-1">
              {sortedTasks.length === 0 ? (
                <div className="p-8 text-center">
                  <p className="text-sm text-muted-foreground">No {activeTab} tasks</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {activeTab === 'active' && 'Create or queue a task to get started'}
                    {activeTab === 'queued' && 'Queue a task to see it here'}
                    {activeTab === 'completed' && 'Completed tasks will appear here'}
                  </p>
                </div>
              ) : (
                sortedTasks.map((task) => (
                  <TaskListItem
                    key={task.id}
                    task={task}
                    isSelected={selectedTaskId === task.id}
                    onClick={() => selectTask(task.id)}
                    showCheckbox={activeTab === 'completed'}
                    isChecked={selectedTaskIds.has(task.id)}
                    onCheckChange={(checked) => handleSelectTask(task.id, checked)}
                  />
                ))
              )}
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>

      <Separator className="bg-zinc-800" />

      {/* Footer Stats */}
      <div className="p-3 border-t border-zinc-800">
        <div className="text-xs text-zinc-400">
          {activeTab === 'active' && `${tasksForTab.length} active task${tasksForTab.length !== 1 ? 's' : ''}`}
          {activeTab === 'queued' && `${tasksForTab.length} task${tasksForTab.length !== 1 ? 's' : ''} in queue`}
          {activeTab === 'completed' && `${tasksForTab.length} completed task${tasksForTab.length !== 1 ? 's' : ''}`}
        </div>
      </div>
    </div>
  );
}
