'use client';

import { TaskProvider } from '@/contexts/TaskContext';
import Navigation from '@/components/dashboard/Navigation';
import TaskPanel from '@/components/dashboard/TaskPanel';
import WorkspacePanel from '@/components/dashboard/WorkspacePanel';
import RecoveryManager from '@/components/RecoveryManager';

export default function Home() {
  return (
    <TaskProvider>
      <div className="h-screen flex overflow-hidden bg-zinc-950">
        {/* Fixed 64px Nav */}
        <div className="w-16 flex-shrink-0 bg-zinc-950 border-r border-zinc-800">
          <Navigation />
        </div>

        {/* Task Sidebar: Fixed 320px width */}
        <div className="w-80 flex-shrink-0 overflow-hidden">
          <TaskPanel />
        </div>

        {/* Workspace: flex-grow fills remaining space */}
        <div className="flex-1 overflow-hidden">
          <WorkspacePanel />
        </div>

        {/* Recovery Modal Manager */}
        <RecoveryManager />
      </div>
    </TaskProvider>
  );
}
