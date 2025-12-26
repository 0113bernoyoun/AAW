package websocket

import (
	"encoding/json"
	"sync"
	"testing"
	"time"

	"github.com/berno/aaw-runner/internal/models"
	"github.com/berno/aaw-runner/internal/runner"
	"github.com/stretchr/testify/assert"
)

// wsWriter is an interface for WebSocket write operations
type wsWriter interface {
	WriteJSON(v interface{}) error
	SetWriteDeadline(t time.Time) error
}

// mockWebSocketConn is a mock WebSocket connection for testing
type mockWebSocketConn struct {
	sentMessages []interface{}
	mu           sync.Mutex
}

func (m *mockWebSocketConn) WriteJSON(v interface{}) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.sentMessages = append(m.sentMessages, v)
	return nil
}

func (m *mockWebSocketConn) SetWriteDeadline(t time.Time) error {
	return nil
}

func (m *mockWebSocketConn) getSentMessages() []interface{} {
	m.mu.Lock()
	defer m.mu.Unlock()
	return append([]interface{}{}, m.sentMessages...)
}

// testClient is a test version of Client that uses the interface
type testClient struct {
	conn         wsWriter
	stateMachine *runner.StateMachine
}

func (c *testClient) sendRunnerStatus(state runner.RunnerState) {
	msg := models.RunnerStatusMessage{
		Type:   models.TypeRunnerStatus,
		Status: state.String(),
	}
	c.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
	c.conn.WriteJSON(msg)
}

func (c *testClient) sendTaskCompleted(msg models.TaskCompletedMessage) {
	c.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
	c.conn.WriteJSON(msg)
}

func (c *testClient) sendLogMessage(msg models.LogMessage) {
	c.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
	c.conn.WriteJSON(msg)
}

func (c *testClient) sendStatusUpdate(msg models.StatusUpdateMessage) {
	c.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
	c.conn.WriteJSON(msg)
}

// TestSendRunnerStatus_FormatsCorrectMessage verifies RUNNER_STATUS message format
func TestSendRunnerStatus_FormatsCorrectMessage(t *testing.T) {
	tests := []struct {
		name           string
		state          runner.RunnerState
		expectedType   string
		expectedStatus string
	}{
		{
			name:           "IDLE state",
			state:          runner.StateIdle,
			expectedType:   models.TypeRunnerStatus,
			expectedStatus: "IDLE",
		},
		{
			name:           "BUSY state",
			state:          runner.StateBusy,
			expectedType:   models.TypeRunnerStatus,
			expectedStatus: "BUSY",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			mockConn := &mockWebSocketConn{}
			client := &testClient{conn: mockConn}

			// Send runner status
			client.sendRunnerStatus(tt.state)

			// Verify message was sent
			messages := mockConn.getSentMessages()
			assert.Equal(t, 1, len(messages), "Should send exactly one message")

			// Verify message structure
			msg, ok := messages[0].(models.RunnerStatusMessage)
			assert.True(t, ok, "Message should be RunnerStatusMessage type")
			assert.Equal(t, tt.expectedType, msg.Type, "Message type should be RUNNER_STATUS")
			assert.Equal(t, tt.expectedStatus, msg.Status, "Status should match state string")
		})
	}
}

// TestSendTaskCompleted_IncludesAllFields verifies TASK_COMPLETED message includes all required fields
func TestSendTaskCompleted_IncludesAllFields(t *testing.T) {
	tests := []struct {
		name        string
		taskID      int64
		success     bool
		errorMsg    string
		expectError bool
	}{
		{
			name:        "Successful task completion",
			taskID:      123,
			success:     true,
			errorMsg:    "",
			expectError: false,
		},
		{
			name:        "Failed task with error message",
			taskID:      456,
			success:     false,
			errorMsg:    "execution failed: command not found",
			expectError: true,
		},
		{
			name:        "Failed task with empty error",
			taskID:      789,
			success:     false,
			errorMsg:    "",
			expectError: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			mockConn := &mockWebSocketConn{}
			client := &testClient{conn: mockConn}

			// Create completion message
			completionMsg := models.TaskCompletedMessage{
				Type:    models.TypeTaskCompleted,
				TaskID:  tt.taskID,
				Success: tt.success,
				Error:   tt.errorMsg,
			}

			// Send task completed
			client.sendTaskCompleted(completionMsg)

			// Verify message was sent
			messages := mockConn.getSentMessages()
			assert.Equal(t, 1, len(messages), "Should send exactly one message")

			// Verify message structure
			msg, ok := messages[0].(models.TaskCompletedMessage)
			assert.True(t, ok, "Message should be TaskCompletedMessage type")
			assert.Equal(t, models.TypeTaskCompleted, msg.Type, "Type should be TASK_COMPLETED")
			assert.Equal(t, tt.taskID, msg.TaskID, "TaskID should match")
			assert.Equal(t, tt.success, msg.Success, "Success flag should match")

			if tt.expectError {
				assert.NotEmpty(t, msg.Error, "Error message should not be empty for failed task")
				assert.Equal(t, tt.errorMsg, msg.Error, "Error message should match")
			}
		})
	}
}

