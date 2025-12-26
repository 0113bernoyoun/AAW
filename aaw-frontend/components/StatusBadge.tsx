import { TaskStatus } from '@/types/task';

interface StatusBadgeProps {
  status: TaskStatus | string;
}

export default function StatusBadge({ status }: StatusBadgeProps) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'PENDING':
        return 'bg-gray-500 text-white';
      case 'QUEUED':
        return 'bg-gray-500 text-white';
      case 'RUNNING':
        return 'bg-blue-500 text-white';
      case 'PAUSED':
        return 'bg-yellow-500 text-black';
      case 'PAUSED_BY_LIMIT':
        return 'bg-yellow-600 text-white';
      case 'RATE_LIMITED':
        return 'bg-red-500 text-white';
      case 'COMPLETED':
        return 'bg-green-500 text-white';
      case 'FAILED':
        return 'bg-red-700 text-white';
      case 'INTERRUPTED':
        return 'bg-orange-500 text-white';
      case 'CANCELLED':
        return 'bg-gray-600 text-white';
      case 'CANCELLING':
        return 'bg-yellow-500 text-white';
      case 'KILLED':
        return 'bg-red-700 text-white';
      default:
        return 'bg-gray-400 text-white';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'RATE_LIMITED':
      case 'PAUSED':
      case 'PAUSED_BY_LIMIT':
        return '⚠️';
      case 'RUNNING':
        return '🔄';
      case 'COMPLETED':
        return '✅';
      case 'FAILED':
      case 'KILLED':
        return '❌';
      case 'CANCELLING':
        return '⏳';
      case 'CANCELLED':
        return '🚫';
      case 'INTERRUPTED':
        return '⚡';
      case 'QUEUED':
      case 'PENDING':
        return '📋';
      default:
        return '';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'RATE_LIMITED':
        return 'RATE LIMITED (Detected - PoC continues execution)';
      case 'PAUSED_BY_LIMIT':
        return 'PAUSED BY LIMIT';
      case 'CANCELLING':
        return 'CANCELLING...';
      default:
        return status.replace('_', ' ');
    }
  };

  return (
    <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg font-semibold ${getStatusColor(status)}`}>
      <span>{getStatusIcon(status)}</span>
      <span>{getStatusText(status)}</span>
    </div>
  );
}
