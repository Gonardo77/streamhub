import { getUser, saveUser, hashPassword, checkPassword, signToken, userKey } from '../../lib/db.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { action, email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

  // ── Register ──
  if (action === 'register') {
    const existing = await getUser(email);
    if (existing) return res.status(409).json({ error: 'Email already registered' });

    const hashed = await hashPassword(password);
    const user = {
      id: email.toLowerCase().replace(/[^a-z0-9]/g, '_'),
      email: email.toLowerCase(),
      passwordHash: hashed,
      createdAt: Date.now()
    };
    await saveUser(email, user);
    const token = signToken({ userId: user.id, email: user.email });
    return res.status(201).json({ token, userId: user.id });
  }

  // ── Login ──
  if (action === 'login') {
    const user = await getUser(email);
    if (!user) return res.status(401).json({ error: 'Invalid email or password' });

    const ok = await checkPassword(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: 'Invalid email or password' });

    const token = signToken({ userId: user.id, email: user.email });
    return res.status(200).json({ token, userId: user.id });
  }

  return res.status(400).json({ error: 'Invalid action' });
}