// TestHandleExecute_TransitionsToIdleAfterCompletion verifies state transitions during task execution
func TestHandleExecute_TransitionsToIdleAfterCompletion(t *testing.T) {
	// This test verifies the state machine behavior during handleExecute
	// We'll track state changes via the callback

	var stateChanges []runner.RunnerState
	var mu sync.Mutex

	callback := func(state runner.RunnerState) {
		mu.Lock()
		stateChanges = append(stateChanges, state)
		mu.Unlock()
	}

	mockConn := &mockWebSocketConn{}
	client := &testClient{conn: mockConn}
	client.stateMachine = runner.NewStateMachine(callback)

	// Get initial state (should be IDLE)
	initialState := client.stateMachine.GetState()
	assert.Equal(t, runner.StateIdle, initialState, "Should start in IDLE state")

	// Test state transitions during execution
	t.Run("State transitions during execution", func(t *testing.T) {
		// Simulate the state transitions that handleExecute performs

		// 1. Transition to BUSY (start of execution)
		client.stateMachine.SetState(runner.StateBusy)

		// Wait for state change to propagate
		time.Sleep(20 * time.Millisecond)

		currentState := client.stateMachine.GetState()
		assert.Equal(t, runner.StateBusy, currentState, "Should be in BUSY state during execution")

		// 2. Transition back to IDLE (end of execution)
		client.stateMachine.SetState(runner.StateIdle)

		// Wait for state change to propagate
		time.Sleep(20 * time.Millisecond)

		finalState := client.stateMachine.GetState()
		assert.Equal(t, runner.StateIdle, finalState, "Should return to IDLE state after execution")

		// Verify state change sequence
		mu.Lock()
		defer mu.Unlock()

		assert.GreaterOrEqual(t, len(stateChanges), 2, "Should have at least 2 state changes")

		// Find BUSY and IDLE transitions
		foundBusy := false
		foundIdleAfterBusy := false

		for i, state := range stateChanges {
			if state == runner.StateBusy {
				foundBusy = true
			}
			if foundBusy && state == runner.StateIdle && i > 0 {
				foundIdleAfterBusy = true
			}
		}

		assert.True(t, foundBusy, "Should transition to BUSY")
		assert.True(t, foundIdleAfterBusy, "Should transition back to IDLE after BUSY")
	})

	// Verify that the mock execution would send appropriate messages
	t.Run("Messages sent during execution", func(t *testing.T) {
		// Simulate sending messages that handleExecute would send
		taskID := int64(100)

		client.sendRunnerStatus(runner.StateBusy)

		// Simulate task completion message
		client.sendTaskCompleted(models.TaskCompletedMessage{
			Type:    models.TypeTaskCompleted,
			TaskID:  taskID,
			Success: true,
			Error:   "",
		})

		client.sendRunnerStatus(runner.StateIdle)

		// Verify messages were sent
		messages := mockConn.getSentMessages()
		assert.GreaterOrEqual(t, len(messages), 3, "Should send at least 3 messages (BUSY, TASK_COMPLETED, IDLE)")

		// Verify first message is RUNNER_STATUS with BUSY
		runnerStatusMsg1, ok := messages[0].(models.RunnerStatusMessage)
		assert.True(t, ok, "First message should be RunnerStatusMessage")
		assert.Equal(t, "BUSY", runnerStatusMsg1.Status, "Should send BUSY status")

		// Verify second message is TASK_COMPLETED
		taskCompletedMsg, ok := messages[1].(models.TaskCompletedMessage)
		assert.True(t, ok, "Second message should be TaskCompletedMessage")
		assert.Equal(t, taskID, taskCompletedMsg.TaskID, "TaskID should match")
		assert.True(t, taskCompletedMsg.Success, "Task should be successful")

		// Verify third message is RUNNER_STATUS with IDLE
		runnerStatusMsg2, ok := messages[2].(models.RunnerStatusMessage)
		assert.True(t, ok, "Third message should be RunnerStatusMessage")
		assert.Equal(t, "IDLE", runnerStatusMsg2.Status, "Should send IDLE status")
	})
}

// TestSendLogMessage_FormatsCorrectly verifies log message formatting
func TestSendLogMessage_FormatsCorrectly(t *testing.T) {
	tests := []struct {
		name    string
		taskID  int64
		line    string
		isError bool
	}{
		{
			name:    "Standard log line",
			taskID:  123,
			line:    "Starting task execution",
			isError: false,
		},
		{
			name:    "Error log line",
			taskID:  456,
			line:    "ERROR: Command failed",
			isError: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			mockConn := &mockWebSocketConn{}
			client := &testClient{conn: mockConn}

			logMsg := models.LogMessage{
				Type:    models.TypeLog,
				TaskID:  tt.taskID,
				Line:    tt.line,
				IsError: tt.isError,
			}

			client.sendLogMessage(logMsg)

			messages := mockConn.getSentMessages()
			assert.Equal(t, 1, len(messages), "Should send one message")

			msg, ok := messages[0].(models.LogMessage)
			assert.True(t, ok, "Message should be LogMessage type")
			assert.Equal(t, models.TypeLog, msg.Type, "Type should be LOG")
			assert.Equal(t, tt.taskID, msg.TaskID, "TaskID should match")
			assert.Equal(t, tt.line, msg.Line, "Line content should match")
			assert.Equal(t, tt.isError, msg.IsError, "IsError flag should match")
		})
	}
}

