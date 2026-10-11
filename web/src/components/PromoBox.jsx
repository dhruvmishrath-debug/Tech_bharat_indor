import { useState } from 'react';
import Alert from './Alert.jsx';

// Promo-code entry. Label/button text are props because each UI version words them differently.
export default function PromoBox({ onApply, applied, error, label = 'Promo code', button = 'Apply' }) {
  const [code, setCode] = useState('');
  return (
    <div className="promo">
      <input aria-label={label} placeholder={label} value={code} onChange={(e) => setCode(e.target.value)} />
      <button onClick={() => onApply(code)}>{button}</button>
      {applied && <p role="status" className="ok">Code {applied} applied</p>}
      <Alert>{error}</Alert>
    </div>
  );
}
