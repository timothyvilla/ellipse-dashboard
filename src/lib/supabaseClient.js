// src/lib/supabaseClient.js
// ─────────────────────────────────────────────────────────────────
// Initializes the Supabase client from environment variables.
// HARDENED VERSION - Improved error handling and retry logic
// ─────────────────────────────────────────────────────────────────
import { createClient } from '@supabase/supabase-js';

// ── ENVIRONMENT VARIABLE VALIDATION ───────────────────────────────

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Check for missing credentials
if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    '[Ellipse] Missing Supabase credentials.\n' +
    'Create a .env file with VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.\n' +
    'See .env.example for the template.\n\n' +
    'SECURITY REMINDER: Never commit .env files to version control!'
  );
}

// Validate URL format
let parsedUrl;
try {
  parsedUrl = new URL(supabaseUrl);
} catch {
  throw new Error(
    `[Ellipse] VITE_SUPABASE_URL is not a valid URL: "${supabaseUrl}"\n` +
    'Expected format: https://your-project.supabase.co'
  );
}

// Validate URL is HTTPS
if (parsedUrl.protocol !== 'https:') {
  throw new Error(
    `[Ellipse] VITE_SUPABASE_URL must use HTTPS protocol.\n` +
    `Current protocol: ${parsedUrl.protocol}`
  );
}

// Validate URL is a Supabase domain (basic check)
if (!parsedUrl.hostname.endsWith('.supabase.co') && 
    !parsedUrl.hostname.endsWith('.supabase.in') &&
    !parsedUrl.hostname.includes('localhost')) {
  console.warn(
    '[Ellipse] VITE_SUPABASE_URL does not appear to be a standard Supabase URL.\n' +
    `Hostname: ${parsedUrl.hostname}\n` +
    'Proceeding anyway, but please verify your configuration.'
  );
}

// Validate key format (basic check - should start with expected prefix)
const KEY_PREFIXES = ['eyJ', 'sb_'];
const hasValidPrefix = KEY_PREFIXES.some(prefix => supabaseKey.startsWith(prefix));
if (!hasValidPrefix) {
  console.warn(
    '[Ellipse] VITE_SUPABASE_ANON_KEY has an unexpected format.\n' +
    'Expected JWT token starting with "eyJ" or publishable key starting with "sb_".\n' +
    'Please verify your Supabase anonymous key.'
  );
}

// ── CLIENT CONFIGURATION ──────────────────────────────────────────

/**
 * Custom fetch wrapper with retry logic
 */
const fetchWithRetry = async (url, options, retries = 3, delay = 1000) => {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, {
        ...options,
        // Add timeout
        signal: AbortSignal.timeout(30000), // 30 second timeout
      });
      return response;
    } catch (error) {
      const isLastAttempt = i === retries - 1;
      const isRetryable = 
        error.name === 'AbortError' || 
        error.message.includes('network') ||
        error.message.includes('fetch');
      
      if (isLastAttempt || !isRetryable) {
        throw error;
      }
      
      // Exponential backoff
      await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, i)));
    }
  }
};

/**
 * Supabase client instance
 */
export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    // Persist session in localStorage
    persistSession: true,
    // Auto refresh tokens
    autoRefreshToken: true,
    // Detect session from URL (for OAuth flows)
    detectSessionInUrl: true,
    // Storage key prefix
    storageKey: 'ellipse-auth',
  },
  global: {
    // Custom headers
    headers: {
      'x-client-info': 'ellipse-trading-journal',
    },
  },
  // Connection pooling settings
  db: {
    schema: 'public',
  },
  // Realtime settings (disabled if not needed)
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});

// ── HELPER FUNCTIONS ──────────────────────────────────────────────

/**
 * Checks if the Supabase connection is healthy
 * @returns {Promise<boolean>}
 */
export const checkConnection = async () => {
  try {
    const { error } = await supabase.from('accounts').select('id').limit(1);
    return !error;
  } catch {
    return false;
  }
};

/**
 * Wrapper for Supabase queries with automatic retry
 * @param {Function} queryFn - Function that returns a Supabase query
 * @param {number} maxRetries - Maximum retry attempts
 * @returns {Promise<Object>} - Query result
 */
export const queryWithRetry = async (queryFn, maxRetries = 3) => {
  let lastError;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const result = await queryFn();
      
      // Check for Supabase errors that might be transient
      if (result.error) {
        const isTransient = 
          result.error.code === 'PGRST301' || // Connection error
          result.error.code === '57014' ||    // Query canceled
          result.error.message?.includes('network') ||
          result.error.message?.includes('timeout');
        
        if (isTransient && attempt < maxRetries - 1) {
          lastError = result.error;
          await new Promise(resolve => 
            setTimeout(resolve, 1000 * Math.pow(2, attempt))
          );
          continue;
        }
      }
      
      return result;
    } catch (error) {
      lastError = error;
      
      if (attempt < maxRetries - 1) {
        await new Promise(resolve => 
          setTimeout(resolve, 1000 * Math.pow(2, attempt))
        );
      }
    }
  }
  
  return { data: null, error: lastError };
};

/**
 * Sanitizes data before inserting into Supabase
 * @param {Object} data - Data to sanitize
 * @returns {Object} - Sanitized data
 */
export const sanitizeForInsert = (data) => {
  const sanitized = {};
  
  for (const [key, value] of Object.entries(data)) {
    // Skip undefined values
    if (value === undefined) continue;
    
    // Sanitize strings
    if (typeof value === 'string') {
      // Trim whitespace
      let clean = value.trim();
      // Limit length to prevent storage abuse
      if (clean.length > 10000) {
        clean = clean.slice(0, 10000);
      }
      sanitized[key] = clean;
    } 
    // Handle arrays
    else if (Array.isArray(value)) {
      sanitized[key] = value.slice(0, 100); // Limit array size
    }
    // Handle numbers
    else if (typeof value === 'number') {
      // Check for valid numbers
      if (!isNaN(value) && isFinite(value)) {
        sanitized[key] = value;
      }
    }
    // Pass through other types
    else {
      sanitized[key] = value;
    }
  }
  
  return sanitized;
};

// ── CONNECTION MONITORING ─────────────────────────────────────────

let isOnline = navigator.onLine;
const connectionListeners = new Set();

/**
 * Registers a listener for connection state changes
 * @param {Function} callback - Called with boolean online status
 * @returns {Function} - Unsubscribe function
 */
export const onConnectionChange = (callback) => {
  connectionListeners.add(callback);
  // Immediately call with current status
  callback(isOnline);
  
  return () => {
    connectionListeners.delete(callback);
  };
};

// Monitor browser online/offline events
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    isOnline = true;
    connectionListeners.forEach(cb => cb(true));
  });
  
  window.addEventListener('offline', () => {
    isOnline = false;
    connectionListeners.forEach(cb => cb(false));
  });
}

// ── EXPORTS ───────────────────────────────────────────────────────

export default supabase;
