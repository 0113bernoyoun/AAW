'use client';

import { useState } from 'react';
import { PlayCircle, List } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
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
  const [executionMode] = useState<'QUEUED' | 'DIRECT'>('QUEUED');
  const [priority] = useState(50);
  const [sessionMode, setSessionMode] = useState<'PERSIST' | 'NEW'>('PERSIST');
  const [skipPermissions, setSkipPermissions] = useState(false);

  // UI State
  const [showUrgentDialog, setShowUrgentDialog] = useState(false);
  const [showBulkCreator, setShowBulkCreator] = useState(false);

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

  return (
    <>
      <div className="space-y-6">
        {/* Script / Prompt Section */}
        <div className="space-y-3">
          <Label htmlFor="script-content" className="text-sm font-medium text-mc-text-primary">
            Script / Prompt
          </Label>
          <div className="relative flex bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
            {/* Line Numbers */}
            <div className="flex flex-col bg-zinc-950 border-r border-zinc-800 px-3 py-3 text-xs text-zinc-500 select-none font-mono">
              {Array.from({ length: Math.max(6, scriptContent.split('\n').length) }, (_, i) => (
                <span key={i + 1} className="leading-6 text-right w-4">{i + 1}</span>
              ))}
            </div>
            {/* Textarea */}
            <Textarea
              id="script-content"
              placeholder="Enter Claude Code script or prompt here..."
              value={scriptContent}
              onChange={(e) => setScriptContent(e.target.value)}
              rows={6}
              className="flex-1 border-0 bg-transparent font-mono text-sm resize-none focus-visible:ring-0 focus-visible:ring-offset-0 leading-6 py-3 text-mc-text-primary placeholder:text-mc-text-muted"
            />
          </div>
        </div>

        {/* Session Mode Section */}
        <div className="space-y-3">
          <Label className="text-sm font-medium text-mc-text-primary">
            Session Mode <span className="text-mc-text-muted font-normal">(New/Persist)</span>
          </Label>
          <p className="text-xs text-mc-text-muted">
            Enter your Claude Code script or name or have here...
          </p>
          <div className="flex items-center justify-between p-3 rounded-lg bg-mc-bg-primary border border-mc-border">
            <span className="text-sm text-mc-text-primary">
              {sessionMode === 'PERSIST' ? 'Persist Session' : 'New Session'}
            </span>
            <Switch
              checked={sessionMode === 'PERSIST'}
              onCheckedChange={(checked) => setSessionMode(checked ? 'PERSIST' : 'NEW')}
            />
          </div>
        </div>

        {/* Skip Permissions Section */}
        <div className="space-y-3">
          <Label className="text-sm font-medium text-mc-text-primary">
            Skip Permissions <span className="text-orange-500 font-normal">(Danger Mode)</span>
          </Label>
          <p className="text-xs text-mc-text-muted">
            Describe what you want Claude Code to be specific for best results.
          </p>
          <div className="flex items-center justify-between p-3 rounded-lg bg-mc-bg-primary border border-mc-border">
            <span className="text-sm text-mc-text-primary">
              {skipPermissions ? 'Enabled' : 'Disabled'}
            </span>
            <Switch
              checked={skipPermissions}
              onCheckedChange={setSkipPermissions}
            />
          </div>
        </div>

        {/* Danger Warning */}
        <InlineWarning
          severity="warning"
          title="Warning"
          description="Dangerously Skip Permissions allows the commands and transformations commands to task."
          visible={skipPermissions}
          className="animate-in fade-in slide-in-from-top-2 duration-300"
        />

        {/* System Status Warning */}
        {!isSystemReady && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-mc-accent-yellow/10 border border-mc-accent-yellow/30">
            <AlertTriangle className="w-4 h-4 text-mc-accent-yellow" />
            <span className="text-xs text-mc-accent-yellow">
              System not ready - Runner must be connected
            </span>
          </div>
        )}

        {/* Start Task Button */}
        <Button
          onClick={handleSubmit}
          disabled={isStarting || !isSystemReady || !scriptContent.trim()}
          className="w-full bg-mc-accent-blue hover:bg-mc-accent-blue/90 text-white"
        >
          <PlayCircle className="w-4 h-4 mr-2" />
          {isStarting ? 'Starting...' : 'Start Task'}
        </Button>
      </div>

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
