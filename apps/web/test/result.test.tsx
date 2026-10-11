import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { Run, Source } from '@repopilot/api-client';
import { RunResult, SourceContent } from '../components/run-result';
import { mergeEvents } from '../components/events';

afterEach(cleanup);
const source: Source = {
  sourceId: 'source-1',
  snapshotId: 'snapshot-1',
  path: 'src/session.ts',
  revision: 'a'.repeat(64),
  startLine: 14,
  endLine: 16,
  content: 'function isTokenExpired() {\n  return true;\n}',
};
const run: Run = {
  id: 'run-1',
  repositoryId: 'repo-1',
  conversationId: 'conversation-1',
  snapshotId: 'snapshot-1',
  kind: 'question',
  question: 'isTokenExpired',
  status: 'completed',
  cancelRequested: false,
  createdAt: '2026-10-11T10:00:00Z',
  finishedAt: '2026-10-11T10:00:01Z',
  indexResult: null,
  error: null,
  answer: {
    provider: 'demo',
    evidence: 'supported',
    summary: 'Extracted evidence.',
    durationMs: 5,
    limitation: 'Demo only. No LLM.',
    sources: [source],
    findings: [
      { text: '<script>untrusted()</script>', sourceIds: [source.sourceId] },
    ],
  },
};
describe('evidence presentation', () => {
  it('labels demo output, displays untrusted text safely and opens the actual source', () => {
    const onSource = vi.fn();
    const { container } = render(<RunResult run={run} onSource={onSource} />);
    expect(screen.getByText('5 ms · Demo provider')).toBeInTheDocument();
    expect(
      screen.getByText('<script>untrusted()</script>'),
    ).toBeInTheDocument();
    expect(container.querySelector('script')).toBeNull();
    fireEvent.click(
      screen.getByRole('button', { name: 'Open source src/session.ts' }),
    );
    expect(onSource).toHaveBeenCalledWith('source-1');
  });
  it('makes insufficient evidence visible', () => {
    render(
      <RunResult
        run={{
          ...run,
          answer: {
            ...run.answer!,
            evidence: 'insufficient',
            findings: [],
            sources: [],
            summary: 'Insufficient evidence.',
          },
        }}
        onSource={vi.fn()}
      />,
    );
    expect(screen.getByText('Insufficient evidence')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });
  it('shows failure and cancellation states', () => {
    const { rerender } = render(
      <RunResult
        run={{
          ...run,
          status: 'failed',
          answer: null,
          error: 'Lease expired.',
        }}
        onSource={vi.fn()}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Lease expired.');
    rerender(
      <RunResult
        run={{ ...run, status: 'cancelled', answer: null }}
        onSource={vi.fn()}
      />,
    );
    expect(screen.getByText(/Run cancelled/)).toBeInTheDocument();
  });
  it('shows revision and correct original line numbers', () => {
    render(<SourceContent source={source} />);
    expect(screen.getByText('Lines 14–16')).toBeInTheDocument();
    expect(screen.getByText('SHA-256 ' + source.revision)).toBeInTheDocument();
    expect(screen.getByText('14')).toBeInTheDocument();
    expect(screen.getByText('16')).toBeInTheDocument();
  });
  it('deduplicates SSE replay by sequence and keeps ordering', () => {
    const first = {
      sequence: 1,
      type: 'queued',
      message: 'Queued',
      createdAt: run.createdAt,
    };
    const second = { ...first, sequence: 2, type: 'running' };
    expect(mergeEvents([second, first], [first, second])).toEqual([
      first,
      second,
    ]);
  });
});
