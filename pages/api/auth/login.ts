import type { NextApiRequest, NextApiResponse } from 'next';
import bcrypt from 'bcryptjs';
import { supabase } from '../../../lib/supabase';
import { getSession } from '../../../lib/session';

// Dummy hash used to keep bcrypt.compare timing consistent when user not found.
const DUMMY_HASH = '$2a$12$dummy.hash.to.prevent.timing.attacks.xxxxxxxxxxxxxxxxx';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { username, password } = req.body as { username?: string; password?: string };

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  const { data: user } = await supabase
    .from('users')
    .select('id, username, password_hash')
    .eq('username', username.trim())
    .maybeSingle();

  const hashToCompare = user?.password_hash ?? DUMMY_HASH;
  const valid = await bcrypt.compare(password, hashToCompare);

  if (!user || !valid) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  const session = await getSession(req, res);
  session.user = { id: user.id, username: user.username };
  await session.save();

  return res.status(200).json({ ok: true });
}
