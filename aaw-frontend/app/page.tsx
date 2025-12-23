'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import LiveTerminal from '@/components/LiveTerminal';
import StatusBadge from '@/components/StatusBadge';
import TaskControlPanel from '@/components/TaskControlPanel';
import { createReconnectingSSE, closeGlobalSSE, type LogChunk } from '@/lib/sse-client';
import { Terminal } from '@xterm/xterm';
import { PlayCircle } from 'lucide-react';

export default function Home() {
  const [taskStatus, setTaskStatus] = useState<string>('');
  const [currentTaskId, setCurrentTaskId] = useState<number | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isSystemReady, setIsSystemReady] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const terminalRef = useRef<Terminal | null>(null);
  const sseManagerRef = useRef<{ connect: () => void; disconnect: () => void } | null>(null);
  const sseInitialized = useRef(false);

  // Memoize onReady callback to prevent terminal re-initialization
  const handleTerminalReady = useCallback((terminal: Terminal) => {
    terminalRef.current = terminal;
  }, []);

  useEffect(() => {
    // Prevent double initialization in React Strict Mode
    if (sseInitialized.current) return;
    sseInitialized.current = true;

    // Create reconnecting SSE client
    const sseManager = createReconnectingSSE({
      onLog: (log: LogChunk) => {
        if (terminalRef.current && log.line) {
          const line = log.isError ? `\x1b[31m${log.line}\x1b[0m` : log.line;
          terminalRef.current.writeln(line);
        }
      },
      onStatusUpdate: (status: string) => {
        setTaskStatus(status);
      },
      onSystemReady: () => {
        console.log('System ready - Runner connected');
        setIsSystemReady(true);
        setIsConnected(true);
      },
      onSystemDisconnected: () => {
        console.log('System disconnected - Runner offline');
        setIsSystemReady(false);
      },
      onError: (error) => {
        console.error('SSE error:', error);
        setIsConnected(false);
        setIsSystemReady(false);
      },
    });

    sseManagerRef.current = sseManager;
    sseManager.connect();

    return () => {
      // Don't reset sseInitialized in cleanup to prevent re-initialization in Strict Mode
      sseManager.disconnect();
      closeGlobalSSE(); // Ensure global connection is closed
    };
  }, []);

  const handleStartDummyTask = async () => {
    setIsStarting(true);

    try {
      const response = await fetch('http://localhost:8080/api/tasks/start-dummy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const task = await response.json();
        setCurrentTaskId(task.id);
        setTaskStatus(task.status);

        if (terminalRef.current) {
          terminalRef.current.writeln('');
          terminalRef.current.writeln(`\x1b[32m[Task ${task.id} started]\x1b[0m`);
          terminalRef.current.writeln('');
        }
      } else {
        console.error('Failed to start task:', response.statusText);
        if (terminalRef.current) {
          terminalRef.current.writeln('\x1b[31mFailed to start task\x1b[0m');
        }
      }
    } catch (error) {
      console.error('Error starting task:', error);
      if (terminalRef.current) {
        terminalRef.current.writeln('\x1b[31mError: Cannot connect to backend\x1b[0m');
      }
    } finally {
      setIsStarting(false);
    }
  };

  const handleDynamicTaskSubmit = async (data: {
    instruction: string;
    scriptContent: string;
    skipPermissions: boolean;
    sessionMode: string;
  }) => {
    setIsStarting(true);

    try {
      const response = await fetch('http://localhost:8080/api/tasks/create-dynamic', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      if (response.ok) {
        const task = await response.json();
        setCurrentTaskId(task.id);
        setTaskStatus(task.status);

        if (terminalRef.current) {
          terminalRef.current.writeln('');
          terminalRef.current.writeln(`\x1b[32m[Dynamic Task ${task.id} started - Session: ${data.sessionMode}, Skip Permissions: ${data.skipPermissions}]\x1b[0m`);
          terminalRef.current.writeln('');
        }
      } else {
        console.error('Failed to create dynamic task:', response.statusText);
        if (terminalRef.current) {
          terminalRef.current.writeln('\x1b[31mFailed to create dynamic task\x1b[0m');
        }
      }
    } catch (error) {
      console.error('Error creating dynamic task:', error);
      if (terminalRef.current) {
        terminalRef.current.writeln('\x1b[31mError: Cannot connect to backend\x1b[0m');
      }
    } finally {
      setIsStarting(false);
    }
  };

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="bg-white rounded-lg shadow p-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            AAW - AI Auto Worker
          </h1>
          <p className="text-gray-600">
            Real-time Log Streaming & Rate-Limit Detection PoC
          </p>
        </div>

        {/* System Status */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <div className={`w-3 h-3 rounded-full ${isSystemReady ? 'bg-green-500' : isConnected ? 'bg-yellow-500' : 'bg-red-500'}`} />
                <span className="text-sm text-gray-600">
                  {isSystemReady ? 'System Ready' : isConnected ? 'SSE Connected (Runner offline)' : 'Disconnected'}
                </span>
              </div>
            </div>

            {currentTaskId && taskStatus && (
              <div className="flex items-center gap-4">
                <span className="text-sm text-gray-600">Task #{currentTaskId}:</span>
                <StatusBadge status={taskStatus} />
              </div>
            )}
          </div>
        </div>

        {/* Dynamic Task Control Panel */}
        <TaskControlPanel
          onTaskSubmit={handleDynamicTaskSubmit}
          isSystemReady={isSystemReady}
          isStarting={isStarting}
        />

        {/* Legacy Dummy Task Control */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Legacy Test (Script Path)</h2>
          <button
            onClick={handleStartDummyTask}
            disabled={isStarting || !isSystemReady}
            className="flex items-center gap-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white px-6 py-3 rounded-lg font-semibold transition-colors"
          >
            <PlayCircle size={20} />
            {isStarting ? 'Starting...' : 'Start Dummy Task'}
          </button>
        </div>

        {/* Terminal */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Live Terminal</h2>
          <div className="bg-[#1e1e1e] rounded-lg p-4 h-[600px] overflow-hidden">
            <LiveTerminal onReady={handleTerminalReady} />
          </div>
        </div>

        {/* Instructions */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h3 className="font-semibold text-blue-900 mb-2">How to Test</h3>
          <ol className="list-decimal list-inside space-y-1 text-blue-800 text-sm">
            <li>Ensure backend and runner are running</li>
            <li>Click &quot;Start Dummy Task&quot; button</li>
            <li>Watch logs stream in real-time (100 items with 0.5s delay)</li>
            <li>At item 50, rate limit detection triggers</li>
            <li>Status badge changes to &quot;RATE_LIMITED&quot;</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
