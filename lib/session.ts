import { getIronSession, SessionOptions } from 'iron-session';
import type { IncomingMessage, ServerResponse } from 'http';
import type { SessionUser } from './types';

export interface SessionData {
  user?: SessionUser;
}

const sessionOptions: SessionOptions = {
  password: process.env.SESSION_SECRET as string,
  cookieName: 'horse_session',
  cookieOptions: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 24 * 7, // 7 days in seconds
  },
};

export function getSession(req: IncomingMessage, res: ServerResponse) {
  return getIronSession<SessionData>(req, res, sessionOptions);
}
