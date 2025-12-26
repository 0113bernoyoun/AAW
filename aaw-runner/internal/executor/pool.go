package executor

import (
	"log"
	"sync"

	"github.com/berno/aaw-runner/internal/models"
	"github.com/berno/aaw-runner/internal/runner"
)

// ExecutorPool manages concurrent task execution
type ExecutorPool struct {
	executor     *TaskExecutor
	stateManager *runner.TaskStateManager
	taskQueue    chan models.ExecuteMessage
	maxWorkers   int
	wg           sync.WaitGroup
	stopChan     chan struct{}
	onCapacityChange func(maxParallel, running, available int)
	onTaskComplete   func(taskID int64, success bool, errorMsg string)
}

// NewExecutorPool creates a new executor pool
func NewExecutorPool(
	executor *TaskExecutor,
	maxWorkers int,
	onCapacityChange func(maxParallel, running, available int),
	onTaskComplete func(taskID int64, success bool, errorMsg string),
) *ExecutorPool {
	if maxWorkers <= 0 {
		maxWorkers = runner.GetMaxParallel()
	}

	stateManager := runner.NewTaskStateManager(maxWorkers, nil)

	pool := &ExecutorPool{
		executor:         executor,
		stateManager:     stateManager,
		taskQueue:        make(chan models.ExecuteMessage, 100), // Buffered queue
		maxWorkers:       maxWorkers,
		stopChan:         make(chan struct{}),
		onCapacityChange: onCapacityChange,
		onTaskComplete:   onTaskComplete,
	}

	log.Printf("[POOL] Executor pool created: maxWorkers=%d", maxWorkers)
	return pool
}

// Start launches the worker goroutines
func (p *ExecutorPool) Start() {
	log.Printf("[POOL] Starting %d workers", p.maxWorkers)
	for i := 0; i < p.maxWorkers; i++ {
		p.wg.Add(1)
		go p.worker(i)
	}
}

// Stop gracefully stops the pool
func (p *ExecutorPool) Stop() {
	log.Println("[POOL] Stopping executor pool")
	close(p.stopChan)
	p.wg.Wait()
	log.Println("[POOL] Executor pool stopped")
}

// Submit adds a task to the execution queue
// Returns false if the pool is at capacity
func (p *ExecutorPool) Submit(msg models.ExecuteMessage) bool {
	if !p.stateManager.CanAcceptNewTask() {
		log.Printf("[POOL] Cannot accept task %d: pool at capacity", msg.TaskID)
		return false
	}

	// Mark task as running in state manager
	p.stateManager.SetTaskState(msg.TaskID, runner.TaskStateRunning)

	// Report capacity change
	p.reportCapacity()

	// Submit to queue (non-blocking with buffered channel)
	select {
	case p.taskQueue <- msg:
		log.Printf("[POOL] Task %d submitted to queue", msg.TaskID)
		return true
	default:
		// Queue is full, revert state
		p.stateManager.SetTaskState(msg.TaskID, runner.TaskStateFailed)
		log.Printf("[POOL] Task %d rejected: queue full", msg.TaskID)
		p.reportCapacity()
		return false
	}
}

// CanAccept returns true if the pool can accept more tasks
func (p *ExecutorPool) CanAccept() bool {
	return p.stateManager.CanAcceptNewTask()
}

// GetCapacity returns the current capacity information
func (p *ExecutorPool) GetCapacity() (maxParallel, running, available int) {
	return p.stateManager.GetCapacity()
}

// IsTaskRunning checks if a specific task is currently running
func (p *ExecutorPool) IsTaskRunning(taskID int64) bool {
	state, exists := p.stateManager.GetTaskState(taskID)
	return exists && (state == runner.TaskStateRunning || state == runner.TaskStateCancelling)
}

// CancelTask attempts to cancel a running task
func (p *ExecutorPool) CancelTask(taskID int64) error {
	p.stateManager.SetTaskState(taskID, runner.TaskStateCancelling)
	return p.executor.CancelTask(taskID)
}

// ForceKillTask immediately kills a running task
func (p *ExecutorPool) ForceKillTask(taskID int64) error {
	return p.executor.ForceKillTask(taskID)
}

// worker processes tasks from the queue
func (p *ExecutorPool) worker(id int) {
	defer p.wg.Done()
	log.Printf("[POOL] Worker %d started", id)

	for {
		select {
		case <-p.stopChan:
			log.Printf("[POOL] Worker %d stopping", id)
			return
		case msg := <-p.taskQueue:
			p.executeTask(id, msg)
		}
	}
}

// executeTask runs a single task
func (p *ExecutorPool) executeTask(workerID int, msg models.ExecuteMessage) {
	log.Printf("[POOL] Worker %d executing task %d", workerID, msg.TaskID)

	var err error

	// Execute based on message type
	if msg.ScriptContent != "" {
		// Dynamic execution
		err = p.executor.ExecuteDynamic(msg.TaskID, msg.ScriptContent, msg.SkipPermissions, msg.SessionMode)
	} else if msg.Script != "" {
		// Legacy execution
		err = p.executor.Execute(msg.TaskID, msg.Script)
	} else {
		log.Printf("[POOL] Worker %d: task %d has no script content", workerID, msg.TaskID)
		err = nil
	}

	success := err == nil
	errorMsg := ""
	if err != nil {
		errorMsg = err.Error()
		// Check if this was a cancellation
		if errorMsg == "task cancelled" {
			p.stateManager.SetTaskState(msg.TaskID, runner.TaskStateCancelled)
		} else {
			p.stateManager.SetTaskState(msg.TaskID, runner.TaskStateFailed)
		}
	} else {
		p.stateManager.SetTaskState(msg.TaskID, runner.TaskStateCompleted)
	}

	log.Printf("[POOL] Worker %d completed task %d (success=%v)", workerID, msg.TaskID, success)

	// Report capacity change
	p.reportCapacity()

	// Notify completion callback
	if p.onTaskComplete != nil {
		p.onTaskComplete(msg.TaskID, success, errorMsg)
	}
}

// reportCapacity sends current capacity to the callback
func (p *ExecutorPool) reportCapacity() {
	if p.onCapacityChange != nil {
		max, running, available := p.stateManager.GetCapacity()
		p.onCapacityChange(max, running, available)
	}
}
