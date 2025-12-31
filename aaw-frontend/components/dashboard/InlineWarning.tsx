'use client';

import { AlertTriangle, AlertCircle, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

type WarningSeverity = 'info' | 'warning' | 'danger';

interface InlineWarningProps {
  severity: WarningSeverity;
  title: string;
  description: string;
  visible: boolean;
  className?: string;
}

const severityConfig = {
  info: {
    icon: Info,
    bgClass: 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800',
    iconClass: 'text-blue-600 dark:text-blue-400',
    textClass: 'text-blue-900 dark:text-blue-100',
  },
  warning: {
    icon: AlertCircle,
    bgClass: 'bg-yellow-50 dark:bg-yellow-950/30 border-yellow-200 dark:border-yellow-800',
    iconClass: 'text-yellow-600 dark:text-yellow-400',
    textClass: 'text-yellow-900 dark:text-yellow-100',
  },
  danger: {
    icon: AlertTriangle,
    bgClass: 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800',
    iconClass: 'text-red-600 dark:text-red-400',
    textClass: 'text-red-900 dark:text-red-100',
  },
};

export default function InlineWarning({
  severity,
  title,
  description,
  visible,
  className,
}: InlineWarningProps) {
  if (!visible) return null;

  const config = severityConfig[severity];
  const Icon = config.icon;

  return (
    <div
      className={cn(
        'rounded-lg border p-4 transition-all duration-300',
        config.bgClass,
        className
      )}
    >
      <div className="flex items-start gap-3">
        <Icon className={cn('w-5 h-5 mt-0.5 flex-shrink-0', config.iconClass)} />
        <div className="flex-1 min-w-0">
          <h4 className={cn('font-semibold text-sm mb-1', config.textClass)}>
            {title}
          </h4>
          <p className={cn('text-xs', config.textClass)}>{description}</p>
        </div>
      </div>
    </div>
  );
}
