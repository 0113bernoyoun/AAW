package executor

import (
	"bufio"
	"context"
	"fmt"
	"io"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/berno/aaw-runner/internal/matcher"
	"github.com/berno/aaw-runner/internal/models"
)

// useRealtimeStreaming enables character-level streaming for lower latency
// Set AAW_REALTIME_STREAMING=true to enable
var useRealtimeStreaming = os.Getenv("AAW_REALTIME_STREAMING") == "true"

func init() {
	if useRealtimeStreaming {
		log.Println("[Executor] Real-time streaming mode enabled")
	}
}

// CancelTimeout is the duration to wait for graceful shutdown before force kill
const CancelTimeout = 10 * time.Second

// RunningTask represents a currently executing task with its process info
type RunningTask struct {
	TaskID    int64
	Cmd       *exec.Cmd
	Cancel    context.CancelFunc
	Pgid      int       // Process group ID for killing child processes
	StartedAt time.Time
}

// TaskExecutor executes shell scripts and streams output
type TaskExecutor struct {
	matcher        *matcher.PatternMatcher
	logCallback    func(models.LogMessage)
	statusCallback func(models.StatusUpdateMessage)
	runningTasks   map[int64]*RunningTask
	mu             sync.RWMutex
}

// NewTaskExecutor creates a new task executor
func NewTaskExecutor(
	logCallback func(models.LogMessage),
	statusCallback func(models.StatusUpdateMessage),
) *TaskExecutor {
	return &TaskExecutor{
		matcher:        matcher.NewPatternMatcher(),
		logCallback:    logCallback,
		statusCallback: statusCallback,
		runningTasks:   make(map[int64]*RunningTask),
	}
}

// Execute runs a script and streams its output
func (te *TaskExecutor) Execute(taskID int64, scriptPath string) error {
	// Get absolute path
	absPath, err := filepath.Abs(scriptPath)
	if err != nil {
		errMsg := fmt.Sprintf("Failed to resolve script path: %v", err)
		te.logCallback(models.LogMessage{
			Type:    models.TypeLog,
			TaskID:  taskID,
			Line:    errMsg,
			IsError: true,
		})
		return fmt.Errorf(errMsg)
	}

	// Check if script exists
	if _, err := os.Stat(absPath); os.IsNotExist(err) {
		errMsg := fmt.Sprintf("Script not found: %s", absPath)
		te.logCallback(models.LogMessage{
			Type:    models.TypeLog,
			TaskID:  taskID,
			Line:    errMsg,
			IsError: true,
		})
		return fmt.Errorf(errMsg)
	}

	// Log execution start
	te.logCallback(models.LogMessage{
		Type:    models.TypeLog,
		TaskID:  taskID,
		Line:    fmt.Sprintf("Starting execution: %s", absPath),
		IsError: false,
	})

	// Create command
	cmd := exec.Command("/bin/bash", absPath)
	cmd.Dir = filepath.Dir(absPath)

	// Create pipes for stdout and stderr
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return fmt.Errorf("failed to create stdout pipe: %w", err)
	}

	stderr, err := cmd.StderrPipe()
	if err != nil {
		return fmt.Errorf("failed to create stderr pipe: %w", err)
	}

	// Start the command
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("failed to start command: %w", err)
	}

	// Stream stdout
	go te.streamOutput(taskID, stdout, false)

	// Stream stderr
	go te.streamOutput(taskID, stderr, true)

	// Wait for command to complete
	if err := cmd.Wait(); err != nil {
		te.logCallback(models.LogMessage{
			Type:    models.TypeLog,
			TaskID:  taskID,
			Line:    fmt.Sprintf("Command failed: %v", err),
			IsError: true,
		})
		return err
	}

	return nil
}

