import { money } from '../data/cart.js';

export default function OrderSummary({ totals, promo }) {
  return (
    <dl className="summary-totals">
      <div><dt>Subtotal</dt><dd>{money(totals.subtotal)}</dd></div>
      {totals.discount > 0 && <div><dt>Discount ({promo})</dt><dd>−{money(totals.discount)}</dd></div>}
      <div><dt>Delivery</dt><dd>{totals.shipping ? money(totals.shipping) : 'Free'}</dd></div>
      <div className="grand"><dt>Total</dt><dd>{money(totals.total)}</dd></div>
    </dl>
  );
}
