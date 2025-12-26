import { renderHook, waitFor, act } from '@testing-library/react';
import { TaskProvider, useTaskContext } from '@/contexts/TaskContext';
import { Task, TaskStatus } from '@/types/task';

// Mock the SSE client
jest.mock('@/lib/sse-client', () => ({
  createReconnectingSSE: jest.fn(() => ({
    connect: jest.fn(),
    disconnect: jest.fn(),
  })),
  closeGlobalSSE: jest.fn(),
}));

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

describe('TaskContext', () => {
  beforeEach(() => {
    // Reset fetch mock before each test
    global.fetch = jest.fn();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('retryTask', () => {
    it('should retry task and refresh task list', async () => {
      const mockTask = createMockTask({ id: 1, status: 'INTERRUPTED' });
      const mockTaskList = [mockTask];

      // Mock successful retry and refresh
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockTask,
        }) // Initial task list fetch
        .mockResolvedValueOnce({
          ok: true,
        }) // Retry endpoint
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockTaskList.map(t => ({ ...t, status: 'QUEUED' })),
        }); // Refresh task list

      const { result } = renderHook(() => useTaskContext(), {
        wrapper: TaskProvider,
      });

      await waitFor(() => {
        expect(result.current.tasks).toHaveLength(0);
      });

      await act(async () => {
        await result.current.retryTask(1);
      });

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          'http://localhost:8080/api/tasks/1/retry',
          { method: 'POST' }
        );
      });

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          'http://localhost:8080/api/tasks/list'
        );
      });
    });

    it('should handle retry task API failure', async () => {
      // Mock failed retry
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [],
        }) // Initial task list fetch
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
        }); // Retry endpoint failure

      const { result } = renderHook(() => useTaskContext(), {
        wrapper: TaskProvider,
      });

      await waitFor(() => {
        expect(result.current.tasks).toBeDefined();
      });

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      await act(async () => {
        await expect(result.current.retryTask(1)).rejects.toThrow();
      });

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to retry task:',
        expect.any(Error)
      );

      consoleErrorSpy.mockRestore();
    });
  });

  describe('skipTask', () => {
    it('should skip task and refresh task list', async () => {
      const mockTask = createMockTask({ id: 2, status: 'INTERRUPTED' });
      const mockTaskList = [mockTask];

      // Mock successful skip and refresh
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockTaskList,
        }) // Initial task list fetch
        .mockResolvedValueOnce({
          ok: true,
        }) // Skip endpoint
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockTaskList.map(t => ({ ...t, status: 'CANCELLED' })),
        }); // Refresh task list

      const { result } = renderHook(() => useTaskContext(), {
        wrapper: TaskProvider,
      });

      await waitFor(() => {
        expect(result.current.tasks).toHaveLength(1);
      });

      await act(async () => {
        await result.current.skipTask(2);
      });

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          'http://localhost:8080/api/tasks/2/skip',
          { method: 'POST' }
        );
      });

      await waitFor(() => {
        // Should have called fetch 3 times total: initial + skip + refresh
        expect(global.fetch).toHaveBeenCalledTimes(3);
      });
    });

    it('should handle skip task API failure', async () => {
      // Mock failed skip
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [],
        }) // Initial task list fetch
        .mockResolvedValueOnce({
          ok: false,
          status: 404,
        }); // Skip endpoint failure

      const { result } = renderHook(() => useTaskContext(), {
        wrapper: TaskProvider,
      });

      await waitFor(() => {
        expect(result.current.tasks).toBeDefined();
      });

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      await act(async () => {
        await expect(result.current.skipTask(999)).rejects.toThrow();
      });

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to skip task:',
        expect.any(Error)
      );

      consoleErrorSpy.mockRestore();
    });
  });

  describe('restartRunner', () => {
    it('should restart runner and refresh task list', async () => {
      const mockTaskList = [
        createMockTask({ id: 1, status: 'RUNNING' }),
      ];

      // Mock successful restart and refresh
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockTaskList,
        }) // Initial task list fetch
        .mockResolvedValueOnce({
          ok: true,
        }) // Restart endpoint
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [],
        }); // Refresh task list (empty after restart)

      const { result } = renderHook(() => useTaskContext(), {
        wrapper: TaskProvider,
      });

      await waitFor(() => {
        expect(result.current.tasks).toHaveLength(1);
      });

      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

      await act(async () => {
        await result.current.restartRunner();
      });

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          'http://localhost:8080/api/runner/restart',
          { method: 'POST' }
        );
      });

      expect(consoleLogSpy).toHaveBeenCalledWith(
        '[TaskContext] Runner restart initiated'
      );

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledTimes(3);
      });

      consoleLogSpy.mockRestore();
    });

    it('should handle restart runner API failure', async () => {
      // Mock failed restart
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [],
        }) // Initial task list fetch
        .mockResolvedValueOnce({
          ok: false,
          status: 503,
        }); // Restart endpoint failure

      const { result } = renderHook(() => useTaskContext(), {
        wrapper: TaskProvider,
      });

      await waitFor(() => {
        expect(result.current.tasks).toBeDefined();
      });

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      await act(async () => {
        await expect(result.current.restartRunner()).rejects.toThrow();
      });

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to restart runner:',
        expect.any(Error)
      );

      consoleErrorSpy.mockRestore();
    });
  });

  describe('task list management', () => {
    it('should fetch tasks on mount', async () => {
      const mockTaskList = [
        createMockTask({ id: 1 }),
        createMockTask({ id: 2 }),
      ];

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockTaskList,
      });

      const { result } = renderHook(() => useTaskContext(), {
        wrapper: TaskProvider,
      });

      await waitFor(() => {
        expect(result.current.tasks).toHaveLength(2);
      });

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:8080/api/tasks/list'
      );
    });

    it('should handle fetch tasks failure gracefully', async () => {
      (global.fetch as jest.Mock).mockRejectedValueOnce(
        new Error('Network error')
      );

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      const { result } = renderHook(() => useTaskContext(), {
        wrapper: TaskProvider,
      });

      await waitFor(() => {
        expect(result.current.tasks).toHaveLength(0);
      });

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to fetch tasks:',
        expect.any(Error)
      );

      consoleErrorSpy.mockRestore();
    });
  });

  describe('task selection', () => {
    it('should select and deselect tasks', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      });

      const { result } = renderHook(() => useTaskContext(), {
        wrapper: TaskProvider,
      });

      await waitFor(() => {
        expect(result.current.selectedTaskId).toBeNull();
      });

      act(() => {
        result.current.selectTask(5);
      });

      expect(result.current.selectedTaskId).toBe(5);

      act(() => {
        result.current.selectTask(null);
      });

      expect(result.current.selectedTaskId).toBeNull();
    });
  });

  describe('system ready state', () => {
    it('should start with system not ready', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      });

      const { result } = renderHook(() => useTaskContext(), {
        wrapper: TaskProvider,
      });

      await waitFor(() => {
        expect(result.current.isSystemReady).toBe(false);
      });
    });
  });

  describe('cancelTask', () => {
    it('should cancel task and refresh task list', async () => {
      const mockTask = createMockTask({ id: 3, status: 'RUNNING' });

      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [mockTask],
        }) // Initial fetch
        .mockResolvedValueOnce({
          ok: true,
        }) // Cancel endpoint
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [{ ...mockTask, status: 'CANCELLED' }],
        }); // Refresh

      const { result } = renderHook(() => useTaskContext(), {
        wrapper: TaskProvider,
      });

      await waitFor(() => {
        expect(result.current.tasks).toHaveLength(1);
      });

      await act(async () => {
        await result.current.cancelTask(3);
      });

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:8080/api/tasks/3/cancel',
        { method: 'POST' }
      );
    });
  });

  describe('createTask', () => {
    it('should create task and refresh task list', async () => {
      const newTaskData = {
        instruction: 'New task',
        scriptContent: 'echo "new"',
        skipPermissions: false,
        sessionMode: 'NEW' as const,
        priority: 5,
      };

      const createdTask = createMockTask({
        id: 10,
        ...newTaskData,
      });

      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [],
        }) // Initial fetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => createdTask,
        }) // Create endpoint
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [createdTask],
        }); // Refresh

      const { result } = renderHook(() => useTaskContext(), {
        wrapper: TaskProvider,
      });

      await waitFor(() => {
        expect(result.current.tasks).toHaveLength(0);
      });

      let task: Task | undefined;

      await act(async () => {
        task = await result.current.createTask(newTaskData);
      });

      expect(task).toEqual(createdTask);
      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:8080/api/tasks/create-dynamic',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(newTaskData),
        }
      );
    });

    it('should throw error when create task fails', async () => {
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [],
        }) // Initial fetch
        .mockResolvedValueOnce({
          ok: false,
          status: 400,
        }); // Create endpoint failure

      const { result } = renderHook(() => useTaskContext(), {
        wrapper: TaskProvider,
      });

      await waitFor(() => {
        expect(result.current.tasks).toBeDefined();
      });

      await act(async () => {
        await expect(
          result.current.createTask({
            instruction: 'Bad task',
            scriptContent: 'invalid',
            skipPermissions: false,
            sessionMode: 'NEW',
          })
        ).rejects.toThrow('Failed to create task');
      });
    });
  });
});
