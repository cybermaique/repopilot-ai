# Token renewal investigation

Known issue: renewSession copies session.expiresAt instead of calculating a new expiration timestamp. After an expired session is renewed, isTokenExpired still returns true. authenticatedRequest then refreshes again on subsequent calls.

Expected behavior: renewSession should calculate expiresAt as now + tokens.expiresInSeconds * 1000, matching createSession. Preserve the newly returned accessToken and refreshToken.

Proposed fix plan: change the expiresAt assignment in src/session.ts; add tests for expiration equality, renewal with a positive lifetime, and two consecutive authenticatedRequest calls. This is a documented plan, not an applied patch or executed test.

Time values: now and expiresAt are Unix timestamps in milliseconds. expiresInSeconds is a duration in seconds. A token is expired at exact equality (now >= expiresAt).
