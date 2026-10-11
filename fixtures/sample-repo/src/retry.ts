export async function retryRequest<T>(
  request: () => Promise<T>,
  maxAttempts = 3,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      return await request();
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}
