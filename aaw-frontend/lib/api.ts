/**
 * Centralized API URL management for Docker networking
 *
 * This module handles API URL resolution for both browser and server contexts:
 * - Browser requests use NEXT_PUBLIC_API_URL (accessible from client-side)
 * - Server requests can use internal Docker network via API_URL
 *
 * In Docker environment:
 * - NEXT_PUBLIC_API_URL: http://localhost:8080 (for browser requests to host)
 * - API_URL: http://backend:8080 (for server-side requests within Docker network)
 */

/**
 * Get the appropriate API URL based on execution context
 * @returns API base URL
 */
const getApiUrl = (): string => {
  // In browser context, use public environment variable
  if (typeof window !== 'undefined') {
    return process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';
  }

  // In server context, can use internal Docker network
  // Falls back to localhost for development
  return process.env.API_URL || 'http://aaw-backend:8080';
};

/**
 * Base API URL - automatically determined based on context
 */
export const API_BASE_URL = getApiUrl();

/**
 * Build a full API URL from a path
 * @param path - API endpoint path (e.g., '/api/tasks/list')
 * @returns Full URL to the API endpoint
 *
 * @example
 * ```typescript
 * const url = buildApiUrl('/api/tasks/list');
 * // Browser: 'http://localhost:8080/api/tasks/list'
 * // Server: 'http://backend:8080/api/tasks/list'
 * ```
 */
export const buildApiUrl = (path: string): string => {
  // Ensure path starts with /
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE_URL}${normalizedPath}`;
};
