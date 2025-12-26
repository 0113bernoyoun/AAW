'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Task } from '@/types/task';
import { RefreshCcw, SkipForward, RotateCcw, AlertCircle, XCircle, Info, CheckCircle2, Clock, Loader2 } from 'lucide-react';

interface TaskRecoveryModalProps {
  task: Task;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRetryCurrent: () => void;
  onSkipToNext: () => void;
  onRestartSession: () => void;
  autoRetryCountdown?: number | null;
}

export default function TaskRecoveryModal({
  task,
  open,
  onOpenChange,
  onRetryCurrent,
  onSkipToNext,
  onRestartSession,
  autoRetryCountdown = null,
}: TaskRecoveryModalProps) {
  const handleRetryCurrent = () => {
    onRetryCurrent();
    onOpenChange(false);
  };

  const handleSkipToNext = () => {
    onSkipToNext();
    onOpenChange(false);
  };

  const handleRestartSession = () => {
    onRestartSession();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] backdrop-blur-sm">
        <DialogHeader className="space-y-3">
          <DialogTitle className="flex items-center gap-3 text-destructive">
            <div className="p-2 rounded-full bg-destructive/10">
              <XCircle className="w-5 h-5" />
            </div>
            Task Interrupted
            {task.retryCount > 0 && (
              <Badge variant={task.retryCount >= 2 ? 'destructive' : 'outline'} className="ml-auto">
                Retry #{task.retryCount}
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription className="text-base">
            Task #{task.id} encountered an issue and requires manual intervention
          </DialogDescription>
        </DialogHeader>

        <Separator />

        <div className="space-y-5">
          {/* Error Display */}
          <Alert variant="destructive" className="border-destructive/50">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <div className="space-y-2">
                <p className="font-semibold">Failure Reason:</p>
                <pre className="text-xs font-mono bg-destructive/10 p-2 rounded overflow-x-auto">
                  {task.failureReason || 'Unknown error'}
                </pre>
              </div>
            </AlertDescription>
          </Alert>

          {/* Task Details */}
          <div className="bg-muted/50 rounded-lg p-4 space-y-3 border">
            <div className="flex items-center justify-between text-sm">
              <span className="font-semibold">Task ID:</span>
              <span className="font-mono">#{task.id}</span>
            </div>
            <Separator />
            <div className="space-y-2">
              <span className="text-sm font-semibold">Instruction:</span>
              <pre className="text-xs font-mono bg-background p-3 rounded border overflow-x-auto whitespace-pre-wrap break-words">
                {task.instruction}
              </pre>
            </div>
          </div>

          {/* Auto-Retry Countdown */}
          {autoRetryCountdown !== null && autoRetryCountdown > 0 && (
            <Alert className="border-blue-500 bg-blue-50 dark:bg-blue-950 dark:border-blue-700">
              <Loader2 className="h-4 w-4 text-blue-600 dark:text-blue-400 animate-spin" />
              <AlertDescription>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-blue-900 dark:text-blue-100">
                    Auto-retry in {autoRetryCountdown} second{autoRetryCountdown !== 1 ? 's' : ''}...
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleRetryCurrent}
                    className="ml-3 border-blue-500 text-blue-700 hover:bg-blue-100 dark:hover:bg-blue-900"
                  >
                    Retry Now
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          )}

          {/* Recovery Options */}
          <div className="space-y-3">
            <p className="text-sm font-semibold flex items-center gap-2">
              <RefreshCcw className="w-4 h-4" />
              Recovery Options:
            </p>

            {/* Primary Action: Retry */}
            <Button
              variant="default"
              className="w-full justify-start h-auto py-3"
              onClick={handleRetryCurrent}
            >
              <RefreshCcw className="w-4 h-4 mr-3" />
              <div className="flex flex-col items-start flex-1">
                <span className="font-semibold">Retry Current Task</span>
                <span className="text-xs opacity-80">
                  Attempt #{task.retryCount + 1}
                </span>
              </div>
            </Button>

            {/* Secondary Actions: Grid Layout */}
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                className="h-auto py-3 flex-col items-start"
                onClick={handleSkipToNext}
              >
                <SkipForward className="w-4 h-4 mb-1" />
                <span className="text-sm font-semibold">Skip Task</span>
                <span className="text-xs text-muted-foreground">
                  Mark as failed
                </span>
              </Button>

              <Button
                variant="outline"
                className="h-auto py-3 flex-col items-start text-orange-600 hover:text-orange-700 hover:bg-orange-50 dark:hover:bg-orange-950"
                onClick={handleRestartSession}
              >
                <RotateCcw className="w-4 h-4 mb-1" />
                <span className="text-sm font-semibold">Restart Session</span>
                <span className="text-xs text-muted-foreground">
                  Clean state
                </span>
              </Button>
            </div>
          </div>

          {/* Recovery History */}
          {task.recoveryHistory && task.recoveryHistory.length > 0 && (
            <>
              <Separator />
              <div className="space-y-3">
                <p className="text-sm font-semibold flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  Recovery History:
                </p>
                <ScrollArea className="max-h-48 rounded-lg border bg-muted/30 p-3">
                  <div className="space-y-2">
                    {task.recoveryHistory.map((attempt, index) => (
                      <div
                        key={index}
                        className={`flex items-start gap-3 p-2 rounded border-l-2 ${
                          attempt.result === 'SUCCESS'
                            ? 'border-l-green-500 bg-green-50 dark:bg-green-950'
                            : 'border-l-red-500 bg-red-50 dark:bg-red-950'
                        }`}
                      >
                        {attempt.result === 'SUCCESS' ? (
                          <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                        ) : (
                          <XCircle className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                        )}
                        <div className="flex-1 min-w-0 text-xs">
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <span className={`font-semibold ${
                              attempt.result === 'SUCCESS'
                                ? 'text-green-900 dark:text-green-100'
                                : 'text-red-900 dark:text-red-100'
                            }`}>
                              Attempt #{attempt.attemptNumber}: {attempt.action}
                            </span>
                            <Badge
                              variant={attempt.result === 'SUCCESS' ? 'secondary' : 'destructive'}
                              className="text-xs"
                            >
                              {attempt.result}
                            </Badge>
                          </div>
                          <p className="text-muted-foreground">
                            {new Date(attempt.timestamp).toLocaleString()}
                          </p>
                          {attempt.errorMessage && (
                            <p className="text-red-600 dark:text-red-400 mt-1 font-mono">
                              Error: {attempt.errorMessage}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            </>
          )}

          {/* Help Text */}
          <Alert className="border-blue-200 bg-blue-50 dark:bg-blue-950 dark:border-blue-800">
            <Info className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            <AlertDescription className="text-xs text-blue-900 dark:text-blue-100">
              <strong>Tip:</strong> If retries continue to fail, check:
              <ul className="list-disc list-inside mt-1 space-y-0.5">
                <li>Runner logs for detailed error messages</li>
                <li>Task configuration and parameters</li>
                <li>Rate limit status and API quotas</li>
              </ul>
            </AlertDescription>
          </Alert>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
