package main

import (
	"log"
	"os"
	"os/signal"
	"syscall"

	"github.com/berno/aaw-runner/internal/websocket"
)

func main() {
	log.Println("Starting AAW Runner...")

	// WebSocket server URL
	// Try AAW_BACKEND_URL first (new standard), fallback to AAW_SERVER_URL (legacy)
	serverURL := os.Getenv("AAW_BACKEND_URL")
	if serverURL == "" {
		serverURL = os.Getenv("AAW_SERVER_URL")
	}
	if serverURL == "" {
		serverURL = "ws://localhost:8080/ws/logs"
	}

	log.Printf("Connecting to backend at: %s", serverURL)

	// Create and connect WebSocket client
	client := websocket.NewClient(serverURL)

	if err := client.Connect(); err != nil {
		log.Fatalf("Failed to connect: %v", err)
	}
	defer client.Close()

	// Handle graceful shutdown
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)

	// Start listening in a goroutine
	errChan := make(chan error, 1)
	go func() {
		errChan <- client.Listen()
	}()

	// Wait for shutdown signal or error
	select {
	case <-sigChan:
		log.Println("Shutdown signal received, closing connection...")
	case err := <-errChan:
		if err != nil {
			log.Printf("Connection error: %v", err)
		}
	}

	log.Println("AAW Runner stopped")
}
