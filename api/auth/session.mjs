// api/auth/session.mjs
// GET → { authenticated, configured }. Used by the client to decide
// whether to show the login screen. Never leaks the password or secret.
import { authConfigured, hasValidSession } from './_session.mjs';

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  return res.status(200).json({
    configured: authConfigured(),
    authenticated: hasValidSession(req),
  });
}
