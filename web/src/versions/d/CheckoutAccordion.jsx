import { useState } from 'react';
import Alert from '../../components/Alert.jsx';
import DeliveryOptions from '../../components/DeliveryOptions.jsx';
import ItemRow from '../../components/ItemRow.jsx';
import OrderSummary from '../../components/OrderSummary.jsx';
import PromoBox from '../../components/PromoBox.jsx';
import Receipt from '../../components/Receipt.jsx';
import { useCart } from '../../hooks/useCart.js';
import { useFormFields } from '../../hooks/useFormFields.js';
import { usePayment } from '../../hooks/usePayment.js';

// Version D — a second, structurally different redesign: everything on ONE page as an accordion
// (Contact → Delivery → Payment). Different words for the same things: "Postcode", "Mobile number",
// "Redeem", "Complete purchase". No wizard, no separate cart page.
export default function CheckoutAccordion() {
  const [open, setOpen] = useState(0);
  const [done, setDone] = useState(false);
  const cart = useCart();
  const { values, bind } = useFormFields({ email: '', phone: '', name: '', address: '', city: '', zip: '', card: '', holder: '', valid: '', code: '' });
  const { pay, error, orderId } = usePayment();
  const complete = async () => (await pay({ card: values.card, expiry: values.valid, cvv: values.code })) && setDone(true);
  const Head = ({ n, title }) => (
    <h2>{n + 1}. {title} {open > n && <button className="link" onClick={() => setOpen(n)}>Edit</button>}</h2>
  );

  if (done) {
    return (
      <main><header><h1>ShopEasy</h1></header>
        <Receipt heading="Thank you for your purchase!" orderId={orderId} items={cart.items} totals={cart.totals}
                 shippingLabel={cart.shippingOptions.find((s) => s.id === cart.shippingId).label} />
        <p>Payment successful — a receipt is on its way.</p>
      </main>
    );
  }
  return (
    <main>
      <header><h1>ShopEasy</h1></header>
      <section className="panel">
        <h2>Your bag</h2>
        <ul>{cart.items.map((i) => <ItemRow key={i.id} item={i} onQty={cart.setQty} onRemove={cart.remove} />)}</ul>
        <PromoBox label="Discount code" button="Redeem" onApply={cart.applyPromo} applied={cart.promo} error={cart.promoError} />
        <OrderSummary totals={cart.totals} promo={cart.promo} />
      </section>

      <section className={`panel ${open === 0 ? '' : 'collapsed'}`}>
        <Head n={0} title="Contact" />
        {open === 0 && (<>
          <input type="email" aria-label="E-mail" placeholder="E-mail" {...bind('email')} />
          <input type="tel" aria-label="Mobile number" placeholder="Mobile number" {...bind('phone')} />
          <button className="cta" onClick={() => setOpen(1)}>Next</button>
        </>)}
      </section>

      <section className={`panel ${open === 1 ? '' : 'collapsed'}`}>
        <Head n={1} title="Delivery" />
        {open === 1 && (<>
          <input aria-label="Recipient name" placeholder="Recipient name" {...bind('name')} />
          <input aria-label="Address line" placeholder="Address line" {...bind('address')} />
          <div className="row">
            <input aria-label="Town / city" placeholder="Town / city" {...bind('city')} />
            <input aria-label="Postcode" placeholder="Postcode" {...bind('zip')} />
          </div>
          <DeliveryOptions options={cart.shippingOptions} value={cart.shippingId} onChange={cart.setShippingId} legend="Speed" />
          <button className="cta" onClick={() => setOpen(2)}>Next</button>
        </>)}
      </section>

      <section className={`panel ${open === 2 ? '' : 'collapsed'}`}>
        <Head n={2} title="Payment" />
        {open === 2 && (<>
          <Alert>{error}</Alert>
          <input aria-label="Card number" placeholder="Card number" autoComplete="cc-number" {...bind('card')} />
          <input aria-label="Cardholder name" placeholder="Cardholder name" {...bind('holder')} />
          <div className="row">
            <input aria-label="Valid thru (MM/YY)" placeholder="MM/YY" {...bind('valid')} />
            <input aria-label="CVC" placeholder="CVC" {...bind('code')} />
          </div>
          <label><input type="checkbox" className="inline-check" /> I agree to the terms of sale</label>
          <button className="cta cta--pay" onClick={complete}>Complete purchase</button>
        </>)}
      </section>
    </main>
  );
}
