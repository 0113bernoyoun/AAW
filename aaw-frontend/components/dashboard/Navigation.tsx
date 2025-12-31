'use client';

import { ListTodo } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ThemeToggle } from '@/components/ThemeToggle';

export default function Navigation() {
  return (
    <div className="h-full flex flex-col bg-card border-r">
      {/* Header */}
      <div className="p-4 border-b">
        <h1 className="text-lg font-bold">AAW</h1>
        <p className="text-xs text-muted-foreground">Mission Control</p>
      </div>

      {/* Menu Items */}
      <div className="flex-1 p-2 space-y-1">
        <Button variant="default" className="w-full justify-start">
          <ListTodo className="w-4 h-4 mr-2" />
          Tasks
        </Button>
      </div>

      <Separator />

      {/* Footer */}
      <div className="p-4 space-y-2">
        <ThemeToggle />
        <p className="text-xs text-muted-foreground text-center">v2.0</p>
      </div>
    </div>
  );
}
