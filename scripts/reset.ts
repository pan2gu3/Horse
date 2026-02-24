import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

const ALL = { neq: ['id', '00000000-0000-0000-0000-000000000000'] } as const;

async function del(table: string) {
  const { error } = await supabase.from(table).delete().neq('id', '00000000-0000-0000-0000-000000000000');
  if (error) { console.error(`Error deleting ${table}:`, error.message); process.exit(1); }
  console.log(`  ✓ ${table} cleared`);
}

async function reset() {
  console.log('Resetting database...');
  // Order matters: predictions → events (cascades guests) → users
  await del('predictions');
  await del('events');   // cascades to guests
  await del('users');
  console.log('Reset complete. Run `npm run seed` or `npm run fresh` to start fresh.');
}

reset();
