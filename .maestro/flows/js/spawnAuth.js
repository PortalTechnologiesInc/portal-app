// This script runs in Maestro. It sends the code below to the proxy POST /eval (body: { code }).
// Edit the "code for /eval" block to change what the Portal SDK runs on the proxy.
const codeForEval = `
console.log('Registering callback for newKeyHandshakeUrl...');
const url = await client.newKeyHandshakeUrl(async (mainKey, preferredRelays) => {
  try {
    console.log('=== CALLBACK EXECUTED ===');
    console.log('Callback executing, calling authenticateKey with mainKey:', mainKey);
    console.log('Preferred relays:', preferredRelays);
    await client.authenticateKey(mainKey);
    console.log('authenticateKey completed successfully');
  } catch (error) {
    console.error('ERROR in callback:', error);
    console.error('Error message:', error?.message);
    console.error('Error stack:', error?.stack);
    throw error; // Re-throw to see it in proxy logs
  }
});
console.log('URL generated, callback registered. URL:', url);
return url;
`;

const proxyPort =
  typeof MAESTRO_PROXY_PORT !== 'undefined' && MAESTRO_PROXY_PORT !== ''
    ? MAESTRO_PROXY_PORT
    : 3500;
const response = http.post(`http://127.0.0.1:${proxyPort}/eval`, {
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ code: codeForEval }),
});
const data = JSON.parse(response.body);
if (data.error) throw new Error(data.error);
output.authUrl = data.result;
