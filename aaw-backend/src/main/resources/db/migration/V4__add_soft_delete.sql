-- V4: Add soft delete columns for 24-hour retention policy
-- Tasks will be marked as archived after 24 hours, then permanently deleted via "Empty Trash" action

-- Add soft delete tracking columns
ALTER TABLE tasks ADD COLUMN is_archived BOOLEAN DEFAULT FALSE NOT NULL;
ALTER TABLE tasks ADD COLUMN deleted_at TIMESTAMP NULL;

-- Add index for efficient archived task queries
CREATE INDEX idx_tasks_archived ON tasks(is_archived, deleted_at) WHERE is_archived = TRUE;

-- Add comment for documentation
COMMENT ON COLUMN tasks.is_archived IS 'Soft delete flag - tasks archived after 24h retention period';
COMMENT ON COLUMN tasks.deleted_at IS 'Timestamp when task was archived (soft deleted)';
