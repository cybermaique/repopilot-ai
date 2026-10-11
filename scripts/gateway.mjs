import { createServer } from 'node:http';
import httpProxy from 'http-proxy';

const proxy = httpProxy.createProxyServer({ ws: true, xfwd: true });
const api =
  process.env.API_TARGET ??
  `http://127.0.0.1:${process.env.API_PORT ?? '4100'}`;
const web =
  process.env.WEB_TARGET ??
  `http://127.0.0.1:${process.env.WEB_PORT ?? '3100'}`;
const server = createServer((req, res) => {
  const target = req.url === '/api' || req.url?.startsWith('/api/') ? api : web;
  proxy.web(req, res, { target });
});
server.on('upgrade', (req, socket, head) =>
  proxy.ws(req, socket, head, { target: web }),
);
proxy.on('error', (_error, _req, res) => {
  if ('writeHead' in res && !res.headersSent) {
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        message:
          'Service unavailable. Wait for startup or check local process logs.',
      }),
    );
  } else res.destroy();
});
server.listen(
  Number(process.env.GATEWAY_PORT ?? 8088),
  process.env.GATEWAY_HOST ?? '127.0.0.1',
  () =>
    console.log(
      'Local same-origin gateway ready on port ' +
        (process.env.GATEWAY_PORT ?? 8088),
    ),
);
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => {
    proxy.close();
    server.close(() => process.exit(0));
    server.closeAllConnections();
  });
