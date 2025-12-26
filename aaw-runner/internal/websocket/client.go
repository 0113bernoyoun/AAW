package websocket

import (
	"encoding/json"
	"fmt"
	"log"
	"os"
	"sync"
	"time"

	"github.com/berno/aaw-runner/internal/executor"
	"github.com/berno/aaw-runner/internal/models"
	"github.com/berno/aaw-runner/internal/runner"
	"github.com/gorilla/websocket"
)

// Client represents a WebSocket client connection
type Client struct {
	serverURL    string
	conn         *websocket.Conn
	connMutex    sync.Mutex // Mutex to prevent concurrent writes to WebSocket
	executor     *executor.TaskExecutor
	pool         *executor.ExecutorPool
	stateMachine *runner.StateMachine
}

// NewClient creates a new WebSocket client
func NewClient(serverURL string) *Client {
	client := &Client{
		serverURL: serverURL,
	}

	// Create state machine with callback (for backward compatibility)
	client.stateMachine = runner.NewStateMachine(client.sendRunnerStatus)

	// Create executor with callbacks
	client.executor = executor.NewTaskExecutor(
		client.sendLogMessage,
		client.sendStatusUpdate,
	)

	// Create executor pool for concurrent task execution
	maxParallel := runner.GetMaxParallel()
	client.pool = executor.NewExecutorPool(
		client.executor,
		maxParallel,
		client.sendCapacityUpdate,
		client.onTaskComplete,
	)

	return client
}

// Connect establishes WebSocket connection and sends HELO
func (c *Client) Connect() error {
	var err error
	c.conn, _, err = websocket.DefaultDialer.Dial(c.serverURL, nil)
	if err != nil {
		return fmt.Errorf("failed to connect to server: %w", err)
	}

	// Send HELO handshake
	hostname, _ := os.Hostname()
	workdir, _ := os.Getwd()

	heloMsg := models.HeloMessage{
		Type:     models.TypeHelo,
		Hostname: hostname,
		Workdir:  workdir,
	}

	if err := c.sendJSON(heloMsg); err != nil {
		return fmt.Errorf("failed to send HELO: %w", err)
	}

	log.Printf("Connected to server at %s (hostname: %s, workdir: %s)", c.serverURL, hostname, workdir)

	// Start the executor pool
	c.pool.Start()

	// Send initial IDLE status (for backward compatibility)
	c.sendRunnerStatus(runner.StateIdle)

	// Send initial capacity
	max, running, available := c.pool.GetCapacity()
	c.sendCapacityUpdate(max, running, available)

	return nil
}

// Listen starts listening for messages from the server
func (c *Client) Listen() error {
	defer c.conn.Close()

	for {
		_, message, err := c.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("WebSocket error: %v", err)
			}
			return err
		}

		// Parse message type
		var baseMsg struct {
			Type string `json:"type"`
		}
		if err := json.Unmarshal(message, &baseMsg); err != nil {
			log.Printf("Failed to parse message: %v", err)
			continue
		}

		// Handle different message types
		switch baseMsg.Type {
		case models.TypeExecute:
			var execMsg models.ExecuteMessage
			if err := json.Unmarshal(message, &execMsg); err != nil {
				log.Printf("Failed to parse EXECUTE message: %v", err)
				continue
			}
			go c.handleExecute(execMsg)

		case models.TypeCancelTask:
			var cancelMsg models.CancelTaskMessage
			if err := json.Unmarshal(message, &cancelMsg); err != nil {
				log.Printf("Failed to parse CANCEL_TASK message: %v", err)
				continue
			}
			go c.handleCancelTask(cancelMsg)

		case models.TypeKillTask:
			var killMsg models.KillTaskMessage
			if err := json.Unmarshal(message, &killMsg); err != nil {
				log.Printf("Failed to parse KILL_TASK message: %v", err)
				continue
			}
			go c.handleKillTask(killMsg)

		default:
			log.Printf("Unknown message type: %s", baseMsg.Type)
		}
	}
}

// handleExecute processes an EXECUTE command from the server
func (c *Client) handleExecute(msg models.ExecuteMessage) {
	// Submit task to the executor pool for concurrent execution
	if !c.pool.Submit(msg) {
		// Pool rejected the task (at capacity or queue full)
		log.Printf("Task %d rejected: pool at capacity", msg.TaskID)

		// Send failure status update
		c.sendStatusUpdate(models.StatusUpdateMessage{
			Type:   models.TypeStatusUpdate,
			TaskID: msg.TaskID,
			Status: models.StatusFailed,
		})

		// Send TASK_COMPLETED with failure
		c.sendTaskCompleted(models.TaskCompletedMessage{
			Type:    models.TypeTaskCompleted,
			TaskID:  msg.TaskID,
			Success: false,
			Error:   "Runner at capacity - task rejected",
		})
	}
	// Note: Actual execution and completion handling is done by the pool's callbacks
}

