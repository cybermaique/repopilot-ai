import type { RunEvent } from '@repopilot/api-client';

export function mergeEvents(previous: RunEvent[], incoming: RunEvent[]) {
  const bySequence = new Map(previous.map((event) => [event.sequence, event]));
  for (const event of incoming) bySequence.set(event.sequence, event);
  return [...bySequence.values()].sort((a, b) => a.sequence - b.sequence);
}
