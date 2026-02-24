export interface Event {
  id: string;
  name: string;
  status: 'open' | 'resolved';
  created_at: string;
}

export interface Guest {
  id: string;
  event_id: string;
  name: string;
  actual_booking_date: string | null;
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
  bet_amount: number;
  submitted_at: string;
}

export interface PredictionWithDetails extends Prediction {
  username: string;
  guest_name: string;
  actual_booking_date: string | null;
}

export interface SessionUser {
  id: string;
  username: string;
}
