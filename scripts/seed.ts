import { createClient } from '@supabase/supabase-js';
import gameConfig from '../game.config';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

async function seed() {
  console.log('Checking if event already exists...');

  const { data: existing, error: checkError } = await supabase
    .from('events')
    .select('id, name')
    .eq('name', gameConfig.eventName)
    .maybeSingle();

  if (checkError) {
    console.error('Error checking for existing event:', checkError.message);
    process.exit(1);
  }

  if (existing) {
    console.log(`Event "${existing.name}" already exists (id: ${existing.id}). Skipping seed.`);
    process.exit(0);
  }

  console.log(`Creating event: "${gameConfig.eventName}"...`);

  const { data: event, error: eventError } = await supabase
    .from('events')
    .insert({
      name: gameConfig.eventName,
      wager_amount: gameConfig.wagerAmount,
      status: 'open',
    })
    .select()
    .single();

  if (eventError || !event) {
    console.error('Error creating event:', eventError?.message);
    process.exit(1);
  }

  console.log(`Event created: ${event.id}`);

  const guestRows = gameConfig.guests.map((name) => ({
    event_id: event.id,
    name,
  }));

  const { data: guests, error: guestsError } = await supabase
    .from('guests')
    .insert(guestRows)
    .select();

  if (guestsError || !guests) {
    console.error('Error creating guests:', guestsError?.message);
    process.exit(1);
  }

  console.log('\nGuests created:');
  for (const g of guests) {
    console.log(`  ${g.id}  ${g.name}`);
  }

  console.log('\nSeed complete!');
}

seed();
