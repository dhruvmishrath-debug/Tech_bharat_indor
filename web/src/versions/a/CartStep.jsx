import ItemRow from '../../components/ItemRow.jsx';
import PromoBox from '../../components/PromoBox.jsx';
import OrderSummary from '../../components/OrderSummary.jsx';

export default function CartStep({ cart, onCheckout }) {
  return (
    <section id="cart">
      <h2>Your cart</h2>
      <ul>{cart.items.map((i) => <ItemRow key={i.id} item={i} onQty={cart.setQty} onRemove={cart.remove} />)}</ul>
      <PromoBox onApply={cart.applyPromo} applied={cart.promo} error={cart.promoError} />
      <OrderSummary totals={cart.totals} promo={cart.promo} />
      <button id="checkout-button" className="btn-primary" onClick={onCheckout} disabled={!cart.items.length}>Checkout</button>
    </section>
  );
}