// ExecuteDynamic executes a Claude command with inline script content
func (te *TaskExecutor) ExecuteDynamic(taskID int64, scriptContent string, skipPermissions bool, sessionMode string) error {
	// Log execution start
	te.logCallback(models.LogMessage{
		Type:    models.TypeLog,
		TaskID:  taskID,
		Line:    fmt.Sprintf("Starting dynamic execution (skip permissions: %v)", skipPermissions),
		IsError: false,
	})

	// Create cancellable context
	ctx, cancel := context.WithCancel(context.Background())

	// Build command arguments (SECURITY: using args array to prevent command injection)
	args := []string{}
	if skipPermissions {
		args = append(args, "--dangerously-skip-permissions")
	}
	args = append(args, scriptContent)

	// Create command with context for cancellation support
	cmd := exec.CommandContext(ctx, "claude", args...)

	// Set process group for killing child processes
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}

	// Create pipes for stdout and stderr
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		cancel()
		return fmt.Errorf("failed to create stdout pipe: %w", err)
	}

	stderr, err := cmd.StderrPipe()
	if err != nil {
		cancel()
		return fmt.Errorf("failed to create stderr pipe: %w", err)
	}

	// Start the command
	if err := cmd.Start(); err != nil {
		cancel()
		errMsg := fmt.Sprintf("Failed to start claude command: %v", err)
		te.logCallback(models.LogMessage{
			Type:    models.TypeLog,
			TaskID:  taskID,
			Line:    errMsg,
			IsError: true,
		})
		return fmt.Errorf(errMsg)
	}

	// Get process group ID (same as PID when Setpgid is true)
	pgid, err := syscall.Getpgid(cmd.Process.Pid)
	if err != nil {
		pgid = cmd.Process.Pid // Fallback to PID if we can't get PGID
	}

	// Register running task
	runningTask := &RunningTask{
		TaskID:    taskID,
		Cmd:       cmd,
		Cancel:    cancel,
		Pgid:      pgid,
		StartedAt: time.Now(),
	}
	te.registerTask(runningTask)

	// Ensure cleanup on exit
	defer te.unregisterTask(taskID)

	// Stream stdout and stderr using the appropriate mode
	if useRealtimeStreaming {
		go te.streamOutputRealtime(taskID, stdout, false)
		go te.streamOutputRealtime(taskID, stderr, true)
	} else {
		go te.streamOutput(taskID, stdout, false)
		go te.streamOutput(taskID, stderr, true)
	}

	// Wait for command to complete
	if err := cmd.Wait(); err != nil {
		// Check if this was a cancellation
		if ctx.Err() == context.Canceled {
			te.logCallback(models.LogMessage{
				Type:    models.TypeLog,
				TaskID:  taskID,
				Line:    "Task was cancelled",
				IsError: false,
			})
			return fmt.Errorf("task cancelled")
		}

		te.logCallback(models.LogMessage{
			Type:    models.TypeLog,
			TaskID:  taskID,
			Line:    fmt.Sprintf("Command failed: %v", err),
			IsError: true,
		})
		return err
	}

	te.logCallback(models.LogMessage{
		Type:    models.TypeLog,
		TaskID:  taskID,
		Line:    "Dynamic execution completed",
		IsError: false,
	})

	return nil
}

