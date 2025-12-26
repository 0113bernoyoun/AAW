package runner

import (
	"log"
	"os"
	"strconv"
	"sync"
)

// RunnerState represents the current state of the runner
type RunnerState int

const (
	// StateIdle indicates the runner is waiting for tasks
	StateIdle RunnerState = iota
	// StateBusy indicates the runner is currently executing a task
	StateBusy
)

// String returns the string representation of the state
func (s RunnerState) String() string {
	switch s {
	case StateIdle:
		return "IDLE"
	case StateBusy:
		return "BUSY"
	default:
		return "UNKNOWN"
	}
}

// TaskState represents the state of an individual task
type TaskState int

const (
	TaskStateQueued TaskState = iota
	TaskStateRunning
	TaskStateCancelling
	TaskStateCompleted
	TaskStateFailed
	TaskStateCancelled
)

func (ts TaskState) String() string {
	switch ts {
	case TaskStateQueued:
		return "QUEUED"
	case TaskStateRunning:
		return "RUNNING"
	case TaskStateCancelling:
		return "CANCELLING"
	case TaskStateCompleted:
		return "COMPLETED"
	case TaskStateFailed:
		return "FAILED"
	case TaskStateCancelled:
		return "CANCELLED"
	default:
		return "UNKNOWN"
	}
}

// DefaultMaxParallel is the default number of concurrent tasks
const DefaultMaxParallel = 5

// GetMaxParallel returns the configured max parallel tasks from environment
func GetMaxParallel() int {
	if envVal := os.Getenv("AAW_MAX_PARALLEL_TASKS"); envVal != "" {
		if val, err := strconv.Atoi(envVal); err == nil && val > 0 {
			return val
		}
	}
	return DefaultMaxParallel
}

// TaskStateEntry holds state info for a task
type TaskStateEntry struct {
	TaskID int64
	State  TaskState
}

// TaskStateManager manages per-task states for concurrent execution
type TaskStateManager struct {
	states      map[int64]TaskState
	maxParallel int
	mu          sync.RWMutex
	onChange    func(int64, TaskState)
}

// NewTaskStateManager creates a new task state manager
func NewTaskStateManager(maxParallel int, onChange func(int64, TaskState)) *TaskStateManager {
	if maxParallel <= 0 {
		maxParallel = GetMaxParallel()
	}

	tsm := &TaskStateManager{
		states:      make(map[int64]TaskState),
		maxParallel: maxParallel,
		onChange:    onChange,
	}

	log.Printf("[STATE] Task state manager initialized: maxParallel=%d", maxParallel)
	return tsm
}

// SetTaskState updates the state of a specific task
func (tsm *TaskStateManager) SetTaskState(taskID int64, state TaskState) {
	tsm.mu.Lock()
	defer tsm.mu.Unlock()

	oldState, exists := tsm.states[taskID]

	// Remove completed/failed/cancelled tasks from tracking
	if state == TaskStateCompleted || state == TaskStateFailed || state == TaskStateCancelled {
		delete(tsm.states, taskID)
		log.Printf("[STATE] Task %d removed from tracking (state: %s)", taskID, state)
	} else {
		tsm.states[taskID] = state
		if exists {
			log.Printf("[STATE] Task %d state: %s -> %s", taskID, oldState, state)
		} else {
			log.Printf("[STATE] Task %d state: %s", taskID, state)
		}
	}

	// Trigger callback
	if tsm.onChange != nil {
		go tsm.onChange(taskID, state)
	}
}

// GetTaskState returns the state of a specific task
func (tsm *TaskStateManager) GetTaskState(taskID int64) (TaskState, bool) {
	tsm.mu.RLock()
	defer tsm.mu.RUnlock()
	state, exists := tsm.states[taskID]
	return state, exists
}

// GetRunningCount returns the number of currently running tasks
func (tsm *TaskStateManager) GetRunningCount() int {
	tsm.mu.RLock()
	defer tsm.mu.RUnlock()

	count := 0
	for _, state := range tsm.states {
		if state == TaskStateRunning || state == TaskStateCancelling {
			count++
		}
	}
	return count
}

// GetAvailableSlots returns the number of slots available for new tasks
func (tsm *TaskStateManager) GetAvailableSlots() int {
	return tsm.maxParallel - tsm.GetRunningCount()
}

// CanAcceptNewTask returns true if runner can accept more tasks
func (tsm *TaskStateManager) CanAcceptNewTask() bool {
	return tsm.GetAvailableSlots() > 0
}

// GetMaxParallelTasks returns the configured max parallel tasks
func (tsm *TaskStateManager) GetMaxParallelTasks() int {
	return tsm.maxParallel
}

// GetRunningTaskIDs returns a slice of currently running task IDs
func (tsm *TaskStateManager) GetRunningTaskIDs() []int64 {
	tsm.mu.RLock()
	defer tsm.mu.RUnlock()

	ids := make([]int64, 0)
	for taskID, state := range tsm.states {
		if state == TaskStateRunning || state == TaskStateCancelling {
			ids = append(ids, taskID)
		}
	}
	return ids
}

// GetCapacity returns capacity information for capacity reporting
func (tsm *TaskStateManager) GetCapacity() (maxParallel, running, available int) {
	tsm.mu.RLock()
	defer tsm.mu.RUnlock()

	running = 0
	for _, state := range tsm.states {
		if state == TaskStateRunning || state == TaskStateCancelling {
			running++
		}
	}

	return tsm.maxParallel, running, tsm.maxParallel - running
}

// StateMachine manages the runner's state transitions (legacy support)
// This is kept for backward compatibility but delegates to TaskStateManager
type StateMachine struct {
	state           RunnerState
	mu              sync.RWMutex
	onStateChange   func(RunnerState)
	taskStateManager *TaskStateManager
}

// NewStateMachine creates a new state machine with a callback for state changes
func NewStateMachine(callback func(RunnerState)) *StateMachine {
	sm := &StateMachine{
		state:         StateIdle,
		onStateChange: callback,
	}
	log.Println("[STATE] State machine initialized: IDLE")
	return sm
}

// SetState transitions to a new state and triggers the callback
func (sm *StateMachine) SetState(newState RunnerState) {
	sm.mu.Lock()
	defer sm.mu.Unlock()

	oldState := sm.state
	if oldState == newState {
		return // No change, skip callback
	}

	sm.state = newState
	log.Printf("[STATE] Transition: %s -> %s", oldState, newState)

	// Trigger callback if registered
	if sm.onStateChange != nil {
		go sm.onStateChange(newState)
	}
}

// GetState returns the current state (thread-safe read)
func (sm *StateMachine) GetState() RunnerState {
	sm.mu.RLock()
	defer sm.mu.RUnlock()
	return sm.state
}

// IsIdle returns true if the runner is in IDLE state
func (sm *StateMachine) IsIdle() bool {
	return sm.GetState() == StateIdle
}
