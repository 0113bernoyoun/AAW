'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useTaskContext, LogEntry } from '@/contexts/TaskContext';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

interface LiveTerminalProps {
  onReady?: (terminal: Terminal) => void;
  taskId?: number | null;  // Optional taskId to filter logs
}

export default function LiveTerminal({ onReady, taskId }: LiveTerminalProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const { sseEvents, isConnected, fetchTaskLogs } = useTaskContext();

  // Track which events we've already processed to avoid duplicates
  const lastEventIndexRef = useRef(0);
  // Track the previous taskId to detect changes
  const previousTaskIdRef = useRef<number | null | undefined>(undefined);

  // Helper function to write welcome message
  const writeWelcomeMessage = useCallback((terminal: Terminal) => {
    terminal.writeln('\x1b[36m╔══════════════════════════════════════════════════════════════╗\x1b[0m');
    terminal.writeln('\x1b[36m║\x1b[0m   \x1b[1;34mAAW Mission Control Terminal\x1b[0m                              \x1b[36m║\x1b[0m');
    terminal.writeln('\x1b[36m║\x1b[0m   AI Auto Worker - Real-Time Task Execution Monitor      \x1b[36m║\x1b[0m');
    terminal.writeln('\x1b[36m╚══════════════════════════════════════════════════════════════╝\x1b[0m');
    terminal.writeln('');
  }, []);

  // Helper function to get ANSI color code for status
  const getStatusColor = useCallback((status: string): string => {
    switch (status) {
      case 'RUNNING':
        return '32';  // Green
      case 'COMPLETED':
        return '32';  // Green
      case 'FAILED':
        return '31';  // Red
      case 'INTERRUPTED':
        return '31';  // Red
      case 'RATE_LIMITED':
        return '33';  // Yellow
      case 'PAUSED':
        return '33';  // Yellow
      case 'QUEUED':
        return '34';  // Blue
      default:
        return '0';   // Default
    }
  }, []);

  // Initialize xterm.js with Mission Control dark theme
  useEffect(() => {
    if (!terminalRef.current || xtermRef.current) return;

    // Create terminal with Mission Control theme
    const terminal = new Terminal({
      theme: {
        background: '#0d1117',     // mc-bg-primary
        foreground: '#c9d1d9',     // mc-text-primary
        cursor: '#58a6ff',         // mc-accent-blue
        cursorAccent: '#0d1117',
        selectionBackground: '#264f78',
        black: '#161b22',
        red: '#f85149',            // mc-accent-red
        green: '#3fb950',          // mc-accent-green
        yellow: '#d29922',         // mc-accent-yellow
        blue: '#58a6ff',           // mc-accent-blue
        magenta: '#bc8cff',        // mc-accent-purple
        cyan: '#76e3ea',
        white: '#c9d1d9',
        brightBlack: '#30363d',
        brightRed: '#ff7b72',
        brightGreen: '#56d364',
        brightYellow: '#e3b341',
        brightBlue: '#79c0ff',
        brightMagenta: '#d2a8ff',
        brightCyan: '#b3f0ff',
        brightWhite: '#f0f6fc',
      },
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      fontSize: 13,
      lineHeight: 1.2,
      cursorBlink: true,
      cursorStyle: 'block',
      scrollback: 10000,
      allowProposedApi: true,
      convertEol: true,
      disableStdin: true,
      rows: 30,
      cols: 120,
    });

    // Create and load FitAddon for responsive sizing
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);

    // Open terminal in DOM
    terminal.open(terminalRef.current);

    // Fit terminal to container
    fitAddon.fit();

    // Welcome message with Mission Control branding
    writeWelcomeMessage(terminal);
    terminal.writeln('\x1b[90m[INFO]\x1b[0m Terminal initialized. Waiting for task execution...');
    terminal.writeln('');

    // Store refs
    xtermRef.current = terminal;
    fitAddonRef.current = fitAddon;

    // Notify parent component
    if (onReady) {
      onReady(terminal);
    }

    // Handle window resize
    const handleResize = () => {
      if (fitAddonRef.current && xtermRef.current) {
        try {
          fitAddonRef.current.fit();
        } catch (error) {
          console.error('[LiveTerminal] Resize error:', error);
        }
      }
    };

    window.addEventListener('resize', handleResize);

    // Cleanup on unmount
    return () => {
      window.removeEventListener('resize', handleResize);
      if (xtermRef.current) {
        xtermRef.current.dispose();
        xtermRef.current = null;
      }
    };
  }, [onReady, writeWelcomeMessage]);

  // Handle taskId changes - fetch historical logs and clear terminal
  useEffect(() => {
    const terminal = xtermRef.current;
    if (!terminal) return;

    // Check if taskId has changed
    if (taskId !== previousTaskIdRef.current) {
      console.log(`[LiveTerminal] Task changed: ${previousTaskIdRef.current} -> ${taskId}`);
      previousTaskIdRef.current = taskId;

      // Clear terminal and write welcome message
      terminal.clear();
      writeWelcomeMessage(terminal);

      if (taskId) {
        // Fetch historical logs for this task
        terminal.writeln(`\x1b[90m[INFO]\x1b[0m Loading logs for Task ${taskId}...\x1b[0m`);
        terminal.writeln('');

        fetchTaskLogs(taskId).then((logs: LogEntry[]) => {
          if (logs.length > 0) {
            terminal.writeln(`\x1b[90m--- Historical logs (${logs.length} entries) ---\x1b[0m`);
            logs.forEach((log) => {
              const color = log.isError ? '\x1b[31m' : '\x1b[0m';
              terminal.writeln(`${color}${log.logChunk}\x1b[0m`);
            });
            terminal.writeln(`\x1b[90m--- End of historical logs ---\x1b[0m`);
            terminal.writeln('');
          } else {
            terminal.writeln(`\x1b[90m[INFO]\x1b[0m No historical logs found for this task.`);
            terminal.writeln('');
          }

          // Scroll to bottom after loading historical logs
          terminal.scrollToBottom();
        });
      } else {
        // No task selected - show general message
        terminal.writeln('\x1b[90m[INFO]\x1b[0m Waiting for task execution...');
        terminal.writeln('');
      }

      // Reset event index to only process new events from this point
      lastEventIndexRef.current = sseEvents.length;
    }
  }, [taskId, fetchTaskLogs, writeWelcomeMessage, sseEvents.length]);

  // Process new SSE events (filtered by taskId when applicable)
  useEffect(() => {
    const terminal = xtermRef.current;
    if (!terminal) return;

    // Get only new events since last processing
    const newEvents = sseEvents.slice(lastEventIndexRef.current);
    lastEventIndexRef.current = sseEvents.length;

    if (newEvents.length === 0) return;

    // Process each new event
    newEvents.forEach((event) => {
      // Determine if this event should be shown
      const isGlobalEvent = ['SYSTEM_READY', 'SYSTEM_DISCONNECTED', 'SYSTEM'].includes(event.type);
      const isTaskEvent = event.taskId !== undefined && event.taskId === taskId;
      const isNoTaskFilter = taskId === null || taskId === undefined;

      // Skip task-specific events that don't match the selected taskId
      if (!isGlobalEvent && !isNoTaskFilter && !isTaskEvent) {
        return;
      }

      switch (event.type) {
        case 'SYSTEM_READY':
          terminal.writeln('\x1b[32m[SYSTEM]\x1b[0m ✓ Runner connected and ready');
          break;

        case 'SYSTEM_DISCONNECTED':
          terminal.writeln('');
          terminal.writeln('\x1b[31m[SYSTEM]\x1b[0m ✗ Runner disconnected');
          terminal.writeln('');
          break;

        case 'TASK_QUEUED':
          if (event.task && (isNoTaskFilter || event.task.id === taskId)) {
            terminal.writeln('');
            terminal.writeln(`\x1b[34m[TASK ${event.task.id}]\x1b[0m Queued with priority ${event.task.priority}`);
            terminal.writeln(`\x1b[90m  Instruction: ${event.task.instruction}\x1b[0m`);
            terminal.writeln('');
          }
          break;

        case 'STATUS_UPDATE':
          if (event.taskId && event.status) {
            if (isNoTaskFilter || event.taskId === taskId) {
              const statusColor = getStatusColor(event.status);
              terminal.writeln(`\x1b[${statusColor}m[TASK ${event.taskId}]\x1b[0m Status: ${event.status}`);
            }
          }
          break;

        case 'LOG':
          if (event.line) {
            if (isNoTaskFilter || event.taskId === taskId) {
              const color = event.isError ? '\x1b[31m' : '\x1b[0m';
              terminal.writeln(`${color}${event.line}\x1b[0m`);

              // Auto-scroll to bottom if enabled
              if (autoScroll) {
                terminal.scrollToBottom();
              }
            }
          }
          break;

        case 'SYSTEM':
          if (event.line) {
            terminal.writeln(`\x1b[36m[SYSTEM]\x1b[0m ${event.line}`);
          }
          break;
      }
    });
  }, [sseEvents, taskId, autoScroll, getStatusColor]);

  return (
    <div className="h-full w-full flex flex-col bg-mc-bg-primary rounded-lg overflow-hidden" data-testid="live-terminal">
      {/* Terminal container with xterm.js */}
      <div ref={terminalRef} className="flex-1 overflow-hidden p-2" />
    </div>
  );
}
