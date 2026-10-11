import CheckoutA from './a/CheckoutA.jsx';
import CheckoutWizard from './b/CheckoutWizard.jsx';
import CheckoutAccordion from './d/CheckoutAccordion.jsx';

// Registry of selectable UI versions: /?v=<key>
//   a / a-renamed    original two-page checkout (and the same UI with renamed element ids)
//   b                redesigned 4-step wizard
//   d                one-page accordion redesign with reworded labels
//   c, c-*           regression builds of b: genuine bugs that must NOT be healed
export const VERSIONS = {
  a: () => <CheckoutA />,
  'a-renamed': () => <CheckoutA renamed />,
  b: () => <CheckoutWizard />,
  d: () => <CheckoutAccordion />,
  c: () => <CheckoutWizard bug="api" payLabel="Buy now" />,
  'c-silent': () => <CheckoutWizard bug="silent" />,
  'c-total': () => <CheckoutWizard bug="total" />,
  'c-disabled': () => <CheckoutWizard bug="disabled" />,
};
export const DEFAULT_VERSION = 'a';
