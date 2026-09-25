'use strict';
// Shared by the storefront and server. Catalog amounts stay in integer cents.
(function (root) {
  function total(baseCents) {
    if (!Number.isSafeInteger(baseCents) || baseCents <= 0) {
      throw new RangeError('Invalid base price');
    }
    return baseCents;
  }
  const pricing = Object.freeze({ total });
  if (typeof module === 'object' && module.exports) module.exports = pricing;
  else root.StorePricing = pricing;
})(typeof globalThis !== 'undefined' ? globalThis : this);
