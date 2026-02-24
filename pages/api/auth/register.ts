import type { NextApiRequest, NextApiResponse } from 'next';
import bcrypt from 'bcryptjs';
import { supabase } from '../../../lib/supabase';
import { getSession } from '../../../lib/session';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { username, password } = req.body as { username?: string; password?: string };

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  const trimmedUsername = username.trim();
  if (trimmedUsername.length < 2) {
    return res.status(400).json({ error: 'Username must be at least 2 characters' });
  }
  if (password.length < 4) {
    return res.status(400).json({ error: 'Password must be at least 4 characters' });
  }

  const { data: existing } = await supabase
    .from('users')
    .select('id')
    .eq('username', trimmedUsername)
    .maybeSingle();

  if (existing) {
    return res.status(400).json({ error: 'Username already taken' });
  }

  const password_hash = await bcrypt.hash(password, 12);

  const { data: user, error } = await supabase
    .from('users')
    .insert({ username: trimmedUsername, password_hash })
    .select('id, username')
    .single();

  if (error || !user) {
    return res.status(500).json({ error: 'Failed to create user' });
  }

  const session = await getSession(req, res);
  session.user = { id: user.id, username: user.username };
  await session.save();

  return res.status(200).json({ ok: true });
}
