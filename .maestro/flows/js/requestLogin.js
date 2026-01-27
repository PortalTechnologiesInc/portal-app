const response = http.post('http://127.0.0.1:${MAESTRO_PROXY_PORT}/eval', {
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    code: `await client.authenticateKey("${userNpub}");`,
  }),
});
