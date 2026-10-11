export const money = (n) => `$${n.toFixed(2)}`;

export const INITIAL_ITEMS = [
  { id: 'shoes', name: 'Trail Running Shoes', price: 49, qty: 1 },
  { id: 'socks', name: 'Merino Socks (2 pack)', price: 12, qty: 2 },
];
export const PROMOS = { SAVE10: { pct: 10, label: '10% off' } };
export const SHIPPING = [
  { id: 'standard', label: 'Standard delivery (3–5 days)', price: 0 },
  { id: 'express', label: 'Express delivery (1–2 days)', price: 9 },
];

const round2 = (n) => Math.round(n * 100) / 100;
export function totals(items, promo, shippingId) {
  const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);
  const discount = promo ? round2((subtotal * PROMOS[promo].pct) / 100) : 0;
  const shipping = SHIPPING.find((s) => s.id === shippingId)?.price ?? 0;
  return { subtotal, discount, shipping, total: round2(subtotal - discount + shipping) };
}
