import type { NextApiRequest, NextApiResponse } from 'next';
import { supabase } from '../../../lib/supabase';

const MIN_PLAYERS = 3;

interface Booking {
  guest_id: string;
  actual_booking_date: string;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const adminSecret = req.headers['x-admin-secret'];
  if (!adminSecret || adminSecret !== process.env.ADMIN_SECRET) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const { bookings } = req.body as { bookings?: Booking[] };

  if (!Array.isArray(bookings) || bookings.length === 0) {
    return res.status(400).json({ error: 'bookings array is required' });
  }

  for (const b of bookings) {
    if (!b.guest_id || !b.actual_booking_date) {
      return res.status(400).json({ error: 'Each booking requires guest_id and actual_booking_date' });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(b.actual_booking_date)) {
      return res.status(400).json({ error: `Invalid date format for guest ${b.guest_id} — use YYYY-MM-DD` });
    }
  }

  // Validate all guests exist and belong to the same event
  const guestIds = bookings.map((b) => b.guest_id);
  const { data: guests } = await supabase
    .from('guests')
    .select('id, event_id')
    .in('id', guestIds);

  if (!guests || guests.length !== bookings.length) {
    return res.status(404).json({ error: 'One or more guests not found' });
  }

  const eventIds = new Set(guests.map((g) => g.event_id));
  if (eventIds.size !== 1) {
    return res.status(400).json({ error: 'All guests must belong to the same event' });
  }

  const eventId = [...eventIds][0]!;

  // Check minimum players
  const { count } = await supabase
    .from('predictions')
    .select('id', { count: 'exact', head: true })
    .eq('event_id', eventId);

  if ((count ?? 0) < MIN_PLAYERS) {
    return res.status(400).json({
      error: `Minimum ${MIN_PLAYERS} players required to resolve. Currently have ${count ?? 0}.`,
    });
  }

  // Update each guest's actual_booking_date
  for (const b of bookings) {
    const { error } = await supabase
      .from('guests')
      .update({ actual_booking_date: b.actual_booking_date })
      .eq('id', b.guest_id);

    if (error) {
      return res.status(500).json({ error: `Failed to update guest ${b.guest_id}: ${error.message}` });
    }
  }

  // Mark event resolved
  const { error: eventError } = await supabase
    .from('events')
    .update({ status: 'resolved' })
    .eq('id', eventId);

  if (eventError) {
    return res.status(500).json({ error: 'Failed to resolve event' });
  }

  return res.status(200).json({ ok: true, message: 'Event resolved successfully' });
}