// streamOutput reads from a pipe and sends log messages
// Uses a smaller buffer (256 bytes initial) for faster flushing compared to default 64KB
func (te *TaskExecutor) streamOutput(taskID int64, reader io.Reader, isError bool) {
	scanner := bufio.NewScanner(reader)

	// Use smaller buffer for faster flushing (256 bytes initial, max 1MB)
	// This reduces latency compared to the default 64KB buffer
	buf := make([]byte, 256)
	scanner.Buffer(buf, bufio.MaxScanTokenSize)

	streamType := "stdout"
	if isError {
		streamType = "stderr"
	}
	fmt.Printf("[DEBUG] Starting %s stream for task %d\n", streamType, taskID)

	lineCount := 0
	for scanner.Scan() {
		line := scanner.Text()
		lineCount++
		fmt.Printf("[DEBUG] Task %d %s line %d: %s\n", taskID, streamType, lineCount, line)

		// Send log message
		te.logCallback(models.LogMessage{
			Type:    models.TypeLog,
			TaskID:  taskID,
			Line:    line,
			IsError: isError,
		})

		// Check for rate limit pattern
		if te.matcher.IsRateLimitDetected(line) {
			fmt.Printf("[DEBUG] Rate limit detected in line: %s\n", line)
			te.statusCallback(models.StatusUpdateMessage{
				Type:   models.TypeStatusUpdate,
				TaskID: taskID,
				Status: models.StatusRateLimited,
			})
		}
	}

	fmt.Printf("[DEBUG] Finished %s stream for task %d (read %d lines)\n", streamType, taskID, lineCount)

	if err := scanner.Err(); err != nil {
		// Ignore "file already closed" and "EOF" errors - these are expected when command completes
		errStr := err.Error()
		if errStr != "EOF" && !strings.Contains(errStr, "file already closed") {
			fmt.Printf("[DEBUG] Scanner error: %v\n", err)
			te.logCallback(models.LogMessage{
				Type:    models.TypeLog,
				TaskID:  taskID,
				Line:    fmt.Sprintf("Error reading output: %v", err),
				IsError: true,
			})
		}
	}
}

// streamOutputRealtime provides character-level streaming for real-time output
// Use this when immediate feedback is more important than line-buffered output
// Enable with AAW_REALTIME_STREAMING=true environment variable
func (te *TaskExecutor) streamOutputRealtime(taskID int64, reader io.Reader, isError bool) {
	buf := make([]byte, 1024)
	var lineBuffer strings.Builder

	streamType := "stdout"
	if isError {
		streamType = "stderr"
	}
	fmt.Printf("[DEBUG] Starting realtime %s stream for task %d\n", streamType, taskID)

	lineCount := 0
	for {
		n, err := reader.Read(buf)
		if n > 0 {
			for i := 0; i < n; i++ {
				if buf[i] == '\n' {
					// Send complete line
					line := lineBuffer.String()
					lineCount++
					fmt.Printf("[DEBUG] Task %d %s line %d: %s\n", taskID, streamType, lineCount, line)

					te.logCallback(models.LogMessage{
						Type:    models.TypeLog,
						TaskID:  taskID,
						Line:    line,
						IsError: isError,
					})

					// Check for rate limit in the line
					if te.matcher.IsRateLimitDetected(line) {
						fmt.Printf("[DEBUG] Rate limit detected in line: %s\n", line)
						te.statusCallback(models.StatusUpdateMessage{
							Type:   models.TypeStatusUpdate,
							TaskID: taskID,
							Status: models.StatusRateLimited,
						})
					}

					lineBuffer.Reset()
				} else {
					lineBuffer.WriteByte(buf[i])
				}
			}
		}

		if err == io.EOF {
			// Send remaining buffer content as final line
			if lineBuffer.Len() > 0 {
				line := lineBuffer.String()
				lineCount++
				fmt.Printf("[DEBUG] Task %d %s line %d (final): %s\n", taskID, streamType, lineCount, line)

				te.logCallback(models.LogMessage{
					Type:    models.TypeLog,
					TaskID:  taskID,
					Line:    line,
					IsError: isError,
				})

				// Check for rate limit in the final line
				if te.matcher.IsRateLimitDetected(line) {
					fmt.Printf("[DEBUG] Rate limit detected in final line: %s\n", line)
					te.statusCallback(models.StatusUpdateMessage{
						Type:   models.TypeStatusUpdate,
						TaskID: taskID,
						Status: models.StatusRateLimited,
					})
				}
			}
			break
		}

		if err != nil {
			// Log unexpected errors but don't spam for expected closures
			errStr := err.Error()
			if errStr != "EOF" && !strings.Contains(errStr, "file already closed") {
				log.Printf("[Executor] Error reading output for task %d: %v", taskID, err)
			}
			break
		}
	}

	fmt.Printf("[DEBUG] Finished realtime %s stream for task %d (read %d lines)\n", streamType, taskID, lineCount)
}

