const npub = typeof MAESTRO_TEST_NPUB !== 'undefined' ? MAESTRO_TEST_NPUB : '';
const C = 'Currenc';
const y = 'y';
const codeForEval = 'const paymentRequest = { amount: 10000, currency: ' + C + y + '.Millisats, description: "Test payment" }; await client.requestSinglePayment(' + JSON.stringify(npub) + ', [], paymentRequest, () => {});';

const proxyPort = typeof MAESTRO_PROXY_PORT !== 'undefined' ? MAESTRO_PROXY_PORT : 3500;
const response = http.post('http://127.0.0.1:' + proxyPort + '/eval', {
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ code: codeForEval }),
});
const data = JSON.parse(response.body);
if (data.error) throw new Error(data.error);
