'use client';

import { TaskProvider } from '@/contexts/TaskContext';
import TaskSidebar from '@/components/TaskSidebar';
import TaskWorkspace from '@/components/TaskWorkspace';
import RecoveryManager from '@/components/RecoveryManager';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';

export default function Home() {
  return (
    <TaskProvider>
      <div className="h-screen overflow-hidden bg-background">
        <ResizablePanelGroup orientation="horizontal" id="mission-control-layout">
          {/* Left Sidebar - Mission Control Task Monitor (30%) */}
          <ResizablePanel
            defaultSize={30}
            id="sidebar-panel"
            collapsible={false}
          >
            <TaskSidebar />
          </ResizablePanel>

          {/* Drag Handle */}
          <ResizableHandle withHandle />

          {/* Right Workspace - Terminal & Control Panel (70%) */}
          <ResizablePanel defaultSize={70} id="workspace-panel">
            <TaskWorkspace />
          </ResizablePanel>
        </ResizablePanelGroup>

        {/* Recovery Modal Manager */}
        <RecoveryManager />
      </div>
    </TaskProvider>
  );
}
