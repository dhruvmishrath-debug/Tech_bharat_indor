import { useState } from 'react';
import { INITIAL_ITEMS, PROMOS, SHIPPING, totals } from '../data/cart.js';

// Cart state shared by every checkout version: quantities, promo code, delivery option, computed totals.
export function useCart() {
  const [items, setItems] = useState(INITIAL_ITEMS);
  const [promo, setPromo] = useState(null);
  const [promoError, setPromoError] = useState('');
  const [shippingId, setShippingId] = useState('standard');

  const setQty = (id, delta) => setItems((xs) => xs.map((i) => (i.id === id ? { ...i, qty: Math.max(1, i.qty + delta) } : i)));
  const remove = (id) => setItems((xs) => xs.filter((i) => i.id !== id));
  const applyPromo = (raw) => {
    const code = raw.trim().toUpperCase();
    if (PROMOS[code]) { setPromo(code); setPromoError(''); } else { setPromo(null); setPromoError('That promo code is not valid.'); }
  };
  return { items, setQty, remove, promo, promoError, applyPromo, shippingId, setShippingId, shippingOptions: SHIPPING, totals: totals(items, promo, shippingId) };
}
