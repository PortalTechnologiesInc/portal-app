// This script runs in Maestro. It sends the code below to the proxy POST /eval (body: { code }).
// Edit the "code for /eval" block to change what the Portal SDK runs on the proxy.
// This script burns (redeems) a Cashu token that was previously received.
const mintUrl = typeof MAESTRO_TICKET_MINT_URL !== 'undefined' ? MAESTRO_TICKET_MINT_URL : 'https://mint.minibits.cash';
const unit = typeof MAESTRO_TICKET_UNIT !== 'undefined' ? MAESTRO_TICKET_UNIT : 'sat';
const token = typeof MAESTRO_TICKET_TOKEN !== 'undefined' ? MAESTRO_TICKET_TOKEN : '';
const staticAuthToken = typeof MAESTRO_TICKET_STATIC_TOKEN !== 'undefined' ? MAESTRO_TICKET_STATIC_TOKEN : undefined;

if (!token) {
  throw new Error('MAESTRO_TICKET_TOKEN environment variable is required');
}

const codeForEval = `
console.log('Burning Cashu token at mint:', ${JSON.stringify(mintUrl)});
console.log('Unit:', ${JSON.stringify(unit)});
console.log('Token:', ${token.substring(0, 50)}...); // Log first 50 chars for security
const amount = await client.burnCashu(
  ${JSON.stringify(mintUrl)},
  ${JSON.stringify(unit)},
  ${JSON.stringify(token)},
  ${staticAuthToken ? JSON.stringify(staticAuthToken) : 'undefined'}
);
console.log('Token burned successfully, claimed amount:', amount, 'millisats');
return amount;
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
console.log('Burned token, claimed amount:', data.result, 'millisats');