// registerTask adds a running task to the tracking map
func (te *TaskExecutor) registerTask(task *RunningTask) {
	te.mu.Lock()
	defer te.mu.Unlock()
	te.runningTasks[task.TaskID] = task
	fmt.Printf("[DEBUG] Registered task %d (pgid: %d)\n", task.TaskID, task.Pgid)
}

// unregisterTask removes a task from the tracking map
func (te *TaskExecutor) unregisterTask(taskID int64) {
	te.mu.Lock()
	defer te.mu.Unlock()
	delete(te.runningTasks, taskID)
	fmt.Printf("[DEBUG] Unregistered task %d\n", taskID)
}

// getRunningTask retrieves a running task by ID (thread-safe)
func (te *TaskExecutor) getRunningTask(taskID int64) (*RunningTask, bool) {
	te.mu.RLock()
	defer te.mu.RUnlock()
	task, exists := te.runningTasks[taskID]
	return task, exists
}

// IsTaskRunning checks if a task is currently running
func (te *TaskExecutor) IsTaskRunning(taskID int64) bool {
	_, exists := te.getRunningTask(taskID)
	return exists
}

// CancelTask gracefully cancels a running task
// Sends SIGTERM first and waits for graceful shutdown, then SIGKILL if needed
// ✅ FIX: Added process verification to ensure task actually terminates
func (te *TaskExecutor) CancelTask(taskID int64) error {
	task, exists := te.getRunningTask(taskID)
	if !exists {
		return fmt.Errorf("task %d is not running", taskID)
	}

	fmt.Printf("[CANCEL] Sending SIGTERM to task %d (pgid: %d)\n", taskID, task.Pgid)

	// Send SIGTERM to the entire process group (negative pgid)
	if err := syscall.Kill(-task.Pgid, syscall.SIGTERM); err != nil {
		// Process might already be gone
		if err != syscall.ESRCH {
			fmt.Printf("[CANCEL] Error sending SIGTERM to task %d: %v\n", taskID, err)
			return fmt.Errorf("failed to send SIGTERM: %w", err)
		}
	}

	// ✅ FIX: Wait with verification - poll task state with proper timeout handling
	done := make(chan bool, 1)
	go func() {
		ticker := time.NewTicker(100 * time.Millisecond)
		defer ticker.Stop()

		// Poll for 10 seconds (100 iterations * 100ms)
		for i := 0; i < 100; i++ {
			<-ticker.C
			if !te.IsTaskRunning(taskID) {
				done <- true
				return
			}
		}
		done <- false
	}()

	select {
	case success := <-done:
		if success {
			fmt.Printf("[CANCEL] Task %d terminated gracefully\n", taskID)
			return nil
		} else {
			fmt.Printf("[CANCEL] Task %d didn't terminate after 10s, escalating to SIGKILL\n", taskID)
			return te.ForceKillTask(taskID)
		}
	case <-time.After(11 * time.Second):
		// Safety timeout in case goroutine hangs
		return fmt.Errorf("cancellation timeout")
	}
}

// ForceKillTask immediately kills a running task with SIGKILL
func (te *TaskExecutor) ForceKillTask(taskID int64) error {
	task, exists := te.getRunningTask(taskID)
	if !exists {
		return fmt.Errorf("task %d is not running", taskID)
	}

	fmt.Printf("[KILL] Sending SIGKILL to task %d (pgid: %d)\n", taskID, task.Pgid)

	// Cancel the context first
	task.Cancel()

	// Send SIGKILL to the entire process group (negative pgid)
	if err := syscall.Kill(-task.Pgid, syscall.SIGKILL); err != nil {
		// Process might already be gone
		if err == syscall.ESRCH {
			fmt.Printf("[KILL] Task %d process already terminated\n", taskID)
			return nil
		}
		return fmt.Errorf("failed to kill task %d: %w", taskID, err)
	}

	fmt.Printf("[KILL] Task %d killed successfully\n", taskID)
	return nil
}