// onTaskComplete is called by the executor pool when a task completes
func (c *Client) onTaskComplete(taskID int64, success bool, errorMsg string) {
	// Send status update
	status := models.StatusCompleted
	if !success {
		status = models.StatusFailed
		if errorMsg == "task cancelled" {
			status = models.StatusCancelled
		}
	}

	c.sendStatusUpdate(models.StatusUpdateMessage{
		Type:   models.TypeStatusUpdate,
		TaskID: taskID,
		Status: status,
	})

	// Send TASK_COMPLETED message
	c.sendTaskCompleted(models.TaskCompletedMessage{
		Type:    models.TypeTaskCompleted,
		TaskID:  taskID,
		Success: success,
		Error:   errorMsg,
	})

	// Update legacy state machine based on pool capacity
	_, running, _ := c.pool.GetCapacity()
	if running == 0 {
		c.stateMachine.SetState(runner.StateIdle)
	} else {
		c.stateMachine.SetState(runner.StateBusy)
	}
}

// sendLogMessage sends a log message to the server
func (c *Client) sendLogMessage(msg models.LogMessage) {
	log.Printf("[WS] Sending LOG: task=%d, line=%s", msg.TaskID, msg.Line)
	if err := c.sendJSON(msg); err != nil {
		log.Printf("Failed to send log message: %v", err)
	}
}

// sendStatusUpdate sends a status update to the server
func (c *Client) sendStatusUpdate(msg models.StatusUpdateMessage) {
	if err := c.sendJSON(msg); err != nil {
		log.Printf("Failed to send status update: %v", err)
	}
}

// sendRunnerStatus sends runner state to the server
func (c *Client) sendRunnerStatus(state runner.RunnerState) {
	msg := models.RunnerStatusMessage{
		Type:   models.TypeRunnerStatus,
		Status: state.String(),
	}

	log.Printf("[WS] Sending RUNNER_STATUS: %s", state.String())
	if err := c.sendJSON(msg); err != nil {
		log.Printf("Failed to send runner status: %v", err)
	}
}

// sendCapacityUpdate sends current capacity to the server
func (c *Client) sendCapacityUpdate(maxParallel, running, available int) {
	msg := models.RunnerCapacityMessage{
		Type:           models.TypeRunnerCapacity,
		MaxParallel:    maxParallel,
		RunningTasks:   running,
		AvailableSlots: available,
	}

	log.Printf("[WS] Sending RUNNER_CAPACITY: max=%d, running=%d, available=%d", maxParallel, running, available)
	if err := c.sendJSON(msg); err != nil {
		log.Printf("Failed to send runner capacity: %v", err)
	}
}

// sendTaskCompleted sends task completion notification to the server
func (c *Client) sendTaskCompleted(msg models.TaskCompletedMessage) {
	log.Printf("[WS] Sending TASK_COMPLETED: task=%d, success=%v", msg.TaskID, msg.Success)
	if err := c.sendJSON(msg); err != nil {
		log.Printf("Failed to send task completed: %v", err)
	}
}

// sendJSON sends a JSON message to the server
func (c *Client) sendJSON(v interface{}) error {
	c.connMutex.Lock()
	defer c.connMutex.Unlock()
	c.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
	return c.conn.WriteJSON(v)
}

// Close closes the WebSocket connection and stops the executor pool
func (c *Client) Close() error {
	// Stop the executor pool
	if c.pool != nil {
		c.pool.Stop()
	}
	return c.conn.Close()
}

// handleCancelTask processes a CANCEL_TASK command from the server
func (c *Client) handleCancelTask(msg models.CancelTaskMessage) {
	log.Printf("[WS] Received CANCEL_TASK for task %d", msg.TaskID)

	err := c.pool.CancelTask(msg.TaskID)
	c.sendCancelAck(msg.TaskID, models.StatusCancelled, err == nil, errorToString(err))

	// Send status update if cancellation was successful
	if err == nil {
		c.sendStatusUpdate(models.StatusUpdateMessage{
			Type:   models.TypeStatusUpdate,
			TaskID: msg.TaskID,
			Status: models.StatusCancelled,
		})
	}
}

// handleKillTask processes a KILL_TASK command from the server
func (c *Client) handleKillTask(msg models.KillTaskMessage) {
	log.Printf("[WS] Received KILL_TASK for task %d", msg.TaskID)

	err := c.pool.ForceKillTask(msg.TaskID)
	c.sendCancelAck(msg.TaskID, "KILLED", err == nil, errorToString(err))

	// Send status update if kill was successful
	if err == nil {
		c.sendStatusUpdate(models.StatusUpdateMessage{
			Type:   models.TypeStatusUpdate,
			TaskID: msg.TaskID,
			Status: models.StatusCancelled,
		})
	}
}

// sendCancelAck sends acknowledgment of cancel/kill request
func (c *Client) sendCancelAck(taskID int64, status string, success bool, errMsg string) {
	ack := models.CancelAckMessage{
		Type:    models.TypeCancelAck,
		TaskID:  taskID,
		Status:  status,
		Success: success,
		Error:   errMsg,
	}

	log.Printf("[WS] Sending CANCEL_ACK: task=%d, status=%s, success=%v", taskID, status, success)
	if err := c.sendJSON(ack); err != nil {
		log.Printf("Failed to send cancel ack: %v", err)
	}
}

// errorToString converts an error to a string, returning empty string for nil
func errorToString(err error) string {
	if err == nil {
		return ""
	}
	return err.Error()
}
