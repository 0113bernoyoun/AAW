export interface LogChunk {
  type: string;
  taskId: number;
  line: string | null;
  status: string | null;
  isError: boolean;
}

export interface SSECallbacks {
  onLog: (log: LogChunk) => void;
  onStatusUpdate: (status: string) => void;
  onSystemReady: () => void;
  onSystemDisconnected: () => void;
  onError?: (error: Event) => void;
}

// Global singleton to prevent duplicate connections
let globalEventSource: EventSource | null = null;

export function connectToLogStream(callbacks: SSECallbacks): EventSource {
  // Close existing connection if any
  if (globalEventSource) {
    console.warn('SSE: Closing existing connection before creating new one');
    globalEventSource.close();
    globalEventSource = null;
  }

  const eventSource = new EventSource('http://localhost:8080/api/logs/stream');
  globalEventSource = eventSource;

  eventSource.addEventListener('log-event', (event: MessageEvent) => {
    try {
      const data: LogChunk = JSON.parse(event.data);

      switch (data.type) {
        case 'LOG':
        case 'SYSTEM':
          callbacks.onLog(data);
          break;
        case 'STATUS_UPDATE':
          if (data.status) {
            callbacks.onStatusUpdate(data.status);
          }
          break;
        case 'SYSTEM_READY':
          callbacks.onSystemReady();
          if (data.line) {
            callbacks.onLog(data);
          }
          break;
        case 'SYSTEM_DISCONNECTED':
          callbacks.onSystemDisconnected();
          if (data.line) {
            callbacks.onLog(data);
          }
          break;
      }
    } catch (error) {
      console.error('Failed to parse SSE data:', error);
    }
  });

  eventSource.onerror = (error) => {
    const errorEvent = error as Event;
    const target = errorEvent.target as EventSource;

    console.error('SSE connection error. ReadyState:', target.readyState);

    if (callbacks.onError) {
      callbacks.onError(errorEvent);
    }

    // Clear global reference if connection is closed
    if (target.readyState === EventSource.CLOSED && globalEventSource === target) {
      globalEventSource = null;
    }
  };

  return eventSource;
}

// Function to manually close the global SSE connection
export function closeGlobalSSE() {
  if (globalEventSource) {
    console.log('SSE: Manually closing global connection');
    globalEventSource.close();
    globalEventSource = null;
  }
}

export function createReconnectingSSE(
  callbacks: SSECallbacks,
  maxRetries: number = 5
): { connect: () => void; disconnect: () => void } {
  let eventSource: EventSource | null = null;
  let retryCount = 0;
  let retryTimeout: NodeJS.Timeout | null = null;
  let isManuallyDisconnected = false;

  const connect = () => {
    if (eventSource) {
      return; // Already connected
    }

    isManuallyDisconnected = false;
    eventSource = connectToLogStream({
      ...callbacks,
      onError: (error) => {
        const target = (error as Event).target as EventSource;

        if (callbacks.onError) {
          callbacks.onError(error);
        }

        // EventSource automatically reconnects, but we track manual disconnects
        if (target.readyState === EventSource.CLOSED && !isManuallyDisconnected) {
          if (retryCount < maxRetries) {
            retryCount++;
            const delay = Math.min(1000 * Math.pow(2, retryCount), 30000); // Exponential backoff, max 30s
            console.log(`SSE reconnecting in ${delay}ms (attempt ${retryCount}/${maxRetries})`);

            retryTimeout = setTimeout(() => {
              eventSource = null;
              connect();
            }, delay);
          } else {
            console.error('SSE max retries reached');
          }
        }
      },
    });

    // Reset retry count on successful connection
    eventSource.onopen = () => {
      console.log('SSE connection established');
      retryCount = 0;
    };
  };

  const disconnect = () => {
    isManuallyDisconnected = true;
    if (retryTimeout) {
      clearTimeout(retryTimeout);
      retryTimeout = null;
    }
    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }
    // Clear global reference when manually disconnecting
    if (globalEventSource === eventSource) {
      globalEventSource = null;
    }
  };

  return { connect, disconnect };
}
