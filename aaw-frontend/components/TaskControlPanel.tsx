'use client';

import { useState } from 'react';
import { PlayCircle, AlertTriangle, ShieldAlert } from 'lucide-react';

interface TaskControlPanelProps {
  onTaskSubmit: (data: {
    instruction: string;
    scriptContent: string;
    skipPermissions: boolean;
    sessionMode: string;
  }) => void;
  isSystemReady: boolean;
  isStarting: boolean;
}

export default function TaskControlPanel({
  onTaskSubmit,
  isSystemReady,
  isStarting,
}: TaskControlPanelProps) {
  // Version check - if you see this in console, new code is loaded
  // console.log('[TaskControlPanel] Version 2.0 - Skip permissions conditional rendering enabled');

  const [scriptContent, setScriptContent] = useState('');
  const [skipPermissions, setSkipPermissions] = useState(false);
  const [sessionMode, setSessionMode] = useState<'NEW' | 'PERSIST'>('PERSIST');
  const [showDangerWarning, setShowDangerWarning] = useState(false);

  const MATH_TEST_SCRIPT = 'Create a Python script that calculates factorial of 10 and prints the result';

  const handleSubmit = () => {
    if (!scriptContent.trim()) {
      alert('Please enter a script or prompt');
      return;
    }

    if (skipPermissions && !showDangerWarning) {
      // Show inline danger warning for confirmation
      setShowDangerWarning(true);
    } else if (!skipPermissions) {
      // Submit directly if no danger mode
      executeSubmit();
    }
  };

  const executeSubmit = () => {
    onTaskSubmit({
      instruction: scriptContent.substring(0, 100), // First 100 chars as instruction
      scriptContent,
      skipPermissions,
      sessionMode,
    });
    setShowDangerWarning(false);
  };

  const handleDangerConfirm = () => {
    executeSubmit();
  };

  const handleDangerCancel = () => {
    setShowDangerWarning(false);
  };

  const loadMathTest = () => {
    setScriptContent(MATH_TEST_SCRIPT);
    setSkipPermissions(true);
    setSessionMode('NEW');
  };

  return (
    <>
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Dynamic Task Control Panel</h2>

        {/* Script Content Textarea */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Script / Prompt
          </label>
          <textarea
            value={scriptContent}
            onChange={(e) => setScriptContent(e.target.value)}
            placeholder="Enter your Claude Code script or prompt here..."
            className="w-full h-32 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none font-mono text-sm"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          {/* Session Mode */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Session Mode
            </label>
            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="sessionMode"
                  value="PERSIST"
                  checked={sessionMode === 'PERSIST'}
                  onChange={(e) => setSessionMode(e.target.value as 'PERSIST')}
                  className="w-4 h-4 text-blue-600"
                />
                <span className="text-sm text-gray-700">
                  Persist (Use shared context)
                </span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="sessionMode"
                  value="NEW"
                  checked={sessionMode === 'NEW'}
                  onChange={(e) => setSessionMode(e.target.value as 'NEW')}
                  className="w-4 h-4 text-blue-600"
                />
                <span className="text-sm text-gray-700">
                  New (Isolated clean context)
                </span>
              </label>
            </div>
          </div>

          {/* Skip Permissions Toggle */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Execution Mode
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={skipPermissions}
                onChange={(e) => {
                  console.log('[DEBUG] Skip Permissions changed:', e.target.checked);
                  setSkipPermissions(e.target.checked);
                  if (!e.target.checked) {
                    console.log('[DEBUG] Hiding danger warning');
                    setShowDangerWarning(false); // Hide warning when unchecked
                  }
                }}
                className="w-5 h-5 text-red-600 rounded"
              />
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-red-600" />
                <span className="text-sm font-medium text-gray-700">
                  Skip Permissions (Danger Mode)
                </span>
              </div>
            </label>
            {skipPermissions && (
              <p className="text-xs text-red-600 mt-1 ml-8">
                Claude will execute commands without asking
              </p> 
            ) && (
        <div className="overflow-hidden transition-all duration-300 ease-in-out max-h-96 mt-4">
          <div className="border-2 border-red-500 rounded-lg bg-red-50 p-6">
            <div className="flex items-start gap-3 mb-4">
              <ShieldAlert className="w-8 h-8 text-red-600 flex-shrink-0 mt-1" />
              <div>
                <h3 className="text-lg font-bold text-red-900 mb-2">
                  ⚠️ Danger Mode Warning
                </h3>
                <p className="text-sm text-red-800 mb-3">
                  You are about to run Claude Code with <strong>--dangerously-skip-permissions</strong>.
                </p>
              </div>
            </div>

            <div className="bg-red-100 border-l-4 border-red-600 p-4 rounded mb-4">
              <p className="text-sm text-red-900 font-semibold mb-2">
                This will allow Claude to:
              </p>
              <ul className="text-sm text-red-800 space-y-1 list-disc list-inside ml-2">
                <li>Execute commands without confirmation</li>
                <li>Modify files without asking</li>
                <li>Make system-level changes</li>
                <li>Access sensitive data</li>
              </ul>
            </div>

            <p className="text-sm text-red-800 mb-4">
              Only proceed if you fully understand the security implications and trust the script you're running.
            </p>

            <div className="flex gap-3 justify-end">
              <button
                onClick={handleDangerCancel}
                className="px-6 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-lg font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDangerConfirm}
                className="px-6 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-semibold transition-colors"
              >
                I Understand - Proceed
              </button>
            </div>
          </div>
        </div>
        )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3">
          <button
            onClick={handleSubmit}
            disabled={isStarting || !isSystemReady || !scriptContent.trim()}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white px-6 py-3 rounded-lg font-semibold transition-colors"
          >
            <PlayCircle size={20} />
            {isStarting ? 'Starting...' : 'Start Task'}
          </button>

          <button
            onClick={loadMathTest}
            disabled={isStarting || !isSystemReady}
            className="px-6 py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 text-white rounded-lg font-semibold transition-colors"
          >
            Load Math Test
          </button>
        </div>

        {/* Inline Danger Warning Panel
        {showDangerWarning && skipPermissions && (
        <div className="overflow-hidden transition-all duration-300 ease-in-out max-h-96 mt-4">
          <div className="border-2 border-red-500 rounded-lg bg-red-50 p-6">
            <div className="flex items-start gap-3 mb-4">
              <ShieldAlert className="w-8 h-8 text-red-600 flex-shrink-0 mt-1" />
              <div>
                <h3 className="text-lg font-bold text-red-900 mb-2">
                  ⚠️ Danger Mode Warning
                </h3>
                <p className="text-sm text-red-800 mb-3">
                  You are about to run Claude Code with <strong>--dangerously-skip-permissions</strong>.
                </p>
              </div>
            </div>

            <div className="bg-red-100 border-l-4 border-red-600 p-4 rounded mb-4">
              <p className="text-sm text-red-900 font-semibold mb-2">
                This will allow Claude to:
              </p>
              <ul className="text-sm text-red-800 space-y-1 list-disc list-inside ml-2">
                <li>Execute commands without confirmation</li>
                <li>Modify files without asking</li>
                <li>Make system-level changes</li>
                <li>Access sensitive data</li>
              </ul>
            </div>

            <p className="text-sm text-red-800 mb-4">
              Only proceed if you fully understand the security implications and trust the script you're running.
            </p>

            <div className="flex gap-3 justify-end">
              <button
                onClick={handleDangerCancel}
                className="px-6 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-lg font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDangerConfirm}
                className="px-6 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-semibold transition-colors"
              >
                I Understand - Proceed
              </button>
            </div>
          </div>
        </div>
        )} */}

        {!isSystemReady && (
          <p className="text-sm text-orange-600 mt-4">
            ⚠️ System not ready - Runner must be connected to start tasks
          </p>
        )}
      </div>
    </>
  );
}
