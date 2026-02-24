import { GetServerSideProps } from 'next';
import { useState, FormEvent } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import { getSession } from '../lib/session';
import { supabase } from '../lib/supabase';
import type { Event, Guest, Prediction } from '../lib/types';

interface Props {
  username: string;
  event: Event;
  guests: Guest[];
  existing: Prediction | null;
}

export const getServerSideProps: GetServerSideProps<Props> = async ({ req, res }) => {
  const session = await getSession(req, res);

  if (!session.user) {
    return { redirect: { destination: '/login', permanent: false } };
  }

  // Load event
  const { data: event } = await supabase
    .from('events')
    .select('*')
    .order('created_at', { ascending: true })
    .limit(1)
    .single();

  if (!event) {
    return { notFound: true };
  }

  if (event.status === 'resolved') {
    return { redirect: { destination: '/results', permanent: false } };
  }

  // Load guests
  const { data: guests } = await supabase
    .from('guests')
    .select('*')
    .eq('event_id', event.id)
    .order('name', { ascending: true });

  // Load existing prediction for this user
  const { data: existing } = await supabase
    .from('predictions')
    .select('*')
    .eq('user_id', session.user.id)
    .eq('event_id', event.id)
    .maybeSingle();

  return {
    props: {
      username: session.user.username,
      event: event as Event,
      guests: (guests ?? []) as Guest[],
      existing: (existing ?? null) as Prediction | null,
    },
  };
};

export default function IndexPage({ username, event, guests, existing }: Props) {
  const router = useRouter();
  const [guestId, setGuestId] = useState(existing?.guest_id ?? '');
  const [date, setDate] = useState(existing?.predicted_date ?? '');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    const res = await fetch('/api/predict', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event_id: event.id,
        guest_id: guestId,
        predicted_date: date,
      }),
    });

    const data = await res.json() as { error?: string };
    setLoading(false);

    if (!res.ok) {
      setError(data.error ?? 'Failed to save prediction');
      return;
    }

    setSuccess(existing ? 'Prediction updated!' : 'Prediction submitted!');
  }

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    await router.push('/login');
  }

  return (
    <>
      <Head>
        <title>{event.name} — Horse</title>
      </Head>
      <div className="container">
        <div className="nav">
          <h1>{event.name}</h1>
          <div className="nav-links">
            <span>Hi, {username}</span>
            <button className="btn-secondary" onClick={handleLogout}>
              Log Out
            </button>
          </div>
        </div>

        <div className="card">
          <h2>Your Prediction</h2>
          <p>
            Who will book their hotel last? Each player puts in ${event.wager_amount}.
            Payouts are weighted by how close you are to the actual date.
          </p>
          <form onSubmit={handleSubmit}>
            <label>
              Who books last?
              <select
                value={guestId}
                onChange={(e) => setGuestId(e.target.value)}
                required
              >
                <option value="" disabled>
                  Select a guest…
                </option>
                {guests.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              On what date will they book?
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </label>
            {error && <p className="error">{error}</p>}
            {success && <p className="success">{success}</p>}
            <button type="submit" disabled={loading}>
              {loading ? 'Saving…' : existing ? 'Update Prediction' : 'Submit Prediction'}
            </button>
          </form>
        </div>

        <p>
          <Link href="/results">View results</Link> (visible once event is resolved)
        </p>
      </div>
    </>
  );
}
