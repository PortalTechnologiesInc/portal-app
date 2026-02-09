// This script runs in Maestro. It sends the code below to the proxy POST /eval (body: { code }).
// Edit the "code for /eval" block to change what the Portal SDK runs on the proxy.
const npub = typeof MAESTRO_TEST_NPUB !== 'undefined' ? MAESTRO_TEST_NPUB : '';
const mintUrl = typeof MAESTRO_TICKET_MINT_URL !== 'undefined' ? MAESTRO_TICKET_MINT_URL : 'https://mint.minibits.cash';
const unit = typeof MAESTRO_TICKET_UNIT !== 'undefined' ? MAESTRO_TICKET_UNIT : 'sat';
const amount = typeof MAESTRO_TICKET_AMOUNT !== 'undefined' ? parseInt(MAESTRO_TICKET_AMOUNT, 10) : 10000; // Default: 10 sats

const codeForEval = `
console.log('Requesting Cashu ticket for npub:', ${JSON.stringify(npub)});
console.log('Mint URL:', ${JSON.stringify(mintUrl)});
console.log('Unit:', ${JSON.stringify(unit)});
console.log('Amount:', ${amount});
const result = await client.requestCashu(${JSON.stringify(npub)}, [], ${JSON.stringify(mintUrl)}, ${JSON.stringify(unit)}, ${amount});
console.log('Cashu request result:', result);
if (result.status === 'success') {
  console.log('Ticket received successfully, token:', result.token);
} else if (result.status === 'insufficient_funds') {
  console.log('User has insufficient funds');
} else if (result.status === 'rejected') {
  console.log('User rejected the request, reason:', result.reason);
}
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
