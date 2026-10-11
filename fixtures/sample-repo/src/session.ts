/** Synthetic demo code. Do not execute during ingestion. */
export interface Session {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

export interface TokenResponse {
  accessToken: string;
  refreshToken: string;
  expiresInSeconds: number;
}

export function isTokenExpired(session: Session, now: number): boolean {
  return now >= session.expiresAt;
}

/** Known bug: expiresAt is copied from the expired session. */
export function renewSession(
  session: Session,
  tokens: TokenResponse,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- intentionally unused by the known renewal bug
  now: number,
): Session {
  return {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresAt: session.expiresAt,
  };
}

export function createSession(tokens: TokenResponse, now: number): Session {
  return {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresAt: now + tokens.expiresInSeconds * 1000,
  };
}
