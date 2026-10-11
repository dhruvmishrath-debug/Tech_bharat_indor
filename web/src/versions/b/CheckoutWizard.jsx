import { useState } from 'react';
import Header from '../../components/Header.jsx';
import Receipt from '../../components/Receipt.jsx';
import { ENDPOINTS } from '../../api/payments.js';
import { useCart } from '../../hooks/useCart.js';
import { useFormFields } from '../../hooks/useFormFields.js';
import { usePayment } from '../../hooks/usePayment.js';
import BagStep from './BagStep.jsx';
import ShippingStep from './ShippingStep.jsx';
import PaymentStep from './PaymentStep.jsx';

// Version B — the redesign: a 4-step wizard, renamed buttons, no ids, labels via aria-label.
// `bug` turns it into a regression build (these are genuine failures, not UI changes):
//   'api'      payments endpoint answers HTTP 500
//   'silent'   payment succeeds server-side but the UI never shows a confirmation, and shows no error
//   'total'    discount is applied twice on the receipt (only visible when a promo is used)
//   'disabled' the pay button is permanently disabled
export default function CheckoutWizard({ bug = null, payLabel = 'Place order' }) {
  const [step, setStep] = useState(0);
  const cart = useCart();
  const { values, bind } = useFormFields({ name: '', email: '', phone: '', address: '', city: '', zip: '', card: '', expiry: '', cvc: '' });
  const { pay, error, orderId } = usePayment({
    endpoint: bug === 'api' ? ENDPOINTS.broken : ENDPOINTS.current,
    formatError: (e) => (e.status >= 500 ? `Something went wrong (error ${e.status}). Please try again later.` : e.message),
  });
  const go = (i) => () => setStep(i);
  const placeOrder = async () => {
    const ok = await pay({ card: values.card, expiry: values.expiry, cvv: values.cvc });
    if (ok && bug !== 'silent') setStep(3);
  };
  const wrongTotal = bug === 'total' ? cart.totals.total - cart.totals.discount : undefined; // discount subtracted twice

  return (
    <main>
      <Header withNav />
      {step === 0 && <BagStep cart={cart} onNext={go(1)} />}
      {step === 1 && <ShippingStep bind={bind} cart={cart} onBack={go(0)} onNext={go(2)} />}
      {step === 2 && <PaymentStep bind={bind} cart={cart} error={error} payLabel={payLabel} disabled={bug === 'disabled'} onBack={go(1)} onPay={placeOrder} />}
      {step === 3 && (
        <Receipt heading="Thank you! Your order is placed." orderId={orderId} items={cart.items} totals={cart.totals}
                 shippingLabel={cart.shippingOptions.find((s) => s.id === cart.shippingId).label}
                 shownTotal={wrongTotal} />
      )}
    </main>
  );
}
