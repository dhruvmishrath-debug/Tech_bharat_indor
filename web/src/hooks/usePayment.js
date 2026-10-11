import { useState } from 'react';
import { submitPayment } from '../api/payments.js';

// Owns the async payment call: loading/error/result state, shared by every checkout version.
export function usePayment({ endpoint, formatError = (e) => e.message } = {}) {
  const [error, setError] = useState('');
  const [orderId, setOrderId] = useState('');

  async function pay(details) {
    setError('');
    try {
      const r = await submitPayment(details, endpoint);
      setOrderId(r.orderId);
      return true;
    } catch (err) {
      console.error(`payment failed: ${err.status ?? err.message}`);
      setError(formatError(err));
      return false;
    }
  }
  return { pay, error, orderId };
}
