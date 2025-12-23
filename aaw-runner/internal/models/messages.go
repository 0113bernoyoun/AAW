package models

// Message types
const (
	TypeHelo         = "HELO"
	TypeLog          = "LOG"
	TypeStatusUpdate = "STATUS_UPDATE"
	TypeExecute      = "EXECUTE"
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

// Task status constants
const (
	StatusPending     = "PENDING"
	StatusRunning     = "RUNNING"
	StatusPaused      = "PAUSED"
	StatusRateLimited = "RATE_LIMITED"
	StatusCompleted   = "COMPLETED"
	StatusFailed      = "FAILED"
)
