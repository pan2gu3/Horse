import { GetServerSideProps } from 'next';
import { useState, FormEvent, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { getSession } from '../lib/session';
import { supabase } from '../lib/supabase';
import type { Event, Guest } from '../lib/types';

const BETTING_WINDOW_DAYS = 28;
const MIN_WAGER = 10;
const MAX_WAGER = 100;

// CSS filters applied in alphabetical name order — stable regardless of pot ranking
const HORSE_FILTERS = [
  'sepia(1) saturate(5) hue-rotate(330deg)',  // red
  'sepia(1) saturate(5) hue-rotate(195deg)',  // blue
  'sepia(1) saturate(5) hue-rotate(75deg)',   // green
  'sepia(1) saturate(5) hue-rotate(260deg)',  // purple
  'sepia(1) saturate(5) hue-rotate(20deg)',   // orange
];

interface HorseStat {
  id: string;
  name: string;
  betters: number;
  pot: number;
  colorIndex: number;
}

interface BetLogEntry {
  id: string;
  username: string;
  bet_amount: number;
  guest_name: string;
  submitted_at: string;
}

interface Props {
  sessionUsername: string | null;
  event: Event;
  horses: HorseStat[];
  betLog: BetLogEntry[];
  bettingOpen: boolean;
  windowCloseDate: string;
  guests: Guest[];
}

export const getServerSideProps: GetServerSideProps<Props> = async ({ req, res }) => {
  const session = await getSession(req, res);

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

  const { data: allPredictions } = await supabase
    .from('predictions')
    .select(`
      id, bet_amount, submitted_at, guest_id,
      users ( username ),
      guests ( name )
    `)
    .eq('event_id', event.id)
    .order('submitted_at', { ascending: false });

  type RawPred = {
    id: string;
    bet_amount: number;
    submitted_at: string;
    guest_id: string;
    users: { username: string } | null;
    guests: { name: string } | null;
  };

  const preds = ((allPredictions ?? []) as unknown as RawPred[]);

  // Aggregate per horse — colorIndex based on alphabetical position (stable)
  const statMap = new Map<string, HorseStat>();
  for (const [i, g] of (guests ?? []).entries()) {
    statMap.set(g.id, { id: g.id, name: g.name, betters: 0, pot: 0, colorIndex: i });
  }
  for (const p of preds) {
    const stat = statMap.get(p.guest_id);
    if (stat) { stat.betters += 1; stat.pot += p.bet_amount; }
  }
  const horses = [...statMap.values()].sort((a, b) => b.pot - a.pot);

  // Bet log
  const betLog: BetLogEntry[] = preds.map((p) => ({
    id: p.id,
    username: p.users?.username ?? 'Unknown',
    bet_amount: p.bet_amount,
    guest_name: p.guests?.name ?? 'Unknown',
    submitted_at: p.submitted_at,
  }));

  const windowCloseMs = new Date(event.created_at).getTime() + BETTING_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const bettingOpen = Date.now() <= windowCloseMs;
  const windowCloseDate = new Date(windowCloseMs).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  return {
    props: {
      sessionUsername: session.user?.username ?? null,
      event: event as Event,
      horses,
      betLog,
      bettingOpen,
      windowCloseDate,
      guests: (guests ?? []) as Guest[],
    },
  };
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

export default function IndexPage({
  sessionUsername, event, horses, betLog, bettingOpen, windowCloseDate, guests,
}: Props) {
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);
  const [toast, setToast] = useState('');
  const [guestId, setGuestId] = useState('');
  const [date, setDate] = useState('');
  const [betAmount, setBetAmount] = useState('');
  const [formError, setFormError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  function handlePlaceBet() {
    if (!sessionUsername) {
      setToast('You have to be logged in to place a bet');
      return;
    }
    setModalOpen(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError('');

    const wager = Number(betAmount);
    if (!Number.isInteger(wager) || wager < MIN_WAGER || wager > MAX_WAGER) {
      setFormError(`Bet must be a whole number between $${MIN_WAGER} and $${MAX_WAGER}`);
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
      setFormError(data.error ?? 'Failed to save prediction');
      return;
    }

    setModalOpen(false);

    // Fire confetti then reload after 3s
    const { default: confetti } = await import('canvas-confetti');
    const colors = ['#ff4b4b', '#4b8fff', '#4bff91', '#ffcc4b', '#cc4bff'];
    confetti({ particleCount: 80, spread: 70, origin: { y: 0.6 }, colors });
    setTimeout(() => {
      confetti({ angle: 60, spread: 60, particleCount: 60, origin: { x: 0 }, colors });
      confetti({ angle: 120, spread: 60, particleCount: 60, origin: { x: 1 }, colors });
    }, 300);
    setTimeout(() => router.reload(), 3000);
  }

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  }

  const totalPot = horses.reduce((s, h) => s + h.pot, 0);

  return (
    <>
      <Head><title>{event.name} — Horse</title></Head>

      <div className="container">
        {/* Nav */}
        <div className="nav">
          <h1>{event.name}</h1>
          <div className="nav-links">
            {sessionUsername ? (
              <>
                <span>Hi, {sessionUsername}</span>
                <button className="btn-secondary" onClick={handleLogout}>Log Out</button>
              </>
            ) : (
              <a href="/login">Log In</a>
            )}
          </div>
        </div>

        {/* Info */}
        <div className="card info-card">
          <p className="info-lead">
            Place bets on when each of these <em>(slow)</em> horses will book flights for Ryan&apos;s bachelor party.
          </p>

          <div className="info-section">
            <h3>Rules</h3>
            <ul className="info-rules">
              <li>Place a prediction for when you think each horse will buy their flight tickets to NCE (or Europe).</li>
              <li>Scoring depends on how close you are to the actual booking day, your bet size, and how early you place your prediction.</li>
            </ul>
          </div>

          <div className="info-section">
            <h3>Scoring</h3>
            <div className="formula-block">
              <div className="formula-main">
                <span className="formula-var">S</span>
                {' = '}
                <span className="formula-frac">
                  <span className="formula-num"><span className="formula-var">W</span></span>
                  <span className="formula-den">1 + <span className="formula-var">E</span></span>
                </span>
                {' × (3 − '}
                <span className="formula-var">t</span>
                {' / 14)'}
              </div>
              <dl className="formula-legend">
                <div><dt><span className="formula-var">E</span></dt><dd>|predicted date − actual booking date| in days</dd></div>
                <div><dt><span className="formula-var">t</span></dt><dd>days since the market opened (capped at 28)</dd></div>
                <div><dt><span className="formula-var">W</span></dt><dd>your wager ($10–$100)</dd></div>
              </dl>
            </div>
          </div>

          <div className="info-section">
            <h3>Payouts</h3>
            <ul className="info-rules">
              <li>🥇 Highest score for each horse wins <strong>75%</strong> of that horse&apos;s pot.</li>
              <li>🥈 Second highest wins <strong>25%</strong>.</li>
            </ul>
          </div>
        </div>

        {/* Horses */}
        <div className="card">
          <div className="horses-header">
            <span className="horses-title">Horses</span>
            <span className="horses-total">Total pot: <strong>${totalPot}</strong></span>
          </div>
          <div className="horse-list">
            {horses.map((h, i) => (
              <div key={h.id} className="horse-row">
                <div className="horse-rank-name">
                  <span className="horse-rank">{i + 1}</span>
                  <span
                    className="horse-emoji"
                    style={{ filter: HORSE_FILTERS[h.colorIndex % HORSE_FILTERS.length] }}
                  >🐴</span>
                  <span className="horse-name">{h.name}</span>
                </div>
                <div className="horse-stats">
                  <span className="horse-betters">{h.betters} {h.betters === 1 ? 'better' : 'betters'}</span>
                  <span className="horse-pot">${h.pot}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="place-bet-row">
            {bettingOpen ? (
              <button className="btn-primary" onClick={handlePlaceBet}>+ Place Bet</button>
            ) : (
              <p className="betting-closed">Betting closed {windowCloseDate}</p>
            )}
          </div>
        </div>

        {/* Bet Log */}
        <div className="card">
          <h2>Bet Log</h2>
          {betLog.length === 0 ? (
            <p style={{ color: '#888' }}>No bets yet. Be the first!</p>
          ) : (
            <ul className="bet-log">
              {betLog.map((b) => (
                <li key={b.id} className="bet-log-entry">
                  <span className="bet-log-date">{formatDate(b.submitted_at)}</span>
                  <span className="bet-log-text">
                    <strong>{b.username}</strong> bet <strong>${b.bet_amount}</strong> on <strong>{b.guest_name}</strong>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Modal */}
      {modalOpen && (
        <div className="modal-overlay" onClick={() => setModalOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setModalOpen(false)}>✕</button>

            <>
              <h2>Place Your Bet</h2>
              <p style={{ fontSize: '0.9rem', color: '#555', marginBottom: '1rem' }}>
                Closes <strong>{windowCloseDate}</strong>.
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
                {formError && <p className="error">{formError}</p>}
                <button type="submit" disabled={loading}>
                  {loading ? 'Locking in…' : 'Lock In Prediction'}
                </button>
              </form>
            </>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="toast">{toast}</div>
      )}
    </>
  );
}
