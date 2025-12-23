package websocket

import (
	"encoding/json"
	"fmt"
	"log"
	"os"
	"time"

	"github.com/berno/aaw-runner/internal/executor"
	"github.com/berno/aaw-runner/internal/models"
	"github.com/gorilla/websocket"
)

// Client represents a WebSocket client connection
type Client struct {
	serverURL string
	conn      *websocket.Conn
	executor  *executor.TaskExecutor
}

// NewClient creates a new WebSocket client
func NewClient(serverURL string) *Client {
	client := &Client{
		serverURL: serverURL,
	}

	// Create executor with callbacks
	client.executor = executor.NewTaskExecutor(
		client.sendLogMessage,
		client.sendStatusUpdate,
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

		default:
			log.Printf("Unknown message type: %s", baseMsg.Type)
		}
	}
}

// handleExecute processes an EXECUTE command from the server
func (c *Client) handleExecute(msg models.ExecuteMessage) {
	var err error

	// Determine execution type: dynamic (script content) vs legacy (script path)
	if msg.ScriptContent != "" {
		// Dynamic execution with inline script content
		log.Printf("Executing task %d (dynamic): session=%s, skip_permissions=%v", msg.TaskID, msg.SessionMode, msg.SkipPermissions)
		err = c.executor.ExecuteDynamic(msg.TaskID, msg.ScriptContent, msg.SkipPermissions, msg.SessionMode)
	} else {
		// Legacy execution with script path
		log.Printf("Executing task %d (legacy): %s", msg.TaskID, msg.Script)
		err = c.executor.Execute(msg.TaskID, msg.Script)
	}

	if err != nil {
		log.Printf("Task %d failed: %v", msg.TaskID, err)

		// Send failure status
		c.sendStatusUpdate(models.StatusUpdateMessage{
			Type:   models.TypeStatusUpdate,
			TaskID: msg.TaskID,
			Status: models.StatusFailed,
		})
	} else {
		log.Printf("Task %d completed successfully", msg.TaskID)

		// Send completion status
		c.sendStatusUpdate(models.StatusUpdateMessage{
			Type:   models.TypeStatusUpdate,
			TaskID: msg.TaskID,
			Status: models.StatusCompleted,
		})
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

// sendJSON sends a JSON message to the server
func (c *Client) sendJSON(v interface{}) error {
	c.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
	return c.conn.WriteJSON(v)
}

// Close closes the WebSocket connection
func (c *Client) Close() error {
	return c.conn.Close()
}
