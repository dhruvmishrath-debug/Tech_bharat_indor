import { money } from '../data/cart.js';

export default function ItemRow({ item, onQty, onRemove }) {
  return (
    <li className="item">
      <span className="item-name">{item.name}</span>
      <span className="qty">
        <button aria-label={`Decrease quantity of ${item.name}`} onClick={() => onQty(item.id, -1)}>−</button>
        <span aria-label={`Quantity of ${item.name}`}>{item.qty}</span>
        <button aria-label={`Increase quantity of ${item.name}`} onClick={() => onQty(item.id, 1)}>+</button>
      </span>
      <span className="line">{money(item.price * item.qty)}</span>
      <button className="link" aria-label={`Remove ${item.name}`} onClick={() => onRemove(item.id)}>Remove</button>
    </li>
  );
}
