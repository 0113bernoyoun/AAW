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
    bgClass: 'bg-mc-accent-blue/10 border-mc-accent-blue/30',
    iconClass: 'text-mc-accent-blue',
    textClass: 'text-mc-accent-blue',
  },
  warning: {
    icon: AlertTriangle,
    bgClass: 'bg-amber-500/15 border-amber-500/40',
    iconClass: 'text-amber-500',
    textClass: 'text-amber-100',
  },
  danger: {
    icon: AlertTriangle,
    bgClass: 'bg-gradient-to-r from-orange-500/20 to-red-500/20 border-orange-500/40',
    iconClass: 'text-orange-500',
    textClass: 'text-orange-100',
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
          <p className={cn('text-xs opacity-80', config.textClass)}>{description}</p>
        </div>
      </div>
    </div>
  );
}
