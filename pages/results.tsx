import { GetServerSideProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { supabase } from '../lib/supabase';
import { computePayouts, ScoredPrediction, dateDiffDays } from '../lib/scoring';
import type { Event } from '../lib/types';

const MIN_PLAYERS = 3;

interface Props {
  event: Event;
  results: ScoredPrediction[];
  totalPot: number;
  hasEnoughPlayers: boolean;
}

export const getServerSideProps: GetServerSideProps<Props> = async () => {
  const { data: event } = await supabase
    .from('events')
    .select('*')
    .order('created_at', { ascending: true })
    .limit(1)
    .single();

  if (!event || event.status !== 'resolved') {
    return { redirect: { destination: '/', permanent: false } };
  }

  const { data: predictions } = await supabase
    .from('predictions')
    .select(`
      id, user_id, event_id, guest_id, predicted_date, bet_amount, submitted_at,
      users ( username ),
      guests ( name, actual_booking_date )
    `)
    .eq('event_id', event.id);

  type RawRow = {
    id: string;
    user_id: string;
    event_id: string;
    guest_id: string;
    predicted_date: string;
    bet_amount: number;
    submitted_at: string;
    users: { username: string } | null;
    guests: { name: string; actual_booking_date: string | null } | null;
  };

  const predWithDetails = ((predictions ?? []) as unknown as RawRow[]).map((p) => ({
    id: p.id,
    user_id: p.user_id,
    event_id: p.event_id,
    guest_id: p.guest_id,
    predicted_date: p.predicted_date,
    bet_amount: p.bet_amount,
    submitted_at: p.submitted_at,
    username: p.users?.username ?? 'Unknown',
    guest_name: p.guests?.name ?? 'Unknown',
    actual_booking_date: p.guests?.actual_booking_date ?? null,
  }));

  const results = computePayouts(predWithDetails, event.created_at)
    .sort((a, b) => b.score - a.score);

  const totalPot = predWithDetails.reduce((sum, p) => sum + p.bet_amount, 0);
  const hasEnoughPlayers = predWithDetails.length >= MIN_PLAYERS;

  return {
    props: {
      event: event as Event,
      results,
      totalPot,
      hasEnoughPlayers,
    },
  };
};

export default function ResultsPage({ event, results, totalPot, hasEnoughPlayers }: Props) {
  return (
    <>
      <Head>
        <title>Results — {event.name}</title>
      </Head>
      <div className="container">
        <h1>{event.name} — Results</h1>

        <div className="card">
          <h2>Event resolved</h2>
          <p>Total pot: <strong>${totalPot}</strong> across {results.length} player{results.length !== 1 ? 's' : ''}</p>
          {!hasEnoughPlayers && (
            <p className="error">
              Minimum {MIN_PLAYERS} players required — results unavailable ({results.length} submitted).
            </p>
          )}
        </div>

        {hasEnoughPlayers && (
          <div className="card">
            <h2>Leaderboard</h2>
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Player</th>
                  <th>Horse</th>
                  <th>Predicted</th>
                  <th>Actual</th>
                  <th>Error</th>
                  <th>Wager</th>
                  <th>Score</th>
                  <th>Payout</th>
                  <th>Net</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r, i) => {
                  const isTop2 = i < 2 && r.payout > 0;
                  const errorDays = r.actual_booking_date
                    ? dateDiffDays(r.predicted_date, r.actual_booking_date)
                    : null;
                  return (
                    <tr key={r.id} style={isTop2 ? { fontWeight: 'bold', background: i === 0 ? '#fffbe6' : '#f0fff4' } : undefined}>
                      <td>{i + 1}</td>
                      <td>{r.username}</td>
                      <td>{r.guest_name}</td>
                      <td>{r.predicted_date}</td>
                      <td>{r.actual_booking_date ?? '—'}</td>
                      <td>{errorDays !== null ? `${errorDays}d` : '—'}</td>
                      <td>${r.bet_amount}</td>
                      <td>{r.score.toFixed(2)}</td>
                      <td>${r.payout.toFixed(2)}</td>
                      <td style={{ color: r.net >= 0 ? '#070' : '#d00' }}>
                        {r.net >= 0 ? '+' : ''}{r.net.toFixed(2)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <p><Link href="/">Back to predictions</Link></p>
      </div>
    </>
  );
}
