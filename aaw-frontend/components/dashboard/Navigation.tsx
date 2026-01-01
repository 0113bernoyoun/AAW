'use client';

import { ListTodo, Settings, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';

export default function Navigation() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="h-full flex flex-col bg-zinc-950 items-center py-4">
      {/* Logo Icon */}
      <div className="w-10 h-10 rounded-lg bg-teal-500/20 flex items-center justify-center mb-6">
        <ListTodo className="w-5 h-5 text-teal-500" />
      </div>

      {/* Icon Menu */}
      <div className="flex-1 flex flex-col items-center gap-2">
        <button
          className="w-10 h-10 rounded-lg bg-teal-500/10 text-teal-500 hover:bg-teal-500/20 border border-teal-500/20 flex items-center justify-center transition-colors"
          title="Tasks"
        >
          <ListTodo className="w-5 h-5" />
        </button>
      </div>

      {/* Footer Icons */}
      <div className="flex flex-col items-center gap-2">
        <button
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className="w-10 h-10 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 flex items-center justify-center transition-colors"
          title="Toggle Theme"
        >
          {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
        </button>
        <button
          className="w-10 h-10 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 flex items-center justify-center transition-colors"
          title="Settings"
        >
          <Settings className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}
