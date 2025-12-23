package executor

import (
	"bufio"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/berno/aaw-runner/internal/matcher"
	"github.com/berno/aaw-runner/internal/models"
)

// TaskExecutor executes shell scripts and streams output
type TaskExecutor struct {
	matcher       *matcher.PatternMatcher
	logCallback   func(models.LogMessage)
	statusCallback func(models.StatusUpdateMessage)
}

// NewTaskExecutor creates a new task executor
func NewTaskExecutor(
	logCallback func(models.LogMessage),
	statusCallback func(models.StatusUpdateMessage),
) *TaskExecutor {
	return &TaskExecutor{
		matcher:       matcher.NewPatternMatcher(),
		logCallback:   logCallback,
		statusCallback: statusCallback,
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

	// Build command arguments (SECURITY: using args array to prevent command injection)
	args := []string{}
	if skipPermissions {
		args = append(args, "--dangerously-skip-permissions")
	}
	args = append(args, scriptContent)

	// Create command
	cmd := exec.Command("claude", args...)

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
		errMsg := fmt.Sprintf("Failed to start claude command: %v", err)
		te.logCallback(models.LogMessage{
			Type:    models.TypeLog,
			TaskID:  taskID,
			Line:    errMsg,
			IsError: true,
		})
		return fmt.Errorf(errMsg)
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

	te.logCallback(models.LogMessage{
		Type:    models.TypeLog,
		TaskID:  taskID,
		Line:    "Dynamic execution completed",
		IsError: false,
	})

	return nil
}

// streamOutput reads from a pipe and sends log messages
func (te *TaskExecutor) streamOutput(taskID int64, reader io.Reader, isError bool) {
	scanner := bufio.NewScanner(reader)

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
