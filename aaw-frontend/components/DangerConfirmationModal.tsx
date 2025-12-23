interface DangerConfirmationModalProps {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function DangerConfirmationModal({
  isOpen,
  onConfirm,
  onCancel,
}: DangerConfirmationModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center" style={{ zIndex: 9999 }}>
      <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex-shrink-0 w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
            <span className="text-2xl">⚠️</span>
          </div>
          <h2 className="text-xl font-bold text-gray-900">Danger Mode Warning</h2>
        </div>

        <div className="mb-6 space-y-3">
          <p className="text-gray-700">
            You are about to run Claude Code with <strong>--dangerously-skip-permissions</strong>.
          </p>

          <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded">
            <p className="text-sm text-red-800 font-semibold mb-2">
              This will allow Claude to:
            </p>
            <ul className="text-sm text-red-700 space-y-1 list-disc list-inside">
              <li>Execute commands without confirmation</li>
              <li>Modify files without asking</li>
              <li>Make system-level changes</li>
              <li>Access sensitive data</li>
            </ul>
          </div>

          <p className="text-gray-700 text-sm">
            Only proceed if you fully understand the security implications and trust the script you're running.
          </p>
        </div>

        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-lg font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors"
          >
            I Understand - Proceed
          </button>
        </div>
      </div>
    </div>
  );
}
