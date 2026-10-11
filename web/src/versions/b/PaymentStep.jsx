import Alert from '../../components/Alert.jsx';
import OrderSummary from '../../components/OrderSummary.jsx';

export default function PaymentStep({ bind, cart, error, payLabel, disabled, onBack, onPay }) {
  return (
    <section>
      <h2>Secure payment</h2>
      <Alert className="banner">{error}</Alert>
      <input aria-label="Card number" placeholder="1234 5678 9012 3456" autoComplete="cc-number" {...bind('card')} />
      <input aria-label="Expiry date" placeholder="MM/YY" {...bind('expiry')} />
      <input aria-label="Security code" placeholder="CVC" {...bind('cvc')} />
      <label><input type="checkbox" className="inline-check" /> Save card for next time</label>
      <label><input type="checkbox" className="inline-check" /> I accept the terms and conditions</label>
      <OrderSummary totals={cart.totals} promo={cart.promo} />
      <div>
        <button className="link" onClick={onBack}>Back</button>
        <button className="cta cta--pay" onClick={onPay} disabled={disabled}>{payLabel}</button>
      </div>
    </section>
  );
}
