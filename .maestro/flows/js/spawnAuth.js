// Maestro script: call proxy to get a new key handshake URL, then expose it for openLink.
// Proxy-side code runs on the proxy and returns the URL so the app can receive an auth request.
const proxyCode = `
  const url = await client.newKeyHandshakeUrl(async (mainKey, preferredRelays) => {
    await client.authenticateKey(mainKey);
  });
  return url;
`;

const response = http.post(`http://127.0.0.1:${MAESTRO_PROXY_PORT}/eval`, {
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ code: proxyCode }),
});

const data = JSON.parse(response.body);
if (data.error) {
  throw new Error(`Proxy spawnAuth failed: ${data.error}`);
}
if (data.result) {
  output.authUrl = data.result;
}
