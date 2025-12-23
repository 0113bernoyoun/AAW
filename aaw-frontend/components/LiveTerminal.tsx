'use client';

import { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

interface LiveTerminalProps {
  onReady?: (terminal: Terminal) => void;
}

export default function LiveTerminal({ onReady }: LiveTerminalProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);

  useEffect(() => {
    if (!terminalRef.current || xtermRef.current) return;

    // Create terminal instance
    const terminal = new Terminal({
      cursorBlink: false,
      fontSize: 14,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: {
        background: '#1e1e1e',
        foreground: '#d4d4d4',
      },
      rows: 30,
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);

    terminal.open(terminalRef.current);
    fitAddon.fit();

    terminal.writeln('AAW Live Terminal');
    terminal.writeln('====================================');
    terminal.writeln('Waiting for logs...');
    terminal.writeln('');

    xtermRef.current = terminal;

    if (onReady) {
      onReady(terminal);
    }

    // Cleanup
    return () => {
      terminal.dispose();
      xtermRef.current = null;
    };
  }, [onReady]);

  return <div ref={terminalRef} className="w-full h-full" />;
}
