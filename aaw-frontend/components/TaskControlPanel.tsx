'use client';

import { useState } from 'react';
import { PlayCircle, List, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import TaskExecutionModeSelector from './task-creation/TaskExecutionModeSelector';
import TaskPriorityControl from './task-creation/TaskPriorityControl';
import BulkTaskCreator from './task-creation/BulkTaskCreator';
import UrgentModeDialog from './UrgentModeDialog';
import InlineWarning from './dashboard/InlineWarning';
import { AlertTriangle } from 'lucide-react';

interface TaskControlPanelProps {
  onTaskSubmit: (data: {
    instruction: string;
    scriptContent: string;
    skipPermissions: boolean;
    sessionMode: string;
    priority?: number;
    executionMode?: string;
  }) => void;
  isSystemReady: boolean;
  isStarting: boolean;
}

export default function TaskControlPanel({
  onTaskSubmit,
  isSystemReady,
  isStarting,
}: TaskControlPanelProps) {
  // Form State
  const [scriptContent, setScriptContent] = useState('');
  const [executionMode, setExecutionMode] = useState<'QUEUED' | 'DIRECT'>('QUEUED');
  const [priority, setPriority] = useState(50);
  const [sessionMode, setSessionMode] = useState<'PERSIST' | 'NEW'>('PERSIST');
  const [skipPermissions, setSkipPermissions] = useState(false);

  // UI State
  const [showUrgentDialog, setShowUrgentDialog] = useState(false);
  const [showBulkCreator, setShowBulkCreator] = useState(false);

  const MATH_TEST_SCRIPT = 'Create a Python script that calculates factorial of 10 and prints the result';

  const handleSubmit = () => {
    if (!scriptContent.trim()) {
      alert('Please enter a script or prompt');
      return;
    }

    // Check for urgent priority confirmation
    if (priority >= 90) {
      setShowUrgentDialog(true);
      return;
    }

    executeSubmit();
  };

  const executeSubmit = () => {
    onTaskSubmit({
      instruction: scriptContent.substring(0, 100),
      scriptContent,
      skipPermissions,
      sessionMode,
      priority,
      executionMode,
    });
    setShowUrgentDialog(false);
  };

  const loadMathTest = () => {
    setScriptContent(MATH_TEST_SCRIPT);
    setExecutionMode('QUEUED');
    setPriority(50);
    setSessionMode('NEW');
    setSkipPermissions(true);
  };

  const handleReset = () => {
    setScriptContent('');
    setExecutionMode('QUEUED');
    setPriority(50);
    setSessionMode('PERSIST');
    setSkipPermissions(false);
  };

  return (
    <>
      <Card className="w-full">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Create Task</CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowBulkCreator(true)}
              disabled={!isSystemReady}
            >
              <List className="w-4 h-4 mr-2" />
              Bulk Create
            </Button>
          </div>
        </CardHeader>

        <CardContent>
          <Tabs defaultValue="script" className="w-full">
            <TabsList className="grid w-full grid-cols-3 mb-6">
              <TabsTrigger value="script">Script</TabsTrigger>
              <TabsTrigger value="execution">Execution</TabsTrigger>
              <TabsTrigger value="advanced">Advanced</TabsTrigger>
            </TabsList>

            {/* Script Tab */}
            <TabsContent value="script" className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="script-content">Script / Prompt</Label>
                <Textarea
                  id="script-content"
                  placeholder="Enter your Claude Code script or prompt here..."
                  value={scriptContent}
                  onChange={(e) => setScriptContent(e.target.value)}
                  rows={10}
                  className="font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  Describe what you want Claude Code to do. Be specific for best results.
                </p>
              </div>
            </TabsContent>

            {/* Execution Tab */}
            <TabsContent value="execution" className="space-y-6">
              {/* Execution Mode Selector */}
              <TaskExecutionModeSelector
                value={executionMode}
                onChange={(val) => setExecutionMode(val)}
              />

              {/* Priority Control */}
              <TaskPriorityControl
                value={priority}
                onChange={setPriority}
              />
            </TabsContent>

            {/* Advanced Tab */}
            <TabsContent value="advanced" className="space-y-6">
              {/* Session Mode */}
              <div className="space-y-3">
                <Label className="text-sm font-medium">Session Mode</Label>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer p-3 rounded-lg border hover:bg-accent transition-colors">
                    <input
                      type="radio"
                      name="sessionMode"
                      value="PERSIST"
                      checked={sessionMode === 'PERSIST'}
                      onChange={(e) => setSessionMode(e.target.value as 'PERSIST')}
                      className="w-4 h-4"
                    />
                    <div>
                      <div className="text-sm font-medium">Persist</div>
                      <div className="text-xs text-muted-foreground">Use shared context across tasks</div>
                    </div>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer p-3 rounded-lg border hover:bg-accent transition-colors">
                    <input
                      type="radio"
                      name="sessionMode"
                      value="NEW"
                      checked={sessionMode === 'NEW'}
                      onChange={(e) => setSessionMode(e.target.value as 'NEW')}
                      className="w-4 h-4"
                    />
                    <div>
                      <div className="text-sm font-medium">New</div>
                      <div className="text-xs text-muted-foreground">Isolated clean context for each task</div>
                    </div>
                  </label>
                </div>
              </div>

              {/* Skip Permissions */}
              <div className="space-y-3">
                <Label className="text-sm font-medium">Safety Settings</Label>
                <label className="flex items-start gap-3 cursor-pointer p-3 rounded-lg border hover:bg-accent transition-colors">
                  <input
                    type="checkbox"
                    checked={skipPermissions}
                    onChange={(e) => setSkipPermissions(e.target.checked)}
                    className="w-5 h-5 mt-0.5 rounded"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <AlertTriangle className="w-4 h-4 text-red-600" />
                      <span className="text-sm font-medium">Skip Permissions (Danger Mode)</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Claude will execute commands without asking for confirmation. Use with caution.
                    </p>
                  </div>
                </label>
              </div>

              {/* Danger Warning */}
              <InlineWarning
                severity="danger"
                title="Danger Mode Active"
                description="Skip Permissions allows Claude to execute commands, modify files, and make system-level changes without confirmation. Only use for trusted scripts."
                visible={skipPermissions}
              />
            </TabsContent>
          </Tabs>
        </CardContent>

        <CardFooter className="flex gap-3">
          <Button
            onClick={loadMathTest}
            variant="outline"
            disabled={isStarting || !isSystemReady}
          >
            Load Test
          </Button>

          <Button
            onClick={handleReset}
            variant="outline"
            disabled={isStarting}
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Reset
          </Button>

          <Button
            onClick={handleSubmit}
            disabled={isStarting || !isSystemReady || !scriptContent.trim()}
            className="ml-auto"
          >
            <PlayCircle className="w-4 h-4 mr-2" />
            {isStarting ? 'Starting...' : 'Start Task'}
          </Button>
        </CardFooter>

        {/* System Status */}
        {!isSystemReady && (
          <div className="px-6 pb-6">
            <Alert>
              <AlertTriangle className="w-4 h-4" />
              <AlertDescription className="text-xs">
                System not ready - Runner must be connected to start tasks
              </AlertDescription>
            </Alert>
          </div>
        )}
      </Card>

      {/* Urgent Mode Dialog */}
      <UrgentModeDialog
        open={showUrgentDialog}
        onOpenChange={setShowUrgentDialog}
        onConfirm={executeSubmit}
        priority={priority}
        instruction={scriptContent}
      />

      {/* Bulk Task Creator */}
      <BulkTaskCreator
        open={showBulkCreator}
        onOpenChange={setShowBulkCreator}
      />
    </>
  );
}
