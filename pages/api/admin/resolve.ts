import type { NextApiRequest, NextApiResponse } from 'next';
import { supabase } from '../../../lib/supabase';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const adminSecret = req.headers['x-admin-secret'];
  if (!adminSecret || adminSecret !== process.env.ADMIN_SECRET) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const { actual_guest_id, actual_booking_date } = req.body as {
    actual_guest_id?: string;
    actual_booking_date?: string;
  };

  if (!actual_guest_id || !actual_booking_date) {
    return res.status(400).json({ error: 'actual_guest_id and actual_booking_date are required' });
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(actual_booking_date)) {
    return res.status(400).json({ error: 'actual_booking_date must be YYYY-MM-DD' });
  }

  // Verify guest exists
  const { data: guest } = await supabase
    .from('guests')
    .select('id, event_id')
    .eq('id', actual_guest_id)
    .maybeSingle();

  if (!guest) {
    return res.status(404).json({ error: 'Guest not found' });
  }

  const { error } = await supabase
    .from('events')
    .update({
      status: 'resolved',
      actual_final_guest_id: actual_guest_id,
      actual_booking_date,
    })
    .eq('id', guest.event_id)
    .eq('status', 'open');

  if (error) {
    return res.status(500).json({ error: 'Failed to resolve event' });
  }

  return res.status(200).json({ ok: true, message: 'Event resolved successfully' });
}
