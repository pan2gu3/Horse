import type { NextApiRequest, NextApiResponse } from 'next';
import { supabase } from '../../lib/supabase';
import { getSession } from '../../lib/session';

const BETTING_WINDOW_DAYS = 28;
const MIN_WAGER = 10;
const MAX_WAGER = 100;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await getSession(req, res);
  if (!session.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const { event_id, guest_id, predicted_date, bet_amount } = req.body as {
    event_id?: string;
    guest_id?: string;
    predicted_date?: string;
    bet_amount?: unknown;
  };

  if (!event_id || !guest_id || !predicted_date || bet_amount === undefined) {
    return res.status(400).json({ error: 'event_id, guest_id, predicted_date, and bet_amount are required' });
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(predicted_date)) {
    return res.status(400).json({ error: 'predicted_date must be YYYY-MM-DD' });
  }

  const wager = Number(bet_amount);
  if (!Number.isInteger(wager) || wager < MIN_WAGER || wager > MAX_WAGER) {
    return res.status(400).json({ error: `bet_amount must be a whole number between ${MIN_WAGER} and ${MAX_WAGER}` });
  }

  // Load event
  const { data: event } = await supabase
    .from('events')
    .select('id, status, created_at')
    .eq('id', event_id)
    .maybeSingle();

  if (!event) return res.status(404).json({ error: 'Event not found' });
  if (event.status !== 'open') return res.status(400).json({ error: 'Predictions are closed for this event' });

  // Check betting window
  const windowCloseMs = new Date(event.created_at).getTime() + BETTING_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  if (Date.now() > windowCloseMs) {
    return res.status(400).json({ error: 'Betting window has closed (28 days after event creation)' });
  }

  // Validate guest belongs to event
  const { data: guest } = await supabase
    .from('guests')
    .select('id')
    .eq('id', guest_id)
    .eq('event_id', event_id)
    .maybeSingle();

  if (!guest) return res.status(400).json({ error: 'Guest not found in this event' });

  // Check prediction doesn't already exist (locked — no updates)
  const { data: existing } = await supabase
    .from('predictions')
    .select('id')
    .eq('user_id', session.user.id)
    .eq('event_id', event_id)
    .maybeSingle();

  if (existing) {
    return res.status(400).json({ error: 'You have already submitted a prediction and it cannot be changed' });
  }

  const { error } = await supabase.from('predictions').insert({
    user_id: session.user.id,
    event_id,
    guest_id,
    predicted_date,
    bet_amount: wager,
    submitted_at: new Date().toISOString(),
  });

  if (error) return res.status(500).json({ error: 'Failed to save prediction' });

  return res.status(200).json({ ok: true });
}
