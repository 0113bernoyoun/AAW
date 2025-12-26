-- Add cancelled_at column for task cancellation tracking
-- Stores timestamp when task was cancelled, marked as cancelling, or killed

ALTER TABLE tasks
ADD COLUMN cancelled_at TIMESTAMP;

-- Add comment for documentation
COMMENT ON COLUMN tasks.cancelled_at IS 'Timestamp when task entered CANCELLING, CANCELLED, or KILLED status';
