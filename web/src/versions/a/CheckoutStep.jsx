import Alert from '../../components/Alert.jsx';
import DeliveryOptions from '../../components/DeliveryOptions.jsx';
import OrderSummary from '../../components/OrderSummary.jsx';
import { useFormFields } from '../../hooks/useFormFields.js';

// One long page: contact, shipping, delivery method, payment, terms, summary. Labels are real <label for=…>.
// `ids` lets the test-suite render the same UI with renamed element ids (the "a-renamed" variant).
export default function CheckoutStep({ cart, onPay, error, ids }) {
  const { values: v, bind } = useFormFields({ email: '', phone: '', name: '', address: '', city: '', zip: '', card: '', cardName: '', expiry: '', cvv: '' });
  const submit = (e) => { e.preventDefault(); onPay(v); };
  return (
    <section id="checkout">
      <h2>Checkout</h2>
      <Alert>{error}</Alert>
      <form id="checkout-form" onSubmit={submit}>
        <fieldset><legend>Contact</legend>
          <label htmlFor="email">Email address</label><input id="email" type="email" autoComplete="email" {...bind('email')} />
          <label htmlFor="phone">Phone number</label><input id="phone" type="tel" autoComplete="tel" {...bind('phone')} />
        </fieldset>
        <fieldset><legend>Shipping address</legend>
          <label htmlFor="full-name">Full name</label><input id="full-name" autoComplete="name" {...bind('name')} />
          <label htmlFor="street">Street address</label><input id="street" autoComplete="street-address" {...bind('address')} />
          <div className="row">
            <div><label htmlFor="city">City</label><input id="city" {...bind('city')} /></div>
            <div><label htmlFor="zip">ZIP code</label><input id="zip" autoComplete="postal-code" {...bind('zip')} /></div>
          </div>
        </fieldset>
        <DeliveryOptions options={cart.shippingOptions} value={cart.shippingId} onChange={cart.setShippingId} />
        <fieldset><legend>Payment</legend>
          <label htmlFor={ids.card}>Card number</label><input id={ids.card} name="card" autoComplete="cc-number" {...bind('card')} />
          <label htmlFor="card-name">Name on card</label><input id="card-name" autoComplete="cc-name" {...bind('cardName')} />
          <div className="row">
            <div><label htmlFor="expiry">Expiry (MM/YY)</label><input id="expiry" name="expiry" placeholder="MM/YY" {...bind('expiry')} /></div>
            <div><label htmlFor="cvv">CVV</label><input id="cvv" name="cvv" {...bind('cvv')} /></div>
          </div>
        </fieldset>
        <label><input type="checkbox" id="terms" className="inline-check" required /> I agree to the Terms &amp; Conditions</label>
        <OrderSummary totals={cart.totals} promo={cart.promo} />
        <button id={ids.pay} type="submit">Pay now</button>
      </form>
    </section>
  );
}
