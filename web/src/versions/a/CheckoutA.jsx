import { useState } from 'react';
import Header from '../../components/Header.jsx';
import Receipt from '../../components/Receipt.jsx';
import { useCart } from '../../hooks/useCart.js';
import { usePayment } from '../../hooks/usePayment.js';
import CartStep from './CartStep.jsx';
import CheckoutStep from './CheckoutStep.jsx';

const DEFAULT_IDS = { card: 'card-number', pay: 'pay-btn' };
const RENAMED_IDS = { card: 'cc-input', pay: 'submit-payment-cta' };

// Version A — the original: cart page (qty, promo) → one long checkout page → receipt.
export default function CheckoutA({ renamed = false }) {
  const [stage, setStage] = useState('cart');
  const cart = useCart();
  const { pay, error, orderId } = usePayment();
  const onPay = async (d) => (await pay({ card: d.card, expiry: d.expiry, cvv: d.cvv })) && setStage('done');

  return (
    <main>
      <Header />
      {stage === 'cart' && <CartStep cart={cart} onCheckout={() => setStage('checkout')} />}
      {stage === 'checkout' && <CheckoutStep cart={cart} ids={renamed ? RENAMED_IDS : DEFAULT_IDS} error={error} onPay={onPay} />}
      {stage === 'done' && (
        <Receipt heading="Order confirmed" orderId={orderId} items={cart.items} totals={cart.totals}
                 shippingLabel={cart.shippingOptions.find((s) => s.id === cart.shippingId).label} />
      )}
    </main>
  );
}
