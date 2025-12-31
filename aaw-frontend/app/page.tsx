'use client';

import { TaskProvider } from '@/contexts/TaskContext';
import Navigation from '@/components/dashboard/Navigation';
import TaskPanel from '@/components/dashboard/TaskPanel';
import WorkspacePanel from '@/components/dashboard/WorkspacePanel';
import RecoveryManager from '@/components/RecoveryManager';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';

export default function Home() {
  return (
    <TaskProvider>
      <div className="h-screen overflow-hidden bg-background">
        <ResizablePanelGroup orientation="horizontal" id="mission-control-layout">
          {/* Left Navigation - 15% */}
          <ResizablePanel
            defaultSize={15}
            minSize={10}
            maxSize={20}
            id="nav-panel"
            collapsible={false}
          >
            <Navigation />
          </ResizablePanel>

          <ResizableHandle withHandle />

          {/* Center Task List - 30% */}
          <ResizablePanel
            defaultSize={30}
            minSize={20}
            maxSize={40}
            id="task-panel"
            collapsible={false}
          >
            <TaskPanel />
          </ResizablePanel>

          <ResizableHandle withHandle />

          {/* Right Workspace - 55% */}
          <ResizablePanel defaultSize={55} id="workspace-panel">
            <WorkspacePanel />
          </ResizablePanel>
        </ResizablePanelGroup>

        {/* Recovery Modal Manager */}
        <RecoveryManager />
      </div>
    </TaskProvider>
  );
}
