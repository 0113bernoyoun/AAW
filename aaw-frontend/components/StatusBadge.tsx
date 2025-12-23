interface StatusBadgeProps {
  status: string;
}

export default function StatusBadge({ status }: StatusBadgeProps) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'PENDING':
        return 'bg-gray-500 text-white';
      case 'RUNNING':
        return 'bg-blue-500 text-white';
      case 'PAUSED':
        return 'bg-yellow-500 text-black';
      case 'RATE_LIMITED':
        return 'bg-red-500 text-white';
      case 'COMPLETED':
        return 'bg-green-500 text-white';
      case 'FAILED':
        return 'bg-red-700 text-white';
      default:
        return 'bg-gray-400 text-white';
    }
  };

  const getStatusIcon = (status: string) => {
    if (status === 'RATE_LIMITED' || status === 'PAUSED') {
      return '⚠️';
    }
    if (status === 'RUNNING') {
      return '🔄';
    }
    if (status === 'COMPLETED') {
      return '✅';
    }
    if (status === 'FAILED') {
      return '❌';
    }
    return '';
  };

  const getStatusText = (status: string) => {
    if (status === 'RATE_LIMITED') {
      return 'RATE LIMITED (Detected - PoC continues execution)';
    }
    return status.replace('_', ' ');
  };

  return (
    <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg font-semibold ${getStatusColor(status)}`}>
      <span>{getStatusIcon(status)}</span>
      <span>{getStatusText(status)}</span>
    </div>
  );
}
