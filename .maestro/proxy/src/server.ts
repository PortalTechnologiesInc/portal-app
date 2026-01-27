import * as http from 'node:http';
import { Currency, PortalSDK, Timestamp } from 'portal-sdk';

const HOST = process.env.HOST ?? '127.0.0.1';
const PORT = Number(process.env.PORT ?? 3500);
const REST_WS = process.env.REST_WS ?? 'ws://localhost:3000/ws';
const REST_AUTH_TOKEN = process.env.REST_AUTH_TOKEN ?? 'your-auth-token';

// Initialize the client
const client = new PortalSDK({
  serverUrl: REST_WS,
  connectTimeout: 10000,
});

async function connect() {
  // Connect to the server
  await client.connect();
  // Authenticate with your token
  await client.authenticate(REST_AUTH_TOKEN);
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.setEncoding('utf8');
    req.on('data', (chunk: string) => {
      data += chunk;
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function sendJson(res: http.ServerResponse, status: number, obj: unknown) {
  const body = JSON.stringify(obj);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Length', Buffer.byteLength(body));
  res.end(body);
}

const server = http.createServer(async (req: http.IncomingMessage, res: http.ServerResponse) => {
  try {
    const method = req.method ?? 'GET';
    const url = req.url ?? '/';

    if (method === 'POST' && url === '/eval') {
      const raw = await readBody(req);

      // Accept either JSON: {"code":"..."} or plain text body.
      let code = raw;
      const contentType = (req.headers['content-type'] ?? '').toString();
      if (contentType.includes('application/json')) {
        const parsed = JSON.parse(raw);
        code = typeof parsed?.code === 'string' ? parsed.code : '';
      }

      if (typeof code !== 'string' || code.trim() === '') {
        return sendJson(res, 400, {
          error: 'Expected a non-empty string of JS (plain text body or JSON {code})',
        });
      }

      // WARNING: This is intentionally unsafe; do not expose publicly.
      const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor as new (
        ...args: string[]
      ) => (...fnArgs: unknown[]) => Promise<unknown>;
      const fn = new AsyncFunction('client', `"use strict";\n${code}`) as (
        client: PortalSDK
      ) => Promise<unknown>;
      const result = await fn(client);
      return sendJson(res, 200, { result });
    }

    if (method === 'GET' && url === '/') {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end('OK. POST /eval with body \'1+2\' or JSON {"code":"1+2"}.\n');
      return;
    }

    sendJson(res, 404, { error: 'Not found' });
  } catch (err) {
    sendJson(res, 500, { error: err instanceof Error ? err.message : String(err) });
  }
});

connect()
  .then(() => {
    server.listen(PORT, HOST, () => {
      // eslint-disable-next-line no-console
      console.log(`Listening on http://${HOST}:${PORT}`);
    });
  })
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
