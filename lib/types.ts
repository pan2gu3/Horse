export interface Event {
  id: string;
  name: string;
  wager_amount: number;
  status: 'open' | 'resolved';
  actual_final_guest_id: string | null;
  actual_booking_date: string | null;
  created_at: string;
}

export interface Guest {
  id: string;
  event_id: string;
  name: string;
}

export interface User {
  id: string;
  username: string;
  password_hash: string;
  created_at: string;
}

export interface Prediction {
  id: string;
  user_id: string;
  event_id: string;
  guest_id: string;
  predicted_date: string;
  submitted_at: string;
}

export interface PredictionWithDetails extends Prediction {
  username: string;
  guest_name: string;
}

export interface SessionUser {
  id: string;
  username: string;
}
