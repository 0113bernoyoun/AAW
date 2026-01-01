'use client';

import { useTaskContext } from '@/contexts/TaskContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Activity, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';

interface WidgetCardProps {
    title: string;
    icon: React.ElementType;
    colorClass: string;
    stats: { label: string; value: string }[];
}

function WidgetCard({ title, icon: Icon, colorClass, stats }: WidgetCardProps) {
    return (
        <Card className="bg-zinc-950/50 border-zinc-800 backdrop-blur-sm overflow-hidden relative">
            <div className={cn("absolute left-0 top-0 bottom-0 w-1", colorClass)} />
            <CardHeader className="p-3 pb-2 flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-xs font-semibold text-zinc-100">{title}</CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0 space-y-1">
                {stats.map((stat, index) => (
                    <div key={index} className="flex justify-between text-[10px] text-zinc-400">
                        <span>{stat.label}:</span>
                        <span>{stat.value}</span>
                    </div>
                ))}

                {/* Decorative Icons at bottom */}
                <div className="flex gap-2 mt-2 pt-2 border-t border-zinc-800/50">
                    <div className={cn("w-4 h-4 rounded flex items-center justify-center opacity-80", colorClass)}>
                        <Icon className="w-3 h-3 text-white" />
                    </div>
                    <div className="w-4 h-4 rounded bg-zinc-800/50 flex items-center justify-center">
                        <span className="text-[8px]">⋮</span>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}

export default function DashboardWidgets() {
    const { tasks } = useTaskContext();

    // Calculate real stats from tasks
    const activeTasks = tasks.filter(t =>
        ['RUNNING', 'INTERRUPTED', 'PAUSED', 'RATE_LIMITED', 'CANCELLING', 'TERMINATING'].includes(t.status)
    );
    const completedTasks = tasks.filter(t =>
        ['COMPLETED', 'FAILED', 'KILLED', 'CANCELLED'].includes(t.status)
    );

    // Get most recent activity time
    const lastActiveTime = activeTasks.length > 0
        ? formatDistanceToNow(new Date(activeTasks[0].startedAt || activeTasks[0].createdAt), { addSuffix: true })
        : 'No active tasks';

    const lastCompletedTime = completedTasks.length > 0
        ? formatDistanceToNow(new Date(completedTasks[0].completedAt || completedTasks[0].createdAt), { addSuffix: true })
        : 'No completed tasks';

    return (
        <div className="grid grid-cols-2 gap-2 mb-3 px-4">
            <WidgetCard
                title="Task Summary"
                icon={Activity}
                colorClass="bg-teal-500"
                stats={[
                    { label: 'Active', value: lastActiveTime },
                    { label: 'Completed', value: String(completedTasks.length) },
                    { label: 'Last Completed', value: lastCompletedTime },
                ]}
            />
            <WidgetCard
                title="Task Alert"
                icon={AlertCircle}
                colorClass="bg-amber-500"
                stats={[
                    { label: 'Running', value: String(tasks.filter(t => t.status === 'RUNNING').length) },
                    { label: 'Interrupted', value: String(tasks.filter(t => t.status === 'INTERRUPTED').length) },
                    { label: 'Failed', value: String(tasks.filter(t => t.status === 'FAILED').length) },
                ]}
            />
        </div>
    );
}
