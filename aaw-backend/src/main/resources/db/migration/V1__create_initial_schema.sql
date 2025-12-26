-- AAW Initial Database Schema
-- Creates tasks and execution_logs tables with all required fields

-- Tasks table (18 columns)
CREATE TABLE tasks (
    id BIGSERIAL PRIMARY KEY,
    instruction VARCHAR(2000) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
    current_branch VARCHAR(255),
    base_branch VARCHAR(255),
    jira_key VARCHAR(100),
    script_content TEXT,
    skip_permissions BOOLEAN NOT NULL DEFAULT FALSE,
    session_mode VARCHAR(20) NOT NULL DEFAULT 'PERSIST',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    priority INTEGER NOT NULL DEFAULT 0,
    queued_at TIMESTAMP,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    error_summary VARCHAR(1000),
    execution_mode VARCHAR(20) NOT NULL DEFAULT 'QUEUED',
    failure_reason VARCHAR(50),
    retry_count INTEGER NOT NULL DEFAULT 0
);

-- Execution logs table
CREATE TABLE execution_logs (
    id BIGSERIAL PRIMARY KEY,
    task_id BIGINT NOT NULL,
    log_chunk TEXT NOT NULL,
    is_error BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_execution_logs_task FOREIGN KEY (task_id)
        REFERENCES tasks(id) ON DELETE CASCADE
);

-- Performance indexes
CREATE INDEX idx_task_status_priority ON tasks(status, priority DESC, created_at ASC);
CREATE INDEX idx_execution_logs_task_id ON execution_logs(task_id);
