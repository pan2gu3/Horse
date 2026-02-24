import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Lazy proxy — client is created on first property access, not at module load.
// This prevents build failures when env vars aren't available at compile time.
function makeLazyClient(): SupabaseClient {
  let instance: SupabaseClient | undefined;
  return new Proxy({} as SupabaseClient, {
    get(_, prop: string | symbol) {
      if (!instance) {
        instance = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
          { auth: { persistSession: false } }
        );
      }
      const val = (instance as unknown as Record<string | symbol, unknown>)[prop];
      return typeof val === 'function' ? (val as (...args: unknown[]) => unknown).bind(instance) : val;
    },
  });
}

export const supabase = makeLazyClient();
