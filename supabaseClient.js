// src/lib/supabaseClient.js
// Add this file to: src/lib/supabaseClient.js

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('[Ellipse] Missing Supabase credentials. Create a .env file with VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
}

export const supabase = createClient(supabaseUrl || '', supabaseKey || '', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: 'ellipse-auth',
  },
});

// Helper: Query with retry logic for transient errors
export const queryWithRetry = async (queryFn, maxRetries = 3) => {
  let lastError;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const result = await queryFn();
      if (result.error) {
        const isTransient = 
          result.error.code === 'PGRST301' ||
          result.error.message?.includes('network') ||
          result.error.message?.includes('timeout');
        if (isTransient && attempt < maxRetries - 1) {
          lastError = result.error;
          await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt)));
          continue;
        }
      }
      return result;
    } catch (error) {
      lastError = error;
      if (attempt < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt)));
      }
    }
  }
  return { data: null, error: lastError };
};

// Helper: Sanitize data before database insert
export const sanitizeForInsert = (data) => {
  const sanitized = {};
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue;
    if (typeof value === 'string') {
      let clean = value.trim();
      if (clean.length > 10000) clean = clean.slice(0, 10000);
      sanitized[key] = clean;
    } else if (Array.isArray(value)) {
      sanitized[key] = value.slice(0, 100);
    } else if (typeof value === 'number') {
      if (!isNaN(value) && isFinite(value)) sanitized[key] = value;
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
};

// Connection state monitoring
let isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
const connectionListeners = new Set();

export const onConnectionChange = (callback) => {
  connectionListeners.add(callback);
  callback(isOnline);
  return () => connectionListeners.delete(callback);
};

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

export default supabase;
