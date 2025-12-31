'use client';

import { useTaskContext } from '@/contexts/TaskContext';
import TaskMetadataHeader from '@/components/TaskMetadataHeader';
import LiveTerminal from '@/components/LiveTerminal';
import TaskControlPanel from '@/components/TaskControlPanel';
import TaskRecoveryModal from '@/components/TaskRecoveryModal';
import InlineWarning from '@/components/dashboard/InlineWarning';
import { useCallback, useRef, useState, useEffect } from 'react';
import { Terminal } from '@xterm/xterm';
import { List, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import BulkTaskCreator from '@/components/task-creation/BulkTaskCreator';

export default function WorkspacePanel() {
  const { tasks, selectedTaskId, createTask, isSystemReady, cancelTask, refreshTasks } = useTaskContext();
  const [isStarting, setIsStarting] = useState(false);
  const [showRecoveryModal, setShowRecoveryModal] = useState(false);
  const [showBulkCreator, setShowBulkCreator] = useState(false);
  const terminalRef = useRef<Terminal | null>(null);

  const selectedTask = tasks.find(t => t.id === selectedTaskId);

  // Show recovery modal when selected task becomes interrupted
  useEffect(() => {
    if (selectedTask?.status === 'INTERRUPTED') {
      setShowRecoveryModal(true);
    }
  }, [selectedTask?.status]);

  const handleTerminalReady = useCallback((terminal: Terminal) => {
    terminalRef.current = terminal;
  }, []);

  const handleTaskSubmit = async (data: {
    instruction: string;
    scriptContent: string;
    skipPermissions: boolean;
    sessionMode: string;
    priority?: number;
  }) => {
    setIsStarting(true);

    try {
      const task = await createTask(data);

      if (terminalRef.current) {
        terminalRef.current.writeln('');
        terminalRef.current.writeln(`\x1b[32m[Task ${task.id} created - Priority: ${data.priority || 50}, Session: ${data.sessionMode}]\x1b[0m`);
        terminalRef.current.writeln('');
      }
    } catch (error) {
      console.error('Error creating task:', error);
      if (terminalRef.current) {
        terminalRef.current.writeln('\x1b[31mError: Failed to create task\x1b[0m');
      }
    } finally {
      setIsStarting(false);
    }
  };

  const handleRetryCurrent = async () => {
    if (!selectedTask) return;
    // TODO: Implement retry logic when backend endpoint is ready
    console.log('Retry current task:', selectedTask.id);
    await refreshTasks();
  };

  const handleSkipToNext = async () => {
    if (!selectedTask) return;
    await cancelTask(selectedTask.id);
  };

  const handleRestartSession = async () => {
    if (!selectedTask) return;
    // TODO: Implement session restart logic when backend endpoint is ready
    console.log('Restart session for task:', selectedTask.id);
    await refreshTasks();
  };

  return (
    <div className="h-full flex flex-col bg-zinc-950 overflow-hidden">
      {selectedTask ? (
        <>
          <TaskMetadataHeader task={selectedTask} />

          {/* Warning for tasks running in danger mode */}
          {selectedTask.skipPermissions && (
            <div className="px-4 pt-2">
              <InlineWarning
                severity="warning"
                title="Task Running in Danger Mode"
                description="This task was created with --dangerously-skip-permissions. Monitor execution carefully."
                visible={true}
              />
            </div>
          )}

          {/* Terminal Area - flex-grow for selected task view */}
          <div className="flex-1 overflow-hidden p-4">
            <div className="bg-zinc-900 rounded-lg p-4 h-full border border-zinc-800">
              <LiveTerminal onReady={handleTerminalReady} taskId={selectedTaskId} />
            </div>
          </div>

          {/* Recovery Modal */}
          <TaskRecoveryModal
            task={selectedTask}
            open={showRecoveryModal}
            onOpenChange={setShowRecoveryModal}
            onRetryCurrent={handleRetryCurrent}
            onSkipToNext={handleSkipToNext}
            onRestartSession={handleRestartSession}
          />
        </>
      ) : (
        <div className="h-full flex flex-col overflow-hidden">
          {/* Header */}
          <div className="border-b border-zinc-800 bg-zinc-950 p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-zinc-100">Create New Task</h2>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowBulkCreator(true)}
                disabled={!isSystemReady}
                className="bg-zinc-900 border-zinc-800 text-zinc-100 hover:bg-zinc-800"
              >
                <List className="w-4 h-4 mr-2" />
                Bulk Create
              </Button>
            </div>
          </div>

          {/* Editor Area - flex-grow (top) */}
          <div className="flex-1 overflow-auto p-6">
            <div className="max-w-3xl space-y-6">
              {/* Task Control Panel */}
              <TaskControlPanel
                onTaskSubmit={handleTaskSubmit}
                isSystemReady={isSystemReady}
                isStarting={isStarting}
              />
            </div>
          </div>

          {/* Terminal Area - fixed height (bottom) */}
          <div className="h-[200px] border-t border-zinc-800 bg-zinc-950 flex-shrink-0">
            <div className="p-4 h-full flex flex-col">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-zinc-100">Live Terminal</h3>
                <Star className="w-4 h-4 text-zinc-500 hover:text-amber-500 cursor-pointer transition-colors" />
              </div>
              <div className="bg-zinc-900 rounded-lg p-3 flex-1 border border-zinc-800">
                <LiveTerminal onReady={handleTerminalReady} taskId={null} />
              </div>
            </div>
          </div>

          {/* Bulk Task Creator Modal */}
          <BulkTaskCreator
            open={showBulkCreator}
            onOpenChange={setShowBulkCreator}
          />
        </div>
      )}
    </div>
  );
}
