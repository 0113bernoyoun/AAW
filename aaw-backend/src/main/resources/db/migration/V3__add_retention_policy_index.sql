-- Migration V3: Add indexes for 24-hour task retention policy
-- Author: Claude (AAW Implementation)
-- Date: 2025-12-26

-- Partial index for efficient retention queries
-- Only indexes rows where completed_at IS NOT NULL (excludes RUNNING/QUEUED tasks)
CREATE INDEX idx_task_completed_at ON tasks(completed_at)
WHERE completed_at IS NOT NULL;

-- Composite index for manual deletion endpoint performance
-- Optimizes lookups by (id, status) for task deletion validation
CREATE INDEX idx_task_id_status ON tasks(id, status);

-- Note: Existing cascade constraint verified (no changes needed)
-- CONSTRAINT fk_execution_logs_task REFERENCES tasks(id) ON DELETE CASCADE
-- This ensures execution_logs are automatically deleted when tasks are hard deleted
