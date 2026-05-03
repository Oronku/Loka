/**
 * Centralized API configuration
 * Supports both VITE_API_URL and VITE_API_BASE_URL for backward compatibility
 *
 * Environment Variables:
 * - VITE_API_BASE_URL: Base URL for API endpoints (e.g., '/api' or 'http://localhost:3001/api')
 * - VITE_MEDIA_URL: Media server URL (e.g., 'http://localhost:5190')
 */

/**
 * API Base URL - used for all API calls
 * In development: uses '/api' proxy by default
 * In production: uses environment variable or defaults to 'http://localhost:3001/api'
 */
export const API_BASE_URL =
	import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL || (import.meta.env.DEV ? '/api' : 'http://localhost:3001/api');

/**
 * Media server URL (e.g., for videos, static assets)
 */
export const MEDIA_URL = import.meta.env.VITE_MEDIA_URL || 'http://localhost:5190';
