// api/auth/logout.mjs
// POST → clears the session cookie.
import { buildClearCookie } from './_session.mjs';

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  res.setHeader('Set-Cookie', buildClearCookie());
  return res.status(200).json({ ok: true });
}
