import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RecoveryManager from '@/components/RecoveryManager';
import { TaskProvider } from '@/contexts/TaskContext';
import { Task, TaskStatus } from '@/types/task';

// Mock the SSE client
jest.mock('@/lib/sse-client', () => ({
  createReconnectingSSE: jest.fn(() => ({
    connect: jest.fn(),
    disconnect: jest.fn(),
  })),
  closeGlobalSSE: jest.fn(),
}));

// Mock TaskRecoveryModal component
jest.mock('@/components/TaskRecoveryModal', () => {
  return function MockTaskRecoveryModal({
    task,
    open,
    onOpenChange,
    onRetryCurrent,
    onSkipToNext,
    onRestartSession,
  }: any) {
    if (!open) return null;

    return (
      <div data-testid="recovery-modal">
        <h2>Task Interrupted</h2>
        <p>Task ID: {task.id}</p>
        <p>Instruction: {task.instruction}</p>
        <button onClick={onRetryCurrent}>Retry Current</button>
        <button onClick={onSkipToNext}>Skip to Next</button>
        <button onClick={onRestartSession}>Restart Session</button>
        <button onClick={() => onOpenChange(false)}>Close</button>
      </div>
    );
  };
});

// Helper to create mock task
const createMockTask = (overrides: Partial<Task> = {}): Task => ({
  id: 1,
  instruction: 'Test task',
  scriptContent: 'echo "test"',
  scriptPath: null,
  status: 'QUEUED' as TaskStatus,
  priority: 10,
  queuePosition: null,
  skipPermissions: false,
  sessionMode: 'NEW',
  failureReason: null,
  retryCount: 0,
  createdAt: '2025-01-01T00:00:00Z',
  startedAt: null,
  completedAt: null,
  ...overrides,
});

