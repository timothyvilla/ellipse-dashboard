#!/usr/bin/env node
// auth.mjs — one-time OAuth authorization (run once, then the bridge auto-refreshes).
//
//   npm run auth
//
// Prints the consent URL (scope=accounts, READ-ONLY). You open it, sign in with
// your cTrader ID, authorize, and the browser is redirected to your redirect_uri
// with `?code=...` in the address bar. Paste that whole URL (or just the code)
// back here; the code is exchanged for an access+refresh token pair saved to
// ./.tokens.json (gitignored). The bridge reads and rotates that file from then on.
//
// Redirect URI: any URL registered on your app at openapi.ctrader.com. If you have
// nothing to host, register http://localhost/ and just copy the code out of the
// address bar after the redirect fails to load — the code is still in the URL.
import 'dotenv/config';
import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { authUrl, exchangeCode, saveTokens, TOKENS_PATH } from './_oauth.mjs';

const CLIENT_ID = process.env.CTRADER_CLIENT_ID;
const CLIENT_SECRET = process.env.CTRADER_CLIENT_SECRET;
const REDIRECT_URI = process.env.CTRADER_REDIRECT_URI || 'http://localhost/';
const SCOPE = process.env.CTRADER_SCOPE || 'accounts'; // read-only

function extractCode(input) {
  const s = input.trim();
  if (!s) return '';
  try {
    const u = new URL(s);
    return u.searchParams.get('code') || '';
  } catch {
    return s; // they pasted the bare code
  }
}

async function main() {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    console.error('Set CTRADER_CLIENT_ID and CTRADER_CLIENT_SECRET in .env first.');
    process.exit(1);
  }
  if (SCOPE !== 'accounts') {
    console.warn(`\n⚠  scope="${SCOPE}" — for a funded/prop account use scope=accounts (read-only). Continuing.\n`);
  }

  const url = authUrl({ clientId: CLIENT_ID, redirectUri: REDIRECT_URI, scope: SCOPE });
  console.log('\n1) Open this URL, sign in with your cTrader ID, and click Allow:\n');
  console.log('   ' + url + '\n');
  console.log(`2) You'll be redirected to ${REDIRECT_URI}?code=...  (the page may fail to load — that's fine)\n`);

  const rl = readline.createInterface({ input: stdin, output: stdout });
  const answer = await rl.question('3) Paste the full redirect URL (or just the code) here: ');
  rl.close();

  const code = extractCode(answer);
  if (!code) { console.error('No code found in that input.'); process.exit(1); }

  console.log('\nExchanging code for tokens…');
  const tokens = await exchangeCode({ clientId: CLIENT_ID, clientSecret: CLIENT_SECRET, redirectUri: REDIRECT_URI, code });
  await saveTokens(tokens);
  console.log(`✓ Saved tokens to ${TOKENS_PATH}`);
  console.log(`  access token expires in ~${Math.round((tokens.expiresIn || 0) / 60)} min; the bridge refreshes it automatically.`);
  console.log('\nNext: `npm start` (stream) or `MODE=snapshot npm start` (one-shot).');
}

main().catch((e) => { console.error('auth failed:', e.message); process.exit(1); });
