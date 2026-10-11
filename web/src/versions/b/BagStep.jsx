import ItemRow from '../../components/ItemRow.jsx';
import PromoBox from '../../components/PromoBox.jsx';
import OrderSummary from '../../components/OrderSummary.jsx';

export default function BagStep({ cart, onNext }) {
  return (
    <section>
      <h2>Review your bag</h2>
      <ul>{cart.items.map((i) => <ItemRow key={i.id} item={i} onQty={cart.setQty} onRemove={cart.remove} />)}</ul>
      <aside className="summary">
        <PromoBox onApply={cart.applyPromo} applied={cart.promo} error={cart.promoError} />
        <OrderSummary totals={cart.totals} promo={cart.promo} />
        <button className="cta cta--bag" onClick={onNext}>Continue to shipping</button>
      </aside>
    </section>
  );
}
