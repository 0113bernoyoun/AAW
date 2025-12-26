'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, List, AlertCircle } from 'lucide-react';
import { useTaskContext } from '@/contexts/TaskContext';
import TaskExecutionModeSelector from './TaskExecutionModeSelector';
import TaskPriorityControl from './TaskPriorityControl';

interface BulkTaskCreatorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function BulkTaskCreator({ open, onOpenChange }: BulkTaskCreatorProps) {
  const { createTask } = useTaskContext();
  const [instructions, setInstructions] = useState('');
  const [sessionMode, setSessionMode] = useState<'PERSIST' | 'NEW'>('PERSIST');
  const [executionMode, setExecutionMode] = useState<'QUEUED' | 'DIRECT'>('QUEUED');
  const [priority, setPriority] = useState(50);
  const [skipPermissions, setSkipPermissions] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Parse instructions into task list
  const parseInstructions = (): string[] => {
    return instructions
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0 && !line.startsWith('#'));
  };

  const taskList = parseInstructions();
  const taskCount = taskList.length;
  const isValid = taskCount >= 1 && taskCount <= 20;

  const handleCreate = async () => {
    if (!isValid) {
      setError('Please enter between 1 and 20 tasks');
      return;
    }

    setIsCreating(true);
    setError(null);

    try {
      // Create tasks sequentially to maintain order
      for (const instruction of taskList) {
        await createTask({
          instruction,
          scriptContent: instruction,
          skipPermissions,
          sessionMode,
          priority,
          executionMode,
        });
      }

      // Success - close dialog and reset
      setInstructions('');
      setError(null);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create tasks');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Bulk Task Creation</DialogTitle>
          <DialogDescription>
            Create multiple tasks at once. Enter one instruction per line. Lines starting with # are comments.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Instructions Input */}
          <div className="space-y-2">
            <Label htmlFor="bulk-instructions">Task Instructions (one per line)</Label>
            <Textarea
              id="bulk-instructions"
              placeholder={`# Example:\nFix login bug\nAdd unit tests\nUpdate documentation\n\n# Enter your tasks here...`}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              rows={8}
              className="font-mono text-sm"
            />
          </div>

          {/* Common Settings */}
          <div className="space-y-4 border-t pt-4">
            <h3 className="text-sm font-semibold">Common Settings (applied to all tasks)</h3>

            {/* Execution Mode */}
            <TaskExecutionModeSelector value={executionMode} onChange={(val) => setExecutionMode(val)} />

            {/* Priority */}
            <TaskPriorityControl value={priority} onChange={setPriority} />

            {/* Session Mode */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Session Mode</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={sessionMode === 'PERSIST' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSessionMode('PERSIST')}
                >
                  PERSIST
                </Button>
                <Button
                  type="button"
                  variant={sessionMode === 'NEW' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSessionMode('NEW')}
                >
                  NEW
                </Button>
              </div>
            </div>

            {/* Skip Permissions */}
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="bulk-skip-permissions"
                checked={skipPermissions}
                onChange={(e) => setSkipPermissions(e.target.checked)}
                className="rounded"
              />
              <Label htmlFor="bulk-skip-permissions" className="text-sm cursor-pointer">
                Skip Permissions (Danger Mode)
              </Label>
            </div>
          </div>

          {/* Preview */}
          {taskCount > 0 && (
            <Alert className={isValid ? 'border-green-500 bg-green-50 dark:bg-green-950/30' : 'border-red-500 bg-red-50 dark:bg-red-950/30'}>
              <List className="w-4 h-4" />
              <AlertDescription>
                {isValid ? (
                  <span className="text-green-700 dark:text-green-300 font-medium">
                    Preview: {taskCount} task{taskCount > 1 ? 's' : ''} ready to create
                  </span>
                ) : (
                  <span className="text-red-700 dark:text-red-300 font-medium">
                    {taskCount > 20 ? `Too many tasks (${taskCount}/20 max)` : 'Enter at least 1 task'}
                  </span>
                )}
              </AlertDescription>
            </Alert>
          )}

          {/* Error Display */}
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="w-4 h-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isCreating}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={!isValid || isCreating}>
            {isCreating ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Creating {taskCount} tasks...
              </>
            ) : (
              `Create ${taskCount} Task${taskCount > 1 ? 's' : ''}`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
