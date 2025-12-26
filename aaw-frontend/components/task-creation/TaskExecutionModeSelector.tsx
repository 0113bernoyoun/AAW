'use client';

import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Clock, Zap } from 'lucide-react';

interface TaskExecutionModeSelectorProps {
  value: 'QUEUED' | 'DIRECT';
  onChange: (value: 'QUEUED' | 'DIRECT') => void;
}

export default function TaskExecutionModeSelector({ value, onChange }: TaskExecutionModeSelectorProps) {
  return (
    <div className="space-y-3">
      <Label className="text-sm font-medium">Execution Mode</Label>
      <RadioGroup value={value} onValueChange={onChange} className="gap-3">
        {/* QUEUED Mode */}
        <label
          htmlFor="mode-queued"
          className={`flex items-start gap-3 p-4 rounded-lg border-2 cursor-pointer transition-all ${
            value === 'QUEUED'
              ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30'
              : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
          }`}
        >
          <RadioGroupItem value="QUEUED" id="mode-queued" className="mt-1" />
          <div className="flex-1 space-y-1">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <span className="font-semibold text-sm">QUEUED - Priority Queue</span>
              <span className="text-xs text-blue-600 dark:text-blue-400 font-medium">[Recommended]</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Task joins queue, respects priority order. Ensures sequential execution and prevents overload.
            </p>
          </div>
        </label>

        {/* DIRECT Mode */}
        <label
          htmlFor="mode-direct"
          className={`flex items-start gap-3 p-4 rounded-lg border-2 cursor-pointer transition-all ${
            value === 'DIRECT'
              ? 'border-orange-500 bg-orange-50 dark:bg-orange-950/30'
              : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
          }`}
        >
          <RadioGroupItem value="DIRECT" id="mode-direct" className="mt-1" />
          <div className="flex-1 space-y-1">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-orange-600 dark:text-orange-400" />
              <span className="font-semibold text-sm">DIRECT - Immediate Execution</span>
              <span className="text-xs text-orange-600 dark:text-orange-400 font-medium">[Advanced]</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Bypasses queue, runs immediately. Use only for critical urgent tasks.
            </p>
          </div>
        </label>
      </RadioGroup>
    </div>
  );
}
