import { useState } from 'react';

// Minimal controlled-form helper: `bind('card')` returns { value, onChange } for an <input>.
export function useFormFields(initial) {
  const [values, setValues] = useState(initial);
  const bind = (key) => ({ value: values[key], onChange: (e) => setValues((v) => ({ ...v, [key]: e.target.value })) });
  return { values, bind };
}
