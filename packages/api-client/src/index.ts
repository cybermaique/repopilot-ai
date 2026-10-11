import createClient from 'openapi-fetch';
import type { paths, components } from './schema';

export const api = createClient<paths>({ baseUrl: '' });
export type { paths, components } from './schema';
export type Run = components['schemas']['RunDto'];
export type Source = components['schemas']['SourceDto'];
export type RunEvent = components['schemas']['EventDto'];
export type Repository = components['schemas']['RepositoryDto'];
export type RepositoryDetail = components['schemas']['RepositoryDetailDto'];

export function requireData<T>(result: {
  data?: T;
  error?: unknown;
  response: Response;
}): T {
  if (result.error || !result.response.ok || result.data === undefined) {
    const body = result.error;
    const message =
      body && typeof body === 'object' && 'message' in body
        ? String(body.message)
        : 'Request failed. Check local services and try again.';
    throw new Error(message);
  }
  return result.data;
}

// SSE framing is transport logic; event payload type is generated from the same OpenAPI.
export function streamRun(
  id: string,
  after: number,
  onEvent: (event: RunEvent) => void,
  onError: () => void,
) {
  const stream = new EventSource(
    `/api/runs/${encodeURIComponent(id)}/stream?after=${after}`,
  );
  stream.addEventListener('run', (message: MessageEvent<string>) => {
    try {
      onEvent(JSON.parse(message.data) as RunEvent);
    } catch {
      onError();
    }
  });
  stream.onerror = onError;
  return () => stream.close();
}
