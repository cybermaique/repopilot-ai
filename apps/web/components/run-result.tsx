'use client';

import type { Run, Source } from '@repopilot/api-client';

export function RunResult({
  run,
  onSource,
}: {
  run: Run;
  onSource: (sourceId: string) => void;
}) {
  if (run.kind === 'index' && run.status === 'completed')
    return (
      <p className="muted">
        Indexing completed. The immutable snapshot is available for questions.
      </p>
    );
  if (run.status === 'cancelled')
    return (
      <div className="notice">
        Run cancelled. Your previous results remain in history.
      </div>
    );
  if (run.status === 'failed')
    return (
      <div role="alert" className="notice error">
        {run.error ?? 'Run failed. Check local services and try again.'}
      </div>
    );
  if (!run.answer)
    return (
      <div className="empty compact">
        <span className="orbit">⌕</span>
        <h3>
          {run.kind === 'index'
            ? 'Preparing your snapshot'
            : 'Following the evidence'}
        </h3>
        <p>
          {run.kind === 'index'
            ? 'Files will become active after indexing finishes.'
            : 'The worker retrieves code and persists an extractive answer.'}
        </p>
      </div>
    );
  const answer = run.answer;
  return (
    <article className="answer" aria-label="Answer">
      <h3 className="run-question">{run.question}</h3>
      <div className="answer-heading">
        <span
          className={`status ${answer.evidence === 'insufficient' ? 'warn' : 'ready'}`}
        >
          {answer.evidence === 'insufficient'
            ? 'Insufficient evidence'
            : 'Evidence found'}
        </span>
        <span className="muted">{answer.durationMs} ms · Demo provider</span>
      </div>
      <p>{answer.summary}</p>
      {answer.findings.map((finding, index) => (
        <section className="finding" key={index}>
          <pre>{finding.text}</pre>
          <div className="citation-row">
            {finding.sourceIds.map((id) => {
              const source = answer.sources.find(
                (item) => item.sourceId === id,
              );
              return (
                <button
                  key={id}
                  className="citation"
                  onClick={() => onSource(id)}
                  aria-label={`Open source ${source?.path ?? id}`}
                >
                  {source?.path ?? 'Source'}{' '}
                  <span>
                    L{source?.startLine}–{source?.endLine} ↗
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      ))}
      <p className="limitation">{answer.limitation}</p>
    </article>
  );
}

export function SourceContent({ source }: { source: Source }) {
  return (
    <>
      <h3>{source.path}</h3>
      <p className="muted">
        Lines {source.startLine}–{source.endLine}
      </p>
      <div className="revision" title={source.revision}>
        SHA-256 {source.revision}
      </div>
      <pre className="code" aria-label="Source excerpt">
        {source.content.split('\n').map((line, index) => (
          <span className="code-line" key={index}>
            <span className="line-number" aria-hidden="true">
              {source.startLine + index}
            </span>
            <span>{line || ' '}</span>
          </span>
        ))}
      </pre>
    </>
  );
}
