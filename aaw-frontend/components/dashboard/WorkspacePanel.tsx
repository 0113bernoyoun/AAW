'use client';

import { useTaskContext } from '@/contexts/TaskContext';
import TaskMetadataHeader from '@/components/TaskMetadataHeader';
import LiveTerminal from '@/components/LiveTerminal';
import TaskControlPanel from '@/components/TaskControlPanel';
import TaskRecoveryModal from '@/components/TaskRecoveryModal';
import InlineWarning from '@/components/dashboard/InlineWarning';
import { useCallback, useRef, useState, useEffect } from 'react';
import { Terminal } from '@xterm/xterm';
import { AlertCircle } from 'lucide-react';

export default function WorkspacePanel() {
  const { tasks, selectedTaskId, createTask, isSystemReady, cancelTask, refreshTasks } = useTaskContext();
  const [isStarting, setIsStarting] = useState(false);
  const [showRecoveryModal, setShowRecoveryModal] = useState(false);
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
    <div className="flex-1 flex flex-col h-screen overflow-hidden">
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

          <div className="flex-1 overflow-hidden p-4">
            <div className="bg-[#1e1e1e] rounded-lg p-4 h-full">
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
        <div className="flex-1 flex flex-col">
          <div className="border-b bg-card p-4">
            <h2 className="text-xl font-semibold">Create New Task</h2>
            <p className="text-sm text-muted-foreground">
              Configure and submit a new AI task
            </p>
          </div>

          <div className="flex-1 overflow-auto p-4">
            <div className="max-w-4xl mx-auto space-y-6">
              <TaskControlPanel
                onTaskSubmit={handleTaskSubmit}
                isSystemReady={isSystemReady}
                isStarting={isStarting}
              />

              <div className="bg-card border rounded-lg p-6">
                <h3 className="text-lg font-semibold mb-4">Live Terminal</h3>
                <div className="bg-[#1e1e1e] rounded-lg p-4 h-[400px]">
                  <LiveTerminal onReady={handleTerminalReady} taskId={null} />
                </div>
              </div>

              <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-6">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5" />
                  <div>
                    <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">
                      How Tasks Work
                    </h3>
                    <ul className="list-disc list-inside space-y-1 text-sm text-blue-800 dark:text-blue-200">
                      <li>Tasks are queued and executed based on priority</li>
                      <li>Higher priority (90+) tasks show urgent warnings</li>
                      <li>PERSIST mode shares context between tasks</li>
                      <li>NEW mode provides isolated clean context</li>
                      <li>Skip permissions enables danger mode (use carefully)</li>
                      <li>View all tasks in the sidebar on the left</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
