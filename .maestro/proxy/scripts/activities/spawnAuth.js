// Proxy-side script: run via POST /eval (body = this file content) or eval-file.sh.
// Returns the key handshake URL so the caller can open it and the app receives an auth request.
// Biome: file is eval'd as async function body by server; top-level return is required.
const url = await client.newKeyHandshakeUrl(async (mainKey, _preferredRelays) => {
  await client.authenticateKey(mainKey);
});
return url;
