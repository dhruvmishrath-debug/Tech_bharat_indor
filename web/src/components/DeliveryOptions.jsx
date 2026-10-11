import { money } from '../data/cart.js';

export default function DeliveryOptions({ options, value, onChange, legend = 'Delivery method' }) {
  return (
    <fieldset>
      <legend>{legend}</legend>
      {options.map((o) => (
        <label key={o.id} className="radio">
          <input type="radio" name="delivery" checked={value === o.id} onChange={() => onChange(o.id)} />
          {o.label} — {o.price ? money(o.price) : 'Free'}
        </label>
      ))}
    </fieldset>
  );
}
