const url = await client.newKeyHandshakeUrl(async (mainKey, preferredRelays) => {
  await client.authenticateKey(mainKey);
});
return url;
