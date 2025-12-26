'use client';

import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';

interface TaskPriorityControlProps {
  value: number;
  onChange: (value: number) => void;
}

const getPriorityLabel = (priority: number): string => {
  if (priority <= 20) return 'LOW';
  if (priority <= 50) return 'NORMAL';
  if (priority <= 80) return 'HIGH';
  return 'URGENT';
};

const getPriorityColor = (priority: number): string => {
  if (priority <= 20) return 'text-blue-600 dark:text-blue-400';
  if (priority <= 50) return 'text-green-600 dark:text-green-400';
  if (priority <= 80) return 'text-orange-600 dark:text-orange-400';
  return 'text-red-600 dark:text-red-400';
};

const getSliderGradient = (priority: number): string => {
  // Gradient from blue (0) → green (30) → yellow (60) → orange (80) → red (100)
  const percentage = priority;
  return `linear-gradient(to right,
    hsl(220, 90%, 56%) 0%,
    hsl(142, 76%, 36%) 30%,
    hsl(45, 93%, 47%) 60%,
    hsl(25, 95%, 53%) 80%,
    hsl(0, 84%, 60%) 100%)`;
};

export default function TaskPriorityControl({ value, onChange }: TaskPriorityControlProps) {
  const priorityLabel = getPriorityLabel(value);
  const priorityColor = getPriorityColor(value);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">Priority</Label>
        <div className="flex items-center gap-2">
          <span className="text-2xl font-bold">{value}</span>
          <span className={`text-sm font-semibold ${priorityColor}`}>{priorityLabel}</span>
        </div>
      </div>

      {/* Gradient Slider */}
      <div className="relative">
        <Slider
          value={[value]}
          onValueChange={(vals) => onChange(vals[0])}
          min={0}
          max={100}
          step={1}
          className="w-full"
        />
        <div
          className="absolute top-0 left-0 w-full h-2 rounded-full -z-10 opacity-30"
          style={{ background: getSliderGradient(value) }}
        />
      </div>

      {/* Preset Buttons */}
      <div className="grid grid-cols-4 gap-2">
        <Button
          type="button"
          variant={value === 10 ? 'default' : 'outline'}
          size="sm"
          onClick={() => onChange(10)}
          className="text-xs"
        >
          Low: 10
        </Button>
        <Button
          type="button"
          variant={value === 50 ? 'default' : 'outline'}
          size="sm"
          onClick={() => onChange(50)}
          className="text-xs"
        >
          Normal: 50
        </Button>
        <Button
          type="button"
          variant={value === 70 ? 'default' : 'outline'}
          size="sm"
          onClick={() => onChange(70)}
          className="text-xs"
        >
          High: 70
        </Button>
        <Button
          type="button"
          variant={value === 90 ? 'default' : 'outline'}
          size="sm"
          onClick={() => onChange(90)}
          className="text-xs"
        >
          Urgent: 90
        </Button>
      </div>
    </div>
  );
}
