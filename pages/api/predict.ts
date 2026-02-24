import type { NextApiRequest, NextApiResponse } from 'next';
import { supabase } from '../../lib/supabase';
import { getSession } from '../../lib/session';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await getSession(req, res);
  if (!session.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const { event_id, guest_id, predicted_date } = req.body as {
    event_id?: string;
    guest_id?: string;
    predicted_date?: string;
  };

  if (!event_id || !guest_id || !predicted_date) {
    return res.status(400).json({ error: 'event_id, guest_id, and predicted_date are required' });
  }

  // Validate date format
  if (!/^\d{4}-\d{2}-\d{2}$/.test(predicted_date)) {
    return res.status(400).json({ error: 'predicted_date must be YYYY-MM-DD' });
  }

  // Check event is open
  const { data: event } = await supabase
    .from('events')
    .select('id, status')
    .eq('id', event_id)
    .maybeSingle();

  if (!event) {
    return res.status(404).json({ error: 'Event not found' });
  }
  if (event.status !== 'open') {
    return res.status(400).json({ error: 'Predictions are closed for this event' });
  }

  // Validate guest belongs to event
  const { data: guest } = await supabase
    .from('guests')
    .select('id')
    .eq('id', guest_id)
    .eq('event_id', event_id)
    .maybeSingle();

  if (!guest) {
    return res.status(400).json({ error: 'Guest not found in this event' });
  }

  // Upsert prediction
  const { error } = await supabase
    .from('predictions')
    .upsert(
      {
        user_id: session.user.id,
        event_id,
        guest_id,
        predicted_date,
        submitted_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,event_id' }
    );

  if (error) {
    return res.status(500).json({ error: 'Failed to save prediction' });
  }

  return res.status(200).json({ ok: true });
}
