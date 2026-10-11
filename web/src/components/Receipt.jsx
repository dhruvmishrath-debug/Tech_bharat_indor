import { money } from '../data/cart.js';

// Confirmation screen. `heading` differs per UI version; `shownTotal` lets a buggy version display the wrong amount.
export default function Receipt({ heading, orderId, items, totals, shippingLabel, shownTotal }) {
  return (
    <section className="receipt">
      <h2>{heading}</h2>
      <p>Order #{orderId}</p>
      <ul>{items.map((i) => <li key={i.id}>{i.qty} × {i.name}</li>)}</ul>
      <p>Delivery: {shippingLabel}</p>
      <p><b>Order total: {money(shownTotal ?? totals.total)}</b></p>
    </section>
  );
}
