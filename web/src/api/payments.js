// Payment API client. Throws an Error carrying the HTTP status so the UI can tell declines (4xx) from outages (5xx).
export const ENDPOINTS = { current: '/api/pay', broken: '/api/payments/v2' };

export async function submitPayment({ card, expiry, cvv }, endpoint = ENDPOINTS.current) {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ card, expiry, cvv }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body.error || `Payment failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return body; // { orderId }
}
