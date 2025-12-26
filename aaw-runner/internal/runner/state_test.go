package runner

import (
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
)

// TestNewStateMachine_InitializesAsIdle verifies that a new state machine starts in IDLE state
func TestNewStateMachine_InitializesAsIdle(t *testing.T) {
	sm := NewStateMachine(nil)

	assert.NotNil(t, sm, "StateMachine should not be nil")
	assert.Equal(t, StateIdle, sm.GetState(), "Initial state should be IDLE")
}

// TestSetState_TransitionsFromIdleToBusy verifies state transition from IDLE to BUSY
func TestSetState_TransitionsFromIdleToBusy(t *testing.T) {
	sm := NewStateMachine(nil)

	// Verify initial state
	assert.Equal(t, StateIdle, sm.GetState(), "Should start in IDLE state")

	// Transition to BUSY
	sm.SetState(StateBusy)

	// Verify transition
	assert.Equal(t, StateBusy, sm.GetState(), "State should transition to BUSY")
}

// TestSetState_TransitionsFromBusyToIdle verifies state transition from BUSY to IDLE
func TestSetState_TransitionsFromBusyToIdle(t *testing.T) {
	sm := NewStateMachine(nil)

	// Set to BUSY first
	sm.SetState(StateBusy)
	assert.Equal(t, StateBusy, sm.GetState(), "Should be in BUSY state")

	// Transition back to IDLE
	sm.SetState(StateIdle)

	// Verify transition
	assert.Equal(t, StateIdle, sm.GetState(), "State should transition back to IDLE")
}

// TestSetState_IgnoresSameState verifies that setting the same state doesn't trigger callback
func TestSetState_IgnoresSameState(t *testing.T) {
	callbackCount := 0
	callback := func(state RunnerState) {
		callbackCount++
	}

	sm := NewStateMachine(callback)

	// Wait for any goroutines from initialization to complete
	time.Sleep(10 * time.Millisecond)

	// Reset counter after initialization
	callbackCount = 0

	// Set to the same state (IDLE -> IDLE)
	sm.SetState(StateIdle)

	// Wait to ensure no callback is triggered
	time.Sleep(10 * time.Millisecond)

	assert.Equal(t, 0, callbackCount, "Callback should not be triggered when state doesn't change")
}

// TestSetState_CallsCallbackOnChange verifies that callback is invoked on state change
func TestSetState_CallsCallbackOnChange(t *testing.T) {
	var wg sync.WaitGroup
	var receivedStates []RunnerState
	var mu sync.Mutex

	callback := func(state RunnerState) {
		mu.Lock()
		receivedStates = append(receivedStates, state)
		mu.Unlock()
		wg.Done()
	}

	sm := NewStateMachine(callback)

	// Test multiple transitions
	transitions := []struct {
		name     string
		newState RunnerState
	}{
		{"IDLE to BUSY", StateBusy},
		{"BUSY to IDLE", StateIdle},
		{"IDLE to BUSY again", StateBusy},
	}

	for _, tt := range transitions {
		t.Run(tt.name, func(t *testing.T) {
			wg.Add(1)
			sm.SetState(tt.newState)

			// Wait for callback to complete (with timeout)
			done := make(chan struct{})
			go func() {
				wg.Wait()
				close(done)
			}()

			select {
			case <-done:
				// Success
			case <-time.After(100 * time.Millisecond):
				t.Fatal("Callback timeout")
			}
		})
	}

	// Verify all callbacks were received
	mu.Lock()
	defer mu.Unlock()

	assert.Equal(t, 3, len(receivedStates), "Should receive callback for each state change")
	assert.Equal(t, StateBusy, receivedStates[0], "First transition should be to BUSY")
	assert.Equal(t, StateIdle, receivedStates[1], "Second transition should be to IDLE")
	assert.Equal(t, StateBusy, receivedStates[2], "Third transition should be to BUSY")
}

