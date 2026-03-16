// src/lib/supabaseClient.js
// ─────────────────────────────────────────────────────────────────
// Initializes the Supabase client from environment variables.
// NEVER hardcode credentials here — use .env instead.
// ─────────────────────────────────────────────────────────────────
import { createClient } from '@supabase/supabase-js';

const supabaseUrl  = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey  = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    '[Ellipse] Missing Supabase credentials.\n' +
    'Create a .env file with VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.\n' +
    'See .env.example for the template.'
  );
}

// Validate URL format to catch copy-paste mistakes early
try {
  new URL(supabaseUrl);
} catch {
  throw new Error(`[Ellipse] VITE_SUPABASE_URL is not a valid URL: "${supabaseUrl}"`);
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    // Persist session in localStorage (default) — fine for a single-user app.
    // Switch to 'memory' if you add multi-user support with server-side auth.
    persistSession: true,
    autoRefreshToken: true,
  },
});
