package models

// Message types
const (
	TypeHelo            = "HELO"
	TypeLog             = "LOG"
	TypeStatusUpdate    = "STATUS_UPDATE"
	TypeExecute         = "EXECUTE"
	TypeRunnerStatus    = "RUNNER_STATUS"
	TypeTaskCompleted   = "TASK_COMPLETED"
	TypeCancelTask      = "CANCEL_TASK"
	TypeKillTask        = "KILL_TASK"
	TypeCancelAck       = "CANCEL_ACK"
	TypeTaskTerminated  = "TASK_TERMINATED" // New: Explicit ACK for delete operation
	TypeRunnerCapacity  = "RUNNER_CAPACITY"
)

// HeloMessage represents the initial handshake message
type HeloMessage struct {
	Type     string `json:"type"`
	Hostname string `json:"hostname"`
	Workdir  string `json:"workdir"`
}

// LogMessage represents a log line from task execution
type LogMessage struct {
	Type    string `json:"type"`
	TaskID  int64  `json:"taskId"`
	Line    string `json:"line"`
	IsError bool   `json:"isError"`
}

// StatusUpdateMessage represents a task status change
type StatusUpdateMessage struct {
	Type   string `json:"type"`
	TaskID int64  `json:"taskId"`
	Status string `json:"status"`
}

// ExecuteMessage represents a command from backend to execute a task
type ExecuteMessage struct {
	Type            string `json:"type"`
	TaskID          int64  `json:"taskId"`
	Script          string `json:"script"`          // Legacy: file path to script
	ScriptContent   string `json:"scriptContent"`   // New: inline script/prompt content
	SkipPermissions bool   `json:"skipPermissions"` // Whether to use --dangerously-skip-permissions
	SessionMode     string `json:"sessionMode"`     // "NEW" or "PERSIST"
}

// RunnerStatusMessage represents the runner's current state
type RunnerStatusMessage struct {
	Type   string `json:"type"`
	Status string `json:"status"` // "IDLE" or "BUSY"
}

// TaskCompletedMessage represents task completion notification
type TaskCompletedMessage struct {
	Type    string `json:"type"`
	TaskID  int64  `json:"taskId"`
	Success bool   `json:"success"`
	Error   string `json:"error,omitempty"` // Optional error message
}

// Task status constants
const (
	StatusPending     = "PENDING"
	StatusRunning     = "RUNNING"
	StatusPaused      = "PAUSED"
	StatusRateLimited = "RATE_LIMITED"
	StatusCompleted   = "COMPLETED"
	StatusFailed      = "FAILED"
	StatusCancelled   = "CANCELLED"
)

// CancelTaskMessage represents a request to gracefully cancel a task
type CancelTaskMessage struct {
	Type   string `json:"type"`
	TaskID int64  `json:"taskId"`
}

// KillTaskMessage represents a request to forcefully kill a task
type KillTaskMessage struct {
	Type   string `json:"type"`
	TaskID int64  `json:"taskId"`
}

// CancelAckMessage represents acknowledgment of cancel/kill request
type CancelAckMessage struct {
	Type    string `json:"type"`
	TaskID  int64  `json:"taskId"`
	Status  string `json:"status"`          // "CANCELLED" or "KILLED"
	Success bool   `json:"success"`
	Error   string `json:"error,omitempty"`
}

// TaskTerminatedMessage represents explicit ACK after task termination for safe deletion
// Used by backend to wait for confirmation before soft-deleting task record
type TaskTerminatedMessage struct {
	Type    string `json:"type"`
	TaskID  int64  `json:"taskId"`
	Status  string `json:"status"`          // "KILLED"
	Success bool   `json:"success"`
	Error   string `json:"error,omitempty"`
}

// RunnerCapacityMessage represents the runner's capacity for concurrent tasks
type RunnerCapacityMessage struct {
	Type           string `json:"type"`
	MaxParallel    int    `json:"maxParallel"`
	RunningTasks   int    `json:"runningTasks"`
	AvailableSlots int    `json:"availableSlots"`
}
