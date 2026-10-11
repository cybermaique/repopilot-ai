'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  api,
  requireData,
  streamRun,
  type Repository,
  type RepositoryDetail,
  type Run,
  type RunEvent,
  type Source,
} from '@repopilot/api-client';
import { RunResult, SourceContent } from './run-result';
import { mergeEvents } from './events';

const examples = [
  'Why does renewSession keep the token expired?',
  'Where is isTokenExpired defined?',
  'How does retryRequest handle failures?',
];
const terminal = (run: Run) =>
  ['completed', 'failed', 'cancelled'].includes(run.status);

async function readWorkspace(id: string) {
  const [repoResponse, historyResponse] = await Promise.all([
    api.GET('/api/repositories/{id}', { params: { path: { id } } }),
    api.GET('/api/runs', { params: { query: { repositoryId: id } } }),
  ]);
  return {
    detail: requireData(repoResponse),
    history: requireData(historyResponse),
  };
}

export function Workspace() {
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [repositoryId, setRepositoryId] = useState<string>();
  const [detail, setDetail] = useState<RepositoryDetail>();
  const [history, setHistory] = useState<Run[]>([]);
  const [run, setRun] = useState<Run>();
  const [events, setEvents] = useState<RunEvent[]>([]);
  const [source, setSource] = useState<Source>();
  const [tab, setTab] = useState<'ask' | 'snapshots' | 'history'>('ask');
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [connection, setConnection] = useState('');
  const sourceDialog = useRef<HTMLDialogElement>(null);
  const questionInput = useRef<HTMLTextAreaElement>(null);

  const refresh = useCallback(async (id: string) => {
    const workspace = await readWorkspace(id);
    setDetail(workspace.detail);
    setHistory(workspace.history);
  }, []);
  const load = useCallback(async () => {
    try {
      const repos = requireData(await api.GET('/api/repositories'));
      setRepositories(repos);
      setRepositoryId((selected) => selected ?? repos[0]?.id);
      setError('');
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : 'Unable to load repositories.',
      );
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    let disposed = false;
    void api
      .GET('/api/repositories')
      .then((response) => {
        if (disposed) return;
        const repos = requireData(response);
        setRepositories(repos);
        setRepositoryId(repos[0]?.id);
      })
      .catch((failure: Error) => {
        if (!disposed) setError(failure.message);
      })
      .finally(() => {
        if (!disposed) setLoading(false);
      });
    return () => {
      disposed = true;
    };
  }, []);
  useEffect(() => {
    if (!repositoryId) return;
    let disposed = false;
    void readWorkspace(repositoryId)
      .then((workspace) => {
        if (!disposed) {
          setDetail(workspace.detail);
          setHistory(workspace.history);
        }
      })
      .catch((failure: Error) => {
        if (!disposed) setError(failure.message);
      });
    return () => {
      disposed = true;
    };
  }, [repositoryId]);

  const runId = run?.id;
  const live = run ? !terminal(run) : false;
  useEffect(() => {
    if (!runId || !live || !repositoryId) return;
    let disposed = false;
    let polling = false;
    async function update() {
      if (polling) return;
      polling = true;
      try {
        const latest = requireData(
          await api.GET('/api/runs/{id}', { params: { path: { id: runId! } } }),
        );
        if (disposed) return;
        setRun(latest);
        if (terminal(latest)) {
          closeStream();
          setConnection('');
          await refresh(repositoryId!);
        }
      } catch {
        if (!disposed)
          setConnection(
            'Connection interrupted. Reconnecting to persisted events…',
          );
      } finally {
        polling = false;
      }
    }
    const closeStream = streamRun(
      runId,
      0,
      (event) => {
        if (disposed) return;
        setConnection('');
        setEvents((previous) => mergeEvents(previous, [event]));
        if (['completed', 'failed', 'cancelled'].includes(event.type))
          void update();
      },
      () => {
        if (!disposed)
          setConnection('Reconnecting… Run continues in the worker.');
      },
    );
    const poll = setInterval(() => {
      void update();
    }, 1000);
    void update();
    return () => {
      disposed = true;
      clearInterval(poll);
      closeStream();
    };
  }, [runId, live, repositoryId, refresh]);

  async function action(fn: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Request failed.');
    } finally {
      setBusy(false);
    }
  }
  function selectRun(next: Run) {
    setRun(next);
    setEvents([]);
    setSource(undefined);
    setConnection('');
    setTab('ask');
  }
  async function register() {
    await action(async () => {
      const repo = requireData(
        await api.POST('/api/repositories', { body: { kind: 'fixture' } }),
      );
      await load();
      setRepositoryId(repo.id);
      await refresh(repo.id);
    });
  }
  async function index() {
    if (!repositoryId) return;
    await action(async () => {
      selectRun(
        requireData(
          await api.POST('/api/repositories/{id}/index', {
            params: { path: { id: repositoryId } },
          }),
        ),
      );
    });
  }
  async function ask() {
    if (!repositoryId || question.trim().length < 2) return;
    await action(async () => {
      selectRun(
        requireData(
          await api.POST('/api/runs', {
            body: { repositoryId, question: question.trim() },
          }),
        ),
      );
    });
  }
  async function cancel() {
    if (!run) return;
    await action(async () => {
      setRun(
        requireData(
          await api.POST('/api/runs/{id}/cancel', {
            params: { path: { id: run.id } },
          }),
        ),
      );
      await refresh(repositoryId!);
    });
  }
  async function openSource(id: string) {
    await action(async () => {
      const next = requireData(
        await api.GET('/api/sources/{id}', { params: { path: { id } } }),
      );
      setSource(next);
      sourceDialog.current?.showModal();
    });
  }
  async function openHistory(next: Run) {
    selectRun(next);
    await action(async () => {
      setEvents(
        requireData(
          await api.GET('/api/runs/{id}/events', {
            params: { path: { id: next.id }, query: { after: 0 } },
          }),
        ),
      );
    });
  }
  const active = detail?.snapshots.find(
    (snapshot) => snapshot.id === detail.activeSnapshotId,
  );

  return (
    <div className="shell">
      <a className="skip-link" href="#main">
        Skip to workspace
      </a>
      <aside className="sidebar" aria-label="Repositories">
        <Link className="brand" href="/" aria-label="RepoPilot AI home">
          <span className="brand-mark">⌘</span>
          <span>
            RepoPilot<span className="brand-ai"> AI</span>
          </span>
        </Link>
        <div className="sidebar-label">
          LOCAL WORKSPACE <span className="tiny-dot" />
        </div>
        <div className="repo-list">
          {repositories.map((repo) => (
            <button
              key={repo.id}
              className={`repo-button ${repositoryId === repo.id ? 'selected' : ''}`}
              onClick={() => {
                setRepositoryId(repo.id);
                setTab('ask');
                setRun(undefined);
                setEvents([]);
              }}
            >
              <span className="repo-icon">▱</span>
              <span>
                {repo.name}
                <small>Synthetic TypeScript fixture</small>
              </span>
            </button>
          ))}
        </div>
        {!loading && !repositories.length && (
          <p className="sidebar-empty">
            Start by registering the included sample repository.
          </p>
        )}
        <button
          className="secondary add-repo"
          disabled={busy || repositories.length > 0}
          onClick={() => {
            void register();
          }}
        >
          + Register sample repository
        </button>
        <div className="sidebar-footer">
          <span className="demo-dot" /> Demo provider
          <p>
            Local, deterministic and credential-free. Your evidence stays in
            PostgreSQL.
          </p>
          <span className="muted">Bootstrap · phases 0–1</span>
        </div>
      </aside>
      <main id="main" className="main">
        <header className="topbar">
          <div className="breadcrumb">
            Workspace <span>/</span> {detail?.name ?? 'Repositories'}
          </div>
          <span className="local-badge">◎ Local demo</span>
        </header>
        <div className="workspace-body">
          <div className="page-heading">
            <div>
              <p className="eyebrow">REPOSITORY INTELLIGENCE</p>
              <h1>Answers grounded in code.</h1>
              <p className="subtitle">
                Follow every answer back to a file, a line, and a revision.
              </p>
            </div>
            <div className="snapshot-state">
              <span className={`status ${active ? 'ready' : 'warn'}`}>
                {active ? 'Snapshot ready' : 'Not indexed'}
              </span>
              {active && (
                <code title={active.revision}>
                  {active.revision.slice(0, 12)}
                </code>
              )}
            </div>
          </div>
          {error && (
            <div role="alert" className="notice error">
              {error}
              <button
                className="text-button"
                onClick={() => {
                  void load();
                  if (repositoryId)
                    void refresh(repositoryId).catch((failure: Error) =>
                      setError(failure.message),
                    );
                }}
              >
                Retry
              </button>
            </div>
          )}
          {loading ? (
            <div className="empty" role="status">
              Loading local workspace…
            </div>
          ) : !repositoryId ? (
            <div className="empty">
              <span className="orbit">▱</span>
              <h2>Your evidence workspace starts here.</h2>
              <p>
                Register the sample session client, index its files, then
                investigate the token renewal bug.
              </p>
              <button
                className="primary"
                disabled={busy}
                onClick={() => {
                  void register();
                }}
              >
                Register sample repository
              </button>
            </div>
          ) : (
            <>
              <nav className="tabs" aria-label="Workspace views">
                {(['ask', 'snapshots', 'history'] as const).map((value) => (
                  <button
                    key={value}
                    aria-current={tab === value ? 'page' : undefined}
                    className={tab === value ? 'active' : ''}
                    onClick={() => setTab(value)}
                  >
                    {value === 'ask'
                      ? 'Ask repository'
                      : value === 'snapshots'
                        ? 'Snapshots'
                        : 'Run history'}
                    {value === 'history' && <span>{history.length}</span>}
                  </button>
                ))}
              </nav>
              {tab === 'ask' && (
                <div className="ask-grid">
                  <div className="ask-main">
                    <section className="card composer">
                      <div className="card-heading">
                        <h2>What would you like to investigate?</h2>
                        <span className="provider-badge">Demo provider</span>
                      </div>
                      <form
                        aria-label="Ask a repository question"
                        onSubmit={(event) => {
                          event.preventDefault();
                          void ask();
                        }}
                      >
                        <label htmlFor="question" className="sr-only">
                          Question
                        </label>
                        <textarea
                          ref={questionInput}
                          id="question"
                          placeholder="Ask about a function, behavior, or the token renewal bug…"
                          maxLength={1000}
                          value={question}
                          onChange={(event) => setQuestion(event.target.value)}
                          disabled={!active || busy || live}
                        />
                        <div className="composer-bottom">
                          <span className="muted">
                            {active
                              ? `Lexical retrieval · ${active.fileCount} files`
                              : 'Index the fixture to enable questions.'}
                          </span>
                          <button
                            className="primary"
                            type="submit"
                            disabled={
                              !active ||
                              busy ||
                              live ||
                              question.trim().length < 2
                            }
                          >
                            Ask repository <span aria-hidden="true">↗</span>
                          </button>
                        </div>
                      </form>
                      <div className="examples">
                        {examples.map((example) => (
                          <button
                            key={example}
                            disabled={!active || live}
                            onClick={() => {
                              setQuestion(example);
                              questionInput.current?.focus();
                            }}
                          >
                            {example}
                          </button>
                        ))}
                      </div>
                    </section>
                    <section className="card results">
                      <div className="card-heading">
                        <h2>
                          {run?.kind === 'index'
                            ? 'Indexing run'
                            : 'Evidence & answer'}
                        </h2>
                        {run && (
                          <span
                            className={`status ${run.status === 'completed' ? 'ready' : ''}`}
                          >
                            {run.status}
                          </span>
                        )}
                      </div>
                      {run ? (
                        <RunResult
                          run={run}
                          onSource={(id) => {
                            void openSource(id);
                          }}
                        />
                      ) : (
                        <div className="empty">
                          <span className="orbit">⌕</span>
                          <h3>A clear trail from question to evidence.</h3>
                          <p>
                            Ask a question to see retrieved excerpts, execution
                            steps and revision-pinned sources.
                          </p>
                        </div>
                      )}
                      {run?.indexResult && (
                        <div className="notice">
                          <strong>
                            {run.indexResult.reused
                              ? 'Existing snapshot reused.'
                              : 'Snapshot activated.'}
                          </strong>{' '}
                          {run.indexResult.fileCount} files ·{' '}
                          {run.indexResult.chunkCount} chunks
                          <p className="revision">{run.indexResult.revision}</p>
                          {run.indexResult.diagnostics.map((message) => (
                            <p key={message}>{message}</p>
                          ))}
                        </div>
                      )}
                    </section>
                  </div>
                  <aside className="execution" aria-label="Execution details">
                    <section className="card">
                      <div className="card-heading">
                        <h2>Execution</h2>
                        <span className="tiny-dot" />
                      </div>
                      <p className="muted">
                        Persisted steps, replayable on reconnect.
                      </p>
                      <ol className="event-list" aria-live="polite">
                        {events.map((event) => (
                          <li key={event.sequence}>
                            <span className="event-dot" />
                            <strong>{event.type.replaceAll('_', ' ')}</strong>
                            <p>{event.message}</p>
                          </li>
                        ))}
                      </ol>
                      {!events.length && (
                        <p className="muted">No execution selected.</p>
                      )}
                      {connection && (
                        <p role="status" className="connection">
                          {connection}
                        </p>
                      )}
                      {live && (
                        <button
                          className="secondary"
                          disabled={busy || run?.cancelRequested}
                          onClick={() => {
                            void cancel();
                          }}
                        >
                          {run?.cancelRequested
                            ? 'Cancellation requested…'
                            : 'Cancel run'}
                        </button>
                      )}
                    </section>
                    <section className="card context-card">
                      <p className="eyebrow">ACTIVE CONTEXT</p>
                      <h3>{detail?.name}</h3>
                      <p className="muted">
                        {active
                          ? `${active.fileCount} files · ${active.chunkCount} chunks`
                          : 'No active snapshot'}
                      </p>
                      <button
                        className="secondary"
                        disabled={busy || live}
                        onClick={() => {
                          void index();
                        }}
                      >
                        {active ? 'Reindex fixture' : 'Index fixture'}
                      </button>
                      <p className="footnote">
                        Content-addressed snapshots. Failed indexing preserves
                        the active revision.
                      </p>
                    </section>
                  </aside>
                </div>
              )}
              {tab === 'snapshots' && (
                <section className="card snapshots">
                  <div className="card-heading">
                    <div>
                      <h2>Immutable snapshots</h2>
                      <p className="muted">
                        Reindexing identical content reuses the existing
                        snapshot.
                      </p>
                    </div>
                    <button
                      className="primary"
                      disabled={busy || live}
                      onClick={() => {
                        void index();
                      }}
                    >
                      Index fixture
                    </button>
                  </div>
                  {!detail?.snapshots.length && (
                    <div className="empty">
                      <h3>No snapshots yet</h3>
                      <p>Index the included fixture to start exploring.</p>
                    </div>
                  )}
                  {detail?.snapshots.map((snapshot) => (
                    <article className="snapshot-row" key={snapshot.id}>
                      <div>
                        <span
                          className={`status ${snapshot.id === detail.activeSnapshotId ? 'ready' : ''}`}
                        >
                          {snapshot.id === detail.activeSnapshotId
                            ? 'Active'
                            : 'Archived'}
                        </span>
                        <code className="revision">{snapshot.revision}</code>
                        <p className="muted">
                          {snapshot.fileCount} files · {snapshot.chunkCount}{' '}
                          chunks ·{' '}
                          {new Date(snapshot.createdAt).toLocaleString()}
                        </p>
                        {snapshot.diagnostics.map((message) => (
                          <p className="footnote" key={message}>
                            {message}
                          </p>
                        ))}
                      </div>
                    </article>
                  ))}
                </section>
              )}
              {tab === 'history' && (
                <section className="card history">
                  <div className="card-heading">
                    <div>
                      <h2>Run history</h2>
                      <p className="muted">
                        The latest 50 runs, stored in PostgreSQL across
                        restarts.
                      </p>
                    </div>
                    <button
                      className="secondary"
                      disabled={busy}
                      onClick={() => {
                        void action(() => refresh(repositoryId));
                      }}
                    >
                      Refresh history
                    </button>
                  </div>
                  {!history.length && (
                    <div className="empty">
                      <h3>No runs yet</h3>
                      <p>
                        Index the fixture or ask a question to start your
                        history.
                      </p>
                    </div>
                  )}
                  {history.map((item) => (
                    <button
                      key={item.id}
                      className="history-row"
                      onClick={() => {
                        void openHistory(item);
                      }}
                    >
                      <span>
                        <strong>
                          {item.question ?? 'Index sample fixture'}
                        </strong>
                        <small>
                          {new Date(item.createdAt).toLocaleString()} ·{' '}
                          {item.kind === 'question'
                            ? 'Demo provider'
                            : 'Fixture ingestion'}
                        </small>
                      </span>
                      <span
                        className={`status ${item.status === 'completed' ? 'ready' : item.status === 'failed' ? 'warn' : ''}`}
                      >
                        {item.status}
                      </span>
                      <span aria-hidden="true">↗</span>
                    </button>
                  ))}
                </section>
              )}
            </>
          )}
          <footer className="main-footer">
            Evidence first.{' '}
            <span>
              Full-text + identifier retrieval · No external AI service
            </span>
          </footer>
        </div>
      </main>
      <dialog
        className="source-dialog"
        ref={sourceDialog}
        aria-labelledby="source-title"
        onCancel={() => setSource(undefined)}
      >
        <div className="source-top">
          <h2 id="source-title">Source evidence</h2>
          <button
            className="secondary"
            autoFocus
            onClick={() => {
              sourceDialog.current?.close();
              setSource(undefined);
            }}
          >
            Close source
          </button>
        </div>
        {source && <SourceContent source={source} />}
      </dialog>
    </div>
  );
}
