// _supabase.mjs
// Service-role Supabase client for the cTrader bridge. Mirrors bridge/okx/_supabase.mjs
// and the server-side convention in api/ctrader/_helpers.mjs: account_live is written
// ONLY with the service_role key (RLS has no anon policy). Never runs in the browser.
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

let _client = null;
export function supa() {
  if (!url || !key) {
    throw new Error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in env.');
  }
  if (!_client) _client = createClient(url, key, { auth: { persistSession: false } });
  return _client;
}

// GMT+3 broker/MT5 server day — kept in sync with api/ctrader/_helpers.mjs serverDay().
const MT5_SERVER_OFFSET_MIN = 3 * 60;
export function serverDay(date = new Date()) {
  return new Date(date.getTime() + MT5_SERVER_OFFSET_MIN * 60000).toISOString().slice(0, 10);
}
