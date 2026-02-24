/**
 * Resolve the event by setting each horse's actual booking date.
 *
 * Usage:
 *   npm run resolve -- "Alex=2026-03-23" "Bryan=2026-05-21"
 *   npm run resolve -- "Alex=2026-03-23" "Bryan=2026-05-21" "Troy=2026-06-01"
 *
 * - Matches horses by name (case-insensitive)
 * - You can set dates for some horses without resolving (if others are missing)
 * - Event is marked resolved once ALL horses have a booking date
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

// Parse "Name=YYYY-MM-DD" args
const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Usage: npm run resolve -- "Alex=2026-03-23" "Bryan=2026-05-21"');
  process.exit(1);
}

const bookings: { name: string; date: string }[] = [];
for (const arg of args) {
  const match = arg.match(/^([^=]+)=(\d{4}-\d{2}-\d{2})$/);
  if (!match) {
    console.error(`Bad argument: "${arg}"  →  expected format: Name=YYYY-MM-DD`);
    process.exit(1);
  }
  bookings.push({ name: match[1]!.trim(), date: match[2]! });
}

async function main() {
  // Load event
  const { data: event } = await supabase
    .from('events')
    .select('id, name, status')
    .order('created_at', { ascending: true })
    .limit(1)
    .single();

  if (!event) { console.error('No event found.'); process.exit(1); }
  console.log(`Event: ${event.name}  (${event.status})\n`);

  // Load guests
  const { data: guests } = await supabase
    .from('guests')
    .select('id, name, actual_booking_date')
    .eq('event_id', event.id)
    .order('name');

  if (!guests?.length) { console.error('No horses found.'); process.exit(1); }

  // Match by name (case-insensitive)
  for (const b of bookings) {
    const guest = guests.find(g => g.name.toLowerCase() === b.name.toLowerCase());
    if (!guest) {
      const known = guests.map(g => g.name).join(', ');
      console.error(`Horse "${b.name}" not found.  Known horses: ${known}`);
      process.exit(1);
    }

    const { error } = await supabase
      .from('guests')
      .update({ actual_booking_date: b.date })
      .eq('id', guest.id);

    if (error) { console.error(`Failed to update ${guest.name}: ${error.message}`); process.exit(1); }
    console.log(`✓ ${guest.name.padEnd(10)} ${b.date}`);

    // Update in-memory so the all-set check below sees the new value
    guest.actual_booking_date = b.date;
  }

  // Resolve event if all horses now have dates
  const missing = guests.filter(g => !g.actual_booking_date);
  if (missing.length > 0) {
    console.log(`\n⚠  Still missing dates for: ${missing.map(g => g.name).join(', ')}`);
    console.log('   Event NOT resolved yet — run again with their dates to finalize.');
  } else {
    const { error } = await supabase
      .from('events')
      .update({ status: 'resolved' })
      .eq('id', event.id);

    if (error) { console.error(`Failed to resolve event: ${error.message}`); process.exit(1); }
    console.log('\n✓ Event resolved!');
  }
}

main().catch(err => { console.error(err); process.exit(1); });
