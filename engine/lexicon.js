// Domain knowledge the planner uses to understand a checkout: what fields mean, which buttons move the flow forward.
export const FIELD_RULES = [
  ['promo', /promo|coupon|discount code|voucher|gift code/i],
  ['cardNumber', /cc-number|card\s*(number|no\b|#)|number on (the )?card|credit card|^card$/i],
  ['expiry', /cc-exp|expir|mm\s*\/\s*yy|valid (thru|through)/i],
  ['cvv', /cc-csc|\bcvv\b|\bcvc\b|security code|card code/i],
  ['name', /full name|cardholder|name on card|^name$|your name|\bname\b/i],
  ['email', /e-?mail/i],
  ['address', /street|address|addr\b/i],
  ['city', /\bcity\b|\btown\b/i],
  ['zip', /zip|postal|post\s?code|pin\s?code/i],
  ['phone', /phone|mobile|tel\b/i],
];

// Phrases that advance a checkout; higher weight = closer to completing the purchase.
export const ADVANCE = [
  [/place (your )?order|complete (order|purchase|checkout)|pay( now)?\b|buy now|confirm (order|payment)|submit order|purchase/i, 3],
  [/continue|proceed|next|checkout|check out|go to (payment|shipping)|secure/i, 2],
];
export const AVOID = /cancel|edit|back|remove|delete|clear|promo|coupon|apply|close|help|sign.?in|log.?in|wishlist|save for later/i;

// Delivery choices a test can ask for (data.shipping), matched against radio-button labels.
export const SHIPPING_CHOICE = { express: /express|expedited|fast|next.?day|priority/i, standard: /standard|regular|economy|free/i };
export const PROMO_APPLY = /apply|redeem|add code|use code/i;

export const OUTCOMES = {
  'card declined': /declin|invalid card|card (was )?rejected|payment (failed|rejected)/i,
  'order confirmed': /order\s+(is\s+|has been\s+|was\s+)?(confirmed|placed|complete|received)|thank you for your (order|purchase)|payment (successful|received)|purchase complete/i,
};
export function outcomeRegex(phrase) {
  return OUTCOMES[phrase.toLowerCase()] ?? new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
}

export function classifyField(e) {
  const hay = [e.autocomplete, e.name, e.placeholder, e.nameAttr, e.id].filter(Boolean);
  for (const [key, re] of FIELD_RULES) if (hay.some((h) => re.test(h))) return key;
  if (e.type === 'email') return 'email';
  if (e.type === 'tel') return 'phone';
  return null;
}

export function advanceScore(name) {
  if (!name || AVOID.test(name)) return 0;
  for (const [re, w] of ADVANCE) if (re.test(name)) return w;
  return 0;
}

export const tokens = (s) => (s || '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
export function similarity(a, b) {
  const ta = new Set(tokens(a)), tb = new Set(tokens(b));
  if (!ta.size || !tb.size) return 0;
  const inter = [...ta].filter((t) => tb.has(t)).length;
  return inter / new Set([...ta, ...tb]).size;
}
