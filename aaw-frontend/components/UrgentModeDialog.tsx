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
import { AlertTriangle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface UrgentModeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  priority: number;
  instruction: string;
}

export default function UrgentModeDialog({
  open,
  onOpenChange,
  onConfirm,
  priority,
  instruction,
}: UrgentModeDialogProps) {
  const handleConfirm = () => {
    onConfirm();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-orange-600">
            <AlertTriangle className="w-5 h-5" />
            Urgent Mode Confirmation
          </DialogTitle>
          <DialogDescription>
            This task will be executed with high priority ({priority})
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Urgent priority tasks (90+) will interrupt or queue-jump normal tasks.
            </AlertDescription>
          </Alert>

          <div className="bg-muted rounded-lg p-4">
            <p className="text-sm font-semibold mb-2">Task Details:</p>
            <p className="text-sm text-muted-foreground">
              Priority: <span className="font-bold text-orange-600">{priority}</span>
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              Instruction: <span className="font-mono text-xs">{instruction.substring(0, 100)}...</span>
            </p>
          </div>

          <div className="text-sm text-muted-foreground space-y-1">
            <p className="font-semibold">What this means:</p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>This task will be placed ahead of lower priority tasks</li>
              <li>May cause delays for other queued tasks</li>
              <li>Use sparingly for truly urgent operations</li>
            </ul>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleConfirm}>
            Execute Now
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
