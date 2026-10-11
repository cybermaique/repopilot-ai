import {
  isTokenExpired,
  renewSession,
  type Session,
  type TokenResponse,
} from './session';

export async function authenticatedRequest(
  session: Session,
  refresh: () => Promise<TokenResponse>,
  now: number,
): Promise<{ authorization: string; session: Session }> {
  const active = isTokenExpired(session, now)
    ? renewSession(session, await refresh(), now)
    : session;
  return { authorization: `Bearer ${active.accessToken}`, session: active };
}
