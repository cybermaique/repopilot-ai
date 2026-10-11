# Sample session client

This synthetic TypeScript fixture illustrates authentication session renewal. It contains no actual credentials, services or private code.

`createSession` sets expiresAt using now plus expiresInSeconds converted to milliseconds. `isTokenExpired` checks now >= expiresAt. `authenticatedRequest` renews expired sessions and returns a Bearer authorization header.

`retryRequest` retries at most three times by default, then throws the last error. It has no backoff delay.

The renewal bug is documented in docs/token-renewal.md. No billing, Kubernetes deployment, database configuration or OAuth server is implemented here.
