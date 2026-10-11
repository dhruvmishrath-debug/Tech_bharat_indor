import DeliveryOptions from '../../components/DeliveryOptions.jsx';

export default function ShippingStep({ bind, cart, onBack, onNext }) {
  return (
    <section>
      <h2>Shipping details</h2>
      <input aria-label="Full name" placeholder="Full name" {...bind('name')} />
      <input type="email" aria-label="Email address" placeholder="you@example.com" {...bind('email')} />
      <input type="tel" aria-label="Mobile number" placeholder="Mobile number" {...bind('phone')} />
      <input aria-label="Street address" placeholder="Street address" {...bind('address')} />
      <div className="row">
        <input aria-label="City" placeholder="City" {...bind('city')} />
        <input aria-label="Postal code" placeholder="Postal code" {...bind('zip')} />
      </div>
      <DeliveryOptions options={cart.shippingOptions} value={cart.shippingId} onChange={cart.setShippingId} legend="How fast?" />
      <button className="link" onClick={onBack}>Back</button>
      <button className="cta" onClick={onNext}>Continue to payment</button>
    </section>
  );
}