// TestSetState_ThreadSafety verifies concurrent state transitions are handled safely
func TestSetState_ThreadSafety(t *testing.T) {
	const goroutines = 100
	const iterations = 10

	sm := NewStateMachine(nil)

	var wg sync.WaitGroup
	wg.Add(goroutines)

	// Launch multiple goroutines performing state transitions
	for i := 0; i < goroutines; i++ {
		go func(id int) {
			defer wg.Done()

			for j := 0; j < iterations; j++ {
				if id%2 == 0 {
					sm.SetState(StateBusy)
				} else {
					sm.SetState(StateIdle)
				}

				// Read state to test concurrent reads
				_ = sm.GetState()
				_ = sm.IsIdle()
			}
		}(i)
	}

	// Wait for all goroutines to complete
	done := make(chan struct{})
	go func() {
		wg.Wait()
		close(done)
	}()

	select {
	case <-done:
		// Success - verify state is valid
		state := sm.GetState()
		assert.True(t, state == StateIdle || state == StateBusy, "State should be either IDLE or BUSY")
	case <-time.After(5 * time.Second):
		t.Fatal("Thread safety test timeout - possible deadlock")
	}
}

// TestGetState_ReturnsCurrentState verifies GetState returns the current state correctly
func TestGetState_ReturnsCurrentState(t *testing.T) {
	tests := []struct {
		name          string
		initialState  RunnerState
		expectedState RunnerState
	}{
		{
			name:          "IDLE state",
			initialState:  StateIdle,
			expectedState: StateIdle,
		},
		{
			name:          "BUSY state",
			initialState:  StateBusy,
			expectedState: StateBusy,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			sm := NewStateMachine(nil)
			sm.SetState(tt.initialState)

			result := sm.GetState()
			assert.Equal(t, tt.expectedState, result, "GetState should return current state")
		})
	}
}

// TestIsIdle_ReturnsCorrectValue verifies IsIdle helper method
func TestIsIdle_ReturnsCorrectValue(t *testing.T) {
	tests := []struct {
		name     string
		state    RunnerState
		expected bool
	}{
		{
			name:     "IDLE state returns true",
			state:    StateIdle,
			expected: true,
		},
		{
			name:     "BUSY state returns false",
			state:    StateBusy,
			expected: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			sm := NewStateMachine(nil)
			sm.SetState(tt.state)

			result := sm.IsIdle()
			assert.Equal(t, tt.expected, result, "IsIdle should return correct boolean value")
		})
	}
}

// TestRunnerState_String verifies state string representation
func TestRunnerState_String(t *testing.T) {
	tests := []struct {
		name     string
		state    RunnerState
		expected string
	}{
		{
			name:     "IDLE state string",
			state:    StateIdle,
			expected: "IDLE",
		},
		{
			name:     "BUSY state string",
			state:    StateBusy,
			expected: "BUSY",
		},
		{
			name:     "Unknown state",
			state:    RunnerState(999),
			expected: "UNKNOWN",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := tt.state.String()
			assert.Equal(t, tt.expected, result, "String() should return correct state name")
		})
	}
}

// TestSetState_CallbackAsynchronous verifies callback is executed in separate goroutine
func TestSetState_CallbackAsynchronous(t *testing.T) {
	callbackStarted := make(chan struct{}, 1)
	callbackCanFinish := make(chan struct{})
	var callbackOnce sync.Once

	callback := func(state RunnerState) {
		callbackOnce.Do(func() {
			callbackStarted <- struct{}{}
		})
		<-callbackCanFinish // Block to test asynchronous behavior
	}

	sm := NewStateMachine(callback)

	// Trigger state change
	sm.SetState(StateBusy)

	// Verify callback started (runs asynchronously)
	select {
	case <-callbackStarted:
		// Success - callback started
	case <-time.After(100 * time.Millisecond):
		t.Fatal("Callback did not start")
	}

	// Verify SetState returned (didn't block on callback)
	// If we reach here, SetState didn't block

	// Now allow callback to finish
	close(callbackCanFinish)

	// Give callback time to complete
	time.Sleep(50 * time.Millisecond)

	// Verify we can perform another state change after callback finishes
	sm.SetState(StateIdle)
}

// TestStateMachine_NilCallback verifies state machine works without callback
func TestStateMachine_NilCallback(t *testing.T) {
	sm := NewStateMachine(nil)

	// Should not panic with nil callback
	assert.NotPanics(t, func() {
		sm.SetState(StateBusy)
		sm.SetState(StateIdle)
	}, "State transitions should work with nil callback")

	assert.Equal(t, StateIdle, sm.GetState(), "State should be IDLE")
}