describe('RecoveryManager', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const renderWithProvider = (ui: React.ReactElement) => {
    return render(<TaskProvider>{ui}</TaskProvider>);
  };

  describe('modal visibility', () => {
    it('should show modal when task is INTERRUPTED', async () => {
      const interruptedTask = createMockTask({
        id: 1,
        status: 'INTERRUPTED',
        instruction: 'Interrupted task',
      });

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => [interruptedTask],
      });

      renderWithProvider(<RecoveryManager />);

      await waitFor(() => {
        expect(screen.getByTestId('recovery-modal')).toBeInTheDocument();
      });

      expect(screen.getByText('Task Interrupted')).toBeInTheDocument();
      expect(screen.getByText('Task ID: 1')).toBeInTheDocument();
      expect(screen.getByText('Instruction: Interrupted task')).toBeInTheDocument();
    });

    it('should hide modal when no interrupted tasks', async () => {
      const normalTask = createMockTask({
        id: 1,
        status: 'QUEUED',
      });

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => [normalTask],
      });

      renderWithProvider(<RecoveryManager />);

      await waitFor(() => {
        expect(screen.queryByTestId('recovery-modal')).not.toBeInTheDocument();
      });
    });

    it('should hide modal when interrupted task is resolved', async () => {
      const interruptedTask = createMockTask({
        id: 1,
        status: 'INTERRUPTED',
      });

      const resolvedTask = createMockTask({
        id: 1,
        status: 'QUEUED',
      });

      // First return interrupted task, then resolved task
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [interruptedTask],
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [resolvedTask],
        });

      const { rerender } = renderWithProvider(<RecoveryManager />);

      await waitFor(() => {
        expect(screen.getByTestId('recovery-modal')).toBeInTheDocument();
      });

      // Trigger re-render with updated task list
      rerender(
        <TaskProvider>
          <RecoveryManager />
        </TaskProvider>
      );

      await waitFor(() => {
        expect(screen.queryByTestId('recovery-modal')).not.toBeInTheDocument();
      });
    });
  });

  describe('retry task action', () => {
    it('should call retryTask when Retry Current clicked', async () => {
      const user = userEvent.setup();
      const interruptedTask = createMockTask({
        id: 5,
        status: 'INTERRUPTED',
        instruction: 'Task to retry',
      });

      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [interruptedTask],
        }) // Initial task list
        .mockResolvedValueOnce({
          ok: true,
        }) // Retry endpoint
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [{ ...interruptedTask, status: 'QUEUED' }],
        }); // Refreshed task list

      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

      renderWithProvider(<RecoveryManager />);

      await waitFor(() => {
        expect(screen.getByTestId('recovery-modal')).toBeInTheDocument();
      });

      const retryButton = screen.getByRole('button', { name: /retry current/i });
      await user.click(retryButton);

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          'http://localhost:8080/api/tasks/5/retry',
          { method: 'POST' }
        );
      });

      expect(consoleLogSpy).toHaveBeenCalledWith(
        '[RecoveryManager] Retrying task:',
        5
      );

      consoleLogSpy.mockRestore();
    });

    it('should close modal after retry completes', async () => {
      const user = userEvent.setup();
      const interruptedTask = createMockTask({
        id: 5,
        status: 'INTERRUPTED',
      });

      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [interruptedTask],
        }) // Initial task list
        .mockResolvedValueOnce({
          ok: true,
        }) // Retry endpoint
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [{ ...interruptedTask, status: 'QUEUED' }],
        }); // Refreshed task list

      renderWithProvider(<RecoveryManager />);

      await waitFor(() => {
        expect(screen.getByTestId('recovery-modal')).toBeInTheDocument();
      });

      const retryButton = screen.getByRole('button', { name: /retry current/i });
      await user.click(retryButton);

      await waitFor(() => {
        expect(screen.queryByTestId('recovery-modal')).not.toBeInTheDocument();
      });
    });

    it('should handle retry API failure', async () => {
      const user = userEvent.setup();
      const interruptedTask = createMockTask({
        id: 5,
        status: 'INTERRUPTED',
      });

      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [interruptedTask],
        }) // Initial task list
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
        }); // Retry endpoint failure

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      renderWithProvider(<RecoveryManager />);

      await waitFor(() => {
        expect(screen.getByTestId('recovery-modal')).toBeInTheDocument();
      });

      const retryButton = screen.getByRole('button', { name: /retry current/i });
      await user.click(retryButton);

      await waitFor(() => {
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          '[RecoveryManager] Failed to retry task:',
          expect.any(Error)
        );
      });

      // Modal should stay open on error
      expect(screen.getByTestId('recovery-modal')).toBeInTheDocument();

      consoleErrorSpy.mockRestore();
    });
  });

  describe('skip task action', () => {
    it('should call skipTask when Skip to Next clicked', async () => {
      const user = userEvent.setup();
      const interruptedTask = createMockTask({
        id: 7,
        status: 'INTERRUPTED',
        instruction: 'Task to skip',
      });

      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [interruptedTask],
        }) // Initial task list
        .mockResolvedValueOnce({
          ok: true,
        }) // Skip endpoint
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [{ ...interruptedTask, status: 'CANCELLED' }],
        }); // Refreshed task list

      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

      renderWithProvider(<RecoveryManager />);

      await waitFor(() => {
        expect(screen.getByTestId('recovery-modal')).toBeInTheDocument();
      });

      const skipButton = screen.getByRole('button', { name: /skip to next/i });
      await user.click(skipButton);

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          'http://localhost:8080/api/tasks/7/skip',
          { method: 'POST' }
        );
      });

      expect(consoleLogSpy).toHaveBeenCalledWith(
        '[RecoveryManager] Skipping task:',
        7
      );

      consoleLogSpy.mockRestore();
    });

    it('should close modal after skip completes', async () => {
      const user = userEvent.setup();
      const interruptedTask = createMockTask({
        id: 7,
        status: 'INTERRUPTED',
      });

      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [interruptedTask],
        }) // Initial task list
        .mockResolvedValueOnce({
          ok: true,
        }) // Skip endpoint
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [{ ...interruptedTask, status: 'CANCELLED' }],
        }); // Refreshed task list

      renderWithProvider(<RecoveryManager />);

      await waitFor(() => {
        expect(screen.getByTestId('recovery-modal')).toBeInTheDocument();
      });

      const skipButton = screen.getByRole('button', { name: /skip to next/i });
      await user.click(skipButton);

      await waitFor(() => {
        expect(screen.queryByTestId('recovery-modal')).not.toBeInTheDocument();
      });
    });

    it('should handle skip API failure', async () => {
      const user = userEvent.setup();
      const interruptedTask = createMockTask({
        id: 7,
        status: 'INTERRUPTED',
      });

      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [interruptedTask],
        }) // Initial task list
        .mockResolvedValueOnce({
          ok: false,
          status: 404,
        }); // Skip endpoint failure

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      renderWithProvider(<RecoveryManager />);

      await waitFor(() => {
        expect(screen.getByTestId('recovery-modal')).toBeInTheDocument();
      });

      const skipButton = screen.getByRole('button', { name: /skip to next/i });
      await user.click(skipButton);

      await waitFor(() => {
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          '[RecoveryManager] Failed to skip task:',
          expect.any(Error)
        );
      });

      // Modal should stay open on error
      expect(screen.getByTestId('recovery-modal')).toBeInTheDocument();

      consoleErrorSpy.mockRestore();
    });
  });

  describe('restart runner action', () => {
    it('should call restartRunner when Restart Session clicked', async () => {
      const user = userEvent.setup();
      const interruptedTask = createMockTask({
        id: 9,
        status: 'INTERRUPTED',
        instruction: 'Task requiring restart',
      });

      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [interruptedTask],
        }) // Initial task list
        .mockResolvedValueOnce({
          ok: true,
        }) // Restart endpoint
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [],
        }); // Refreshed task list (empty after restart)

      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

      renderWithProvider(<RecoveryManager />);

      await waitFor(() => {
        expect(screen.getByTestId('recovery-modal')).toBeInTheDocument();
      });

      const restartButton = screen.getByRole('button', { name: /restart session/i });
      await user.click(restartButton);

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          'http://localhost:8080/api/runner/restart',
          { method: 'POST' }
        );
      });

      expect(consoleLogSpy).toHaveBeenCalledWith(
        '[RecoveryManager] Restarting runner session'
      );

      consoleLogSpy.mockRestore();
    });

    it('should close modal after restart completes', async () => {
      const user = userEvent.setup();
      const interruptedTask = createMockTask({
        id: 9,
        status: 'INTERRUPTED',
      });

      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [interruptedTask],
        }) // Initial task list
        .mockResolvedValueOnce({
          ok: true,
        }) // Restart endpoint
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [],
        }); // Refreshed task list

      renderWithProvider(<RecoveryManager />);

      await waitFor(() => {
        expect(screen.getByTestId('recovery-modal')).toBeInTheDocument();
      });

      const restartButton = screen.getByRole('button', { name: /restart session/i });
      await user.click(restartButton);

      await waitFor(() => {
        expect(screen.queryByTestId('recovery-modal')).not.toBeInTheDocument();
      });
    });

    it('should handle restart API failure', async () => {
      const user = userEvent.setup();
      const interruptedTask = createMockTask({
        id: 9,
        status: 'INTERRUPTED',
      });

      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [interruptedTask],
        }) // Initial task list
        .mockResolvedValueOnce({
          ok: false,
          status: 503,
        }); // Restart endpoint failure

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      renderWithProvider(<RecoveryManager />);

      await waitFor(() => {
        expect(screen.getByTestId('recovery-modal')).toBeInTheDocument();
      });

      const restartButton = screen.getByRole('button', { name: /restart session/i });
      await user.click(restartButton);

      await waitFor(() => {
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          '[RecoveryManager] Failed to restart session:',
          expect.any(Error)
        );
      });

      // Modal should stay open on error
      expect(screen.getByTestId('recovery-modal')).toBeInTheDocument();

      consoleErrorSpy.mockRestore();
    });
  });

  describe('modal close behavior', () => {
    it('should allow manual modal close', async () => {
      const user = userEvent.setup();
      const interruptedTask = createMockTask({
        id: 1,
        status: 'INTERRUPTED',
      });

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => [interruptedTask],
      });

      renderWithProvider(<RecoveryManager />);

      await waitFor(() => {
        expect(screen.getByTestId('recovery-modal')).toBeInTheDocument();
      });

      const closeButton = screen.getByRole('button', { name: /close/i });
      await user.click(closeButton);

      await waitFor(() => {
        expect(screen.queryByTestId('recovery-modal')).not.toBeInTheDocument();
      });
    });
  });

  describe('multiple interrupted tasks', () => {
    it('should show modal for first interrupted task only', async () => {
      const interruptedTask1 = createMockTask({
        id: 1,
        status: 'INTERRUPTED',
        instruction: 'First interrupted',
      });

      const interruptedTask2 = createMockTask({
        id: 2,
        status: 'INTERRUPTED',
        instruction: 'Second interrupted',
      });

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => [interruptedTask1, interruptedTask2],
      });

      renderWithProvider(<RecoveryManager />);

      await waitFor(() => {
        expect(screen.getByTestId('recovery-modal')).toBeInTheDocument();
      });

      // Should show first interrupted task
      expect(screen.getByText('Task ID: 1')).toBeInTheDocument();
      expect(screen.getByText('Instruction: First interrupted')).toBeInTheDocument();
    });
  });
});