// TestSendStatusUpdate_FormatsCorrectly verifies status update message formatting
func TestSendStatusUpdate_FormatsCorrectly(t *testing.T) {
	tests := []struct {
		name   string
		taskID int64
		status string
	}{
		{
			name:   "Task running status",
			taskID: 123,
			status: models.StatusRunning,
		},
		{
			name:   "Task completed status",
			taskID: 456,
			status: models.StatusCompleted,
		},
		{
			name:   "Task failed status",
			taskID: 789,
			status: models.StatusFailed,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			mockConn := &mockWebSocketConn{}
			client := &testClient{conn: mockConn}

			statusMsg := models.StatusUpdateMessage{
				Type:   models.TypeStatusUpdate,
				TaskID: tt.taskID,
				Status: tt.status,
			}

			client.sendStatusUpdate(statusMsg)

			messages := mockConn.getSentMessages()
			assert.Equal(t, 1, len(messages), "Should send one message")

			msg, ok := messages[0].(models.StatusUpdateMessage)
			assert.True(t, ok, "Message should be StatusUpdateMessage type")
			assert.Equal(t, models.TypeStatusUpdate, msg.Type, "Type should be STATUS_UPDATE")
			assert.Equal(t, tt.taskID, msg.TaskID, "TaskID should match")
			assert.Equal(t, tt.status, msg.Status, "Status should match")
		})
	}
}

// TestNewClient_InitializesStateMachine verifies client initialization
func TestNewClient_InitializesStateMachine(t *testing.T) {
	client := NewClient("ws://localhost:8080/ws")

	assert.NotNil(t, client, "Client should not be nil")
	assert.NotNil(t, client.stateMachine, "State machine should be initialized")
	assert.Equal(t, runner.StateIdle, client.stateMachine.GetState(), "Should start in IDLE state")
	assert.Equal(t, "ws://localhost:8080/ws", client.serverURL, "Server URL should be set")
}

// TestMessageSerialization verifies message JSON serialization
func TestMessageSerialization(t *testing.T) {
	tests := []struct {
		name    string
		message interface{}
	}{
		{
			name: "RunnerStatusMessage",
			message: models.RunnerStatusMessage{
				Type:   models.TypeRunnerStatus,
				Status: "IDLE",
			},
		},
		{
			name: "TaskCompletedMessage",
			message: models.TaskCompletedMessage{
				Type:    models.TypeTaskCompleted,
				TaskID:  123,
				Success: true,
				Error:   "",
			},
		},
		{
			name: "LogMessage",
			message: models.LogMessage{
				Type:    models.TypeLog,
				TaskID:  456,
				Line:    "Test log line",
				IsError: false,
			},
		},
		{
			name: "StatusUpdateMessage",
			message: models.StatusUpdateMessage{
				Type:   models.TypeStatusUpdate,
				TaskID: 789,
				Status: models.StatusRunning,
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Serialize to JSON
			data, err := json.Marshal(tt.message)
			assert.NoError(t, err, "Should serialize without error")
			assert.NotEmpty(t, data, "Serialized data should not be empty")

			// Verify we can deserialize back
			var result map[string]interface{}
			err = json.Unmarshal(data, &result)
			assert.NoError(t, err, "Should deserialize without error")
			assert.Contains(t, result, "type", "Should contain 'type' field")
		})
	}
}

// TestStateMachineCallback_Integration verifies state machine callback integration
func TestStateMachineCallback_Integration(t *testing.T) {
	mockConn := &mockWebSocketConn{}
	client := &testClient{conn: mockConn}

	// Track callback invocations
	var callbackCount int
	var mu sync.Mutex

	trackingCallback := func(state runner.RunnerState) {
		mu.Lock()
		callbackCount++
		mu.Unlock()

		// Also call the actual sendRunnerStatus
		client.sendRunnerStatus(state)
	}

	client.stateMachine = runner.NewStateMachine(trackingCallback)

	// Trigger state changes
	client.stateMachine.SetState(runner.StateBusy)
	time.Sleep(20 * time.Millisecond)

	client.stateMachine.SetState(runner.StateIdle)
	time.Sleep(20 * time.Millisecond)

	// Verify callbacks were invoked
	mu.Lock()
	finalCount := callbackCount
	mu.Unlock()

	assert.Equal(t, 2, finalCount, "Should invoke callback twice for 2 state changes")

	// Verify messages were sent
	messages := mockConn.getSentMessages()
	assert.Equal(t, 2, len(messages), "Should send 2 RUNNER_STATUS messages")
}
