import { GetServerSideProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { supabase } from '../lib/supabase';
import { computePayouts, ScoredPrediction } from '../lib/scoring';
import type { Event, Guest } from '../lib/types';

interface Props {
  event: Event;
  actualGuest: Guest;
  results: ScoredPrediction[];
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

  const { data: actualGuest } = await supabase
    .from('guests')
    .select('*')
    .eq('id', event.actual_final_guest_id)
    .single();

  if (!actualGuest) {
    return { notFound: true };
  }

  // Load predictions joined with user and guest info
  const { data: predictions } = await supabase
    .from('predictions')
    .select(`
      id,
      user_id,
      event_id,
      guest_id,
      predicted_date,
      submitted_at,
      users ( username ),
      guests ( name )
    `)
    .eq('event_id', event.id);

  type RawRow = {
    id: string;
    user_id: string;
    event_id: string;
    guest_id: string;
    predicted_date: string;
    submitted_at: string;
    users: { username: string } | null;
    guests: { name: string } | null;
  };

  const predWithDetails = ((predictions ?? []) as unknown as RawRow[]).map((p) => ({
    id: p.id,
    user_id: p.user_id,
    event_id: p.event_id,
    guest_id: p.guest_id,
    predicted_date: p.predicted_date,
    submitted_at: p.submitted_at,
    username: p.users?.username ?? 'Unknown',
    guest_name: p.guests?.name ?? 'Unknown',
  }));

  const results = computePayouts(
    predWithDetails,
    event.actual_final_guest_id!,
    event.actual_booking_date!,
    event.wager_amount
  ).sort((a, b) => b.score - a.score);

  return {
    props: {
      event: event as Event,
      actualGuest: actualGuest as Guest,
      results,
    },
  };
};

export default function ResultsPage({ event, actualGuest, results }: Props) {
  const totalPot = event.wager_amount * results.length;

  return (
    <>
      <Head>
        <title>Results — {event.name}</title>
      </Head>
      <div className="container">
        <h1>{event.name} — Results</h1>

        <div className="card">
          <h2>The Answer</h2>
          <p>
            <strong>{actualGuest.name}</strong> was the last to book, on{' '}
            <strong>{event.actual_booking_date}</strong>.
          </p>
          <p>
            Total pot: <strong>${totalPot}</strong> ({results.length} players × ${event.wager_amount})
          </p>
        </div>

        <div className="card">
          <h2>Leaderboard</h2>
          {results.length === 0 ? (
            <p>No predictions were submitted.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Player</th>
                  <th>Their Pick</th>
                  <th>Their Date</th>
                  <th>Score</th>
                  <th>Payout</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r, i) => (
                  <tr key={r.id}>
                    <td>{i + 1}</td>
                    <td>{r.username}</td>
                    <td>{r.guest_name}</td>
                    <td>{r.predicted_date}</td>
                    <td>{r.score.toFixed(2)}</td>
                    <td>${r.payout.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <p>
          <Link href="/">Back to predictions</Link>
        </p>
      </div>
    </>
  );
}
