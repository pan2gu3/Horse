import { GetServerSideProps } from 'next';
import { useState, FormEvent } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import { getSession } from '../lib/session';
import { supabase } from '../lib/supabase';
import type { Event, Guest, Prediction } from '../lib/types';

const BETTING_WINDOW_DAYS = 28;
const MIN_WAGER = 10;
const MAX_WAGER = 100;

interface Props {
  username: string;
  event: Event;
  guests: Guest[];
  existing: Prediction | null;
  bettingOpen: boolean;
  windowCloseDate: string;
}

export const getServerSideProps: GetServerSideProps<Props> = async ({ req, res }) => {
  const session = await getSession(req, res);

  if (!session.user) {
    return { redirect: { destination: '/login', permanent: false } };
  }

  const { data: event } = await supabase
    .from('events')
    .select('*')
    .order('created_at', { ascending: true })
    .limit(1)
    .single();

  if (!event) return { notFound: true };

  if (event.status === 'resolved') {
    return { redirect: { destination: '/results', permanent: false } };
  }

  const { data: guests } = await supabase
    .from('guests')
    .select('*')
    .eq('event_id', event.id)
    .order('name', { ascending: true });

  const { data: existing } = await supabase
    .from('predictions')
    .select('*')
    .eq('user_id', session.user.id)
    .eq('event_id', event.id)
    .maybeSingle();

  const windowCloseMs = new Date(event.created_at).getTime() + BETTING_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const bettingOpen = Date.now() <= windowCloseMs;
  const windowCloseDate = new Date(windowCloseMs).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  return {
    props: {
      username: session.user.username,
      event: event as Event,
      guests: (guests ?? []) as Guest[],
      existing: (existing ?? null) as Prediction | null,
      bettingOpen,
      windowCloseDate,
    },
  };
};

export default function IndexPage({ username, event, guests, existing, bettingOpen, windowCloseDate }: Props) {
  const router = useRouter();
  const [guestId, setGuestId] = useState('');
  const [date, setDate] = useState('');
  const [betAmount, setBetAmount] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess('');

    const wager = Number(betAmount);
    if (!Number.isInteger(wager) || wager < MIN_WAGER || wager > MAX_WAGER) {
      setError(`Bet must be a whole number between $${MIN_WAGER} and $${MAX_WAGER}`);
      return;
    }

    setLoading(true);
    const res = await fetch('/api/predict', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_id: event.id, guest_id: guestId, predicted_date: date, bet_amount: wager }),
    });

    const data = await res.json() as { error?: string };
    setLoading(false);

    if (!res.ok) {
      setError(data.error ?? 'Failed to save prediction');
      return;
    }

    setSuccess('Prediction locked in!');
    router.reload();
  }

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    await router.push('/login');
  }

  const existingGuest = guests.find((g) => g.id === existing?.guest_id);

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
            <button className="btn-secondary" onClick={handleLogout}>Log Out</button>
          </div>
        </div>

        {existing ? (
          <div className="card">
            <h2>Your Prediction</h2>
            <p>Your prediction is locked. Good luck!</p>
            <table>
              <tbody>
                <tr><th>Horse</th><td>{existingGuest?.name ?? '—'}</td></tr>
                <tr><th>Predicted date</th><td>{existing.predicted_date}</td></tr>
                <tr><th>Wager</th><td>${existing.bet_amount}</td></tr>
                <tr><th>Submitted</th><td>{new Date(existing.submitted_at).toLocaleString()}</td></tr>
              </tbody>
            </table>
          </div>
        ) : !bettingOpen ? (
          <div className="card">
            <h2>Betting Closed</h2>
            <p>The 28-day betting window closed on {windowCloseDate}. No more predictions are accepted.</p>
          </div>
        ) : (
          <div className="card">
            <h2>Place Your Bet</h2>
            <p>
              Pick your horse, predict when they&apos;ll book, and set your wager (${MIN_WAGER}–${MAX_WAGER}).
              Betting window closes <strong>{windowCloseDate}</strong>. <strong>Predictions are final.</strong>
            </p>
            <form onSubmit={handleSubmit}>
              <label>
                Horse
                <select value={guestId} onChange={(e) => setGuestId(e.target.value)} required>
                  <option value="" disabled>Select a horse…</option>
                  {guests.map((g) => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </select>
              </label>
              <label>
                Predicted booking date
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  required
                />
              </label>
              <label>
                Wager (${MIN_WAGER}–${MAX_WAGER})
                <input
                  type="number"
                  min={MIN_WAGER}
                  max={MAX_WAGER}
                  step={1}
                  value={betAmount}
                  onChange={(e) => setBetAmount(e.target.value)}
                  placeholder="e.g. 50"
                  required
                />
              </label>
              {error && <p className="error">{error}</p>}
              {success && <p className="success">{success}</p>}
              <button type="submit" disabled={loading}>
                {loading ? 'Locking in…' : 'Lock In Prediction'}
              </button>
            </form>
          </div>
        )}

        <p><Link href="/results">View results</Link> (visible once event is resolved)</p>
      </div>
    </>
  );
}
