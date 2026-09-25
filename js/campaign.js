(function () {
  'use strict';
  function deadline(value) {
    if (typeof value !== 'string' || !/(Z|[+-]\d{2}:\d{2})$/.test(value)) return null;
    const date = Date.parse(value);
    return Number.isFinite(date) ? date : null;
  }
  function durationMinutes(slug, config) {
    const product = config.products && config.products[slug];
    if (Number.isInteger(product?.durationMinutes) && product.durationMinutes >= 15 && product.durationMinutes <= 25) return product.durationMinutes;
    let hash = 0;
    for (const char of slug) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
    const min = Number.isInteger(config.minMinutes) ? config.minMinutes : 15;
    const max = Number.isInteger(config.maxMinutes) ? config.maxMinutes : 25;
    return min + hash % (max - min + 1);
  }
  function productDeadline(slug, config) {
    const product = config.products && config.products[slug];
    const fixed = deadline(product?.endsAt);
    if (fixed) return fixed;
    const minutes = durationMinutes(slug, config);
    const key = 'campaign-end-v2:' + slug;
    try {
      const saved = Number(localStorage.getItem(key));
      if (Number.isFinite(saved) && saved > Date.now()) return saved;
      const end = Date.now() + minutes * 60000;
      localStorage.setItem(key, String(end));
      return end;
    } catch (_) {
      return Date.now() + minutes * 60000;
    }
  }
  function remaining(end, now) {
    const total = Math.max(0, Math.ceil((end - now) / 1000));
    const days = Math.floor(total / 86400);
    const pad = n => String(n).padStart(2, '0');
    return (days ? days + 'd ' : '') + pad(Math.floor(total / 3600) % 24) + ':' + pad(Math.floor(total / 60) % 60) + ':' + pad(total % 60);
  }
  async function init() {
    let config;
    try {
      const response = await fetch('campaign.json', {cache: 'no-store'});
      if (!response.ok) return;
      config = await response.json();
      if (!config || typeof config !== 'object') return;
    } catch (_) { return; }
    const elements = [];
    document.querySelectorAll('[data-campaign-product]').forEach(root => {
      const slug = root.dataset.campaignProduct;
      const end = productDeadline(slug, config);
      if (!end || end <= Date.now()) return;
      const badge = root.querySelector('[data-campaign-badge]');
      const target = root.querySelector('[data-campaign-timer]');
      if (!target) return;
      const label = document.createElement('span');
      label.className = 'campaign-label';
      label.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 7v5l3 2" fill="none" stroke="currentColor" stroke-width="2"/></svg> Encerra em';
      const digits = document.createElement('span');
      digits.className = 'campaign-digits';
      target.replaceChildren(label, digits);
      target.classList.add('campaign-countdown');
      target.hidden = false;
      target.title = 'Fim da campanha: ' + new Date(end).toLocaleString('pt-BR', {timeZone:'America/Sao_Paulo'}) + ' (Brasília)';
      elements.push({slug,end,badge,target,digits});
    });
    function tick() {
      const now = Date.now();
      let active = false;
      for (const item of elements) {
        if (now >= item.end) {
          item.end = now + durationMinutes(item.slug, config) * 60000;
          try { localStorage.setItem('campaign-end-v2:' + item.slug, String(item.end)); } catch (_) {}
          item.target.title = 'Fim da campanha: ' + new Date(item.end).toLocaleString('pt-BR', {timeZone:'America/Sao_Paulo'}) + ' (Brasília)';
        }
        active = true;
        item.digits.textContent = remaining(item.end, now);
        if (item.badge) {
          const lastHours = item.end-now <= 86400000;
          item.badge.textContent = lastHours ? 'ÚLTIMAS UNIDADES' : 'TEMPO LIMITADO';
          item.badge.classList.toggle('campaign-last-hours', lastHours);
        }
      }
      return active;
    }
    if (tick()) {
      const timer = setInterval(() => {if (!tick()) clearInterval(timer);}, 1000);
      document.addEventListener('visibilitychange',tick);
    }
  }
  init();
})();
