// Thin Supabase upsert helper — uses the SERVICE ROLE key (server-side only),
// exactly like the cTrader bridge writes account_live / trades.
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

// Chunked upsert so a large backfill never sends one giant request.
export async function upsert(table, rows, onConflict, chunk = 500) {
  if (!rows.length) return 0;
  let n = 0;
  for (let i = 0; i < rows.length; i += chunk) {
    const slice = rows.slice(i, i + chunk);
    const { error } = await supa().from(table).upsert(slice, { onConflict });
    if (error) throw new Error(`Supabase upsert ${table}: ${error.message}`);
    n += slice.length;
  }
  return n;
}
