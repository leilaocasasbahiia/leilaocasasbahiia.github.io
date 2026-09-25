(function () {
  'use strict';
  // Both the old preview and Live Server must use the current Node API.
  if (['127.0.0.1', 'localhost'].includes(location.hostname) && ['3000','5500'].includes(location.port)) {
    location.replace('http://127.0.0.1:3001/checkout.html' + location.search);
    return;
  }
  const $ = id => document.getElementById(id);
  const form = $('previewForm');
  const money = value => (value / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  let items = [];
  let current = null, customer = null, pendingRequest = null, busy = false;
  const zipInput = form.elements.zipCode;
  const addressFields = ['street', 'district', 'city', 'state'];
  const zipStatus = document.createElement('p');
  zipStatus.className = 'checkout-footnote';
  zipStatus.id = 'zipStatus';
  zipStatus.setAttribute('role', 'status');
  zipStatus.textContent = 'Digite o CEP para preencher o endereço automaticamente.';
  zipInput.closest('label').after(zipStatus);
  zipInput.setAttribute('aria-describedby', zipStatus.id);
  let zipController = null, zipVersion = 0, lastZip = '';
  const automaticAddress = {};
  const editedAddress = new Set();
  function updateShippingEstimate() {
    const state = form.elements.state.value.trim().toUpperCase();
    const fast = ['SP', 'RJ', 'MG', 'ES', 'PR', 'SC', 'RS', 'DF', 'GO', 'MT', 'MS'];
    const standard = ['AC', 'AP', 'AM', 'PA', 'RO', 'RR', 'TO', 'AL', 'BA', 'CE', 'MA', 'PB', 'PE', 'PI', 'RN', 'SE'];
    $('shippingEstimate').textContent = fast.includes(state)
      ? 'Entrega em 3 a 5 dias úteis.'
      : standard.includes(state)
        ? 'Entrega em 5 a 7 dias úteis.'
        : 'Informe seu CEP ou um estado válido para consultar o prazo de entrega.';
  }
  async function lookupZip() {
    const zip = zipInput.value.replace(/\D/g, '');
    if (busy || zip === lastZip) return;
    lastZip = zip;
    const version = ++zipVersion;
    zipController?.abort();
    // Remove only values supplied by the previous lookup; retain manual edits.
    for (const name of addressFields) {
      if (automaticAddress[name] && form.elements[name].value === automaticAddress[name]) form.elements[name].value = '';
      delete automaticAddress[name];
    }
    editedAddress.clear();
    updateShippingEstimate();
    if (zip.length !== 8) {
      zipStatus.textContent = 'Digite os 8 números do CEP ou preencha o endereço manualmente.';
      return;
    }
    const controller = new AbortController();
    zipController = controller;
    const timeout = setTimeout(() => controller.abort(), 8000);
    zipStatus.textContent = 'Buscando endereço…';
    try {
      const response = await fetch('https://viacep.com.br/ws/' + zip + '/json/', {
        signal: controller.signal, credentials: 'omit', referrerPolicy: 'no-referrer'
      });
      if (!response.ok) throw new Error('lookup');
      const address = await response.json();
      if (version !== zipVersion || busy) return;
      if (address.erro || typeof address.localidade !== 'string' || !/^[A-Z]{2}$/.test(address.uf)) {
        zipStatus.textContent = 'CEP não encontrado. Confira o CEP ou preencha o endereço manualmente.';
        return;
      }
      const values = {street: address.logradouro, district: address.bairro, city: address.localidade, state: address.uf};
      for (const name of addressFields) {
        if (!editedAddress.has(name) && typeof values[name] === 'string' && values[name].trim()) {
          form.elements[name].value = values[name].trim();
          automaticAddress[name] = values[name].trim();
        }
      }
      zipStatus.textContent = addressFields.every(name => form.elements[name].value.trim())
        ? 'Endereço preenchido. Confira os dados e informe o número.'
        : 'CEP localizado. Complete os campos que faltam e informe o número.';
      updateShippingEstimate();
    } catch (_) {
      if (version === zipVersion && !busy) {
        lastZip = '';
        zipStatus.textContent = 'Não foi possível consultar o CEP. Você pode preencher o endereço manualmente.';
      }
    } finally { clearTimeout(timeout); }
  }
  zipInput.addEventListener('blur', lookupZip);
  function paymentStatus() {
    const paid=current?.status==='paid_manually';
    if (paid) {
      if (current.id && Number.isSafeInteger(current.amount) && current.amount > 0) {
        try { sessionStorage.setItem('zg_paid_order', JSON.stringify({id: current.id, amount: current.amount})); } catch (_) {}
      }
      $('pixStatus').textContent='Pagamento confirmado. Redirecionando…';
      setTimeout(() => location.replace('obrigado.html'), 500);
      return;
    }
    $('pixStatus').textContent='Aguardando a confirmação do pagamento.';
  }
  function showCurrentOrder() {
    if (!current) return;
    if (current.id && Number.isSafeInteger(current.amount) && current.amount > 0 && typeof window.fbq === 'function') {
      const eventId = 'purchase_' + current.id;
      const storageKey = 'zg_meta_' + eventId;
      let alreadyTracked = false;
      try { alreadyTracked = !!localStorage.getItem(storageKey); } catch (_) {}
      if (!alreadyTracked) {
        window.fbq('track', 'Purchase', {value: current.amount / 100, currency: 'BRL'}, {eventID: eventId});
        try { localStorage.setItem(storageKey, '1'); } catch (_) {}
      }
    }
    paymentStatus();
    $('previewResult').textContent = 'Total: ' + money(current.amount) + ' · Referência: ' + current.txid;
    $('pixRecipient').textContent = 'Recebedor: ' + current.recipient.name + ' · ' + current.recipient.bank;
    $('pixImage').src = current.qrCodeUrl;
    $('pixCode').value = current.qrCode;
    $('checkoutNotice').hidden = true;
    $('checkoutLayout').hidden = true;
    $('previewComplete').hidden = false;
  }
  function update() {
    updateShippingEstimate();
    const subtotal = items.reduce((sum, p) => sum + p.priceCents, 0);
    const shipping = items.length ? Number(form.elements.shipping.value) : 0;
    $('previewSubtotal').textContent = money(subtotal);
    $('previewShipping').textContent = shipping ? money(shipping) : 'Grátis';
    $('previewShipping').classList.toggle('checkout__free-shipping', shipping === 0);
    $('previewTotal').textContent = money(subtotal + shipping);
  }
  function saveItemsAndUrl() {
    try {
      const saved = JSON.parse(localStorage.getItem('arremata_cart') || '[]');
      if (Array.isArray(saved)) localStorage.setItem('arremata_cart', JSON.stringify(saved.filter(item => items.some(product => product.slug === item?.slug))));
    } catch (_) {}
    if (!items.length) {
      location.href = 'index.html';
      return;
    }
    history.replaceState(null, '', 'checkout.html?itens=' + encodeURIComponent(items.map(item => item.slug).join(',')));
  }
  function renderItems() {
    const container = $('previewItems');
    container.replaceChildren();
    for (const product of items) {
      const row = document.createElement('div'); row.className = 'checkout__product';
      const img = document.createElement('img'); img.src = product.img; img.alt = product.title;
      const info = document.createElement('div'); info.className = 'checkout__product-info';
      const title = document.createElement('p'); title.textContent = product.title + ' — ' + money(product.priceCents);
      const remove = document.createElement('button');
      remove.type = 'button'; remove.className = 'checkout__product-remove'; remove.textContent = 'Remover';
      remove.setAttribute('aria-label', 'Remover ' + product.title + ' do carrinho');
      remove.addEventListener('click', () => {
        items = items.filter(item => item.slug !== product.slug);
        saveItemsAndUrl();
        if (items.length) { renderItems(); update(); }
      });
      info.append(title, remove); row.append(img, info); container.append(row);
    }
  }
  form.addEventListener('change', update);
  form.addEventListener('input', event => {
    const input = event.target, digits = input.value.replace(/\D/g, '');
    if (input.name === 'zipCode') input.value = digits.slice(0, 8).replace(/^(\d{5})(\d)/, '$1-$2');
    if (input.name === 'document') input.value = digits.slice(0, 11).replace(/^(\d{3})(\d)/, '$1.$2').replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3').replace(/(\d{3})\.(\d{3})\.(\d{3})(\d)/, '$1.$2.$3-$4');
    if (input.name === 'phone') input.value = digits.slice(0, 11).replace(/^(\d{2})(\d)/, '($1) $2').replace(/(\d{4,5})(\d{4})$/, '$1-$2');
    if (input.name === 'state') input.value = input.value.replace(/[^a-z]/gi, '').toUpperCase();
    if (input.name === 'state') updateShippingEstimate();
    if (addressFields.includes(input.name)) editedAddress.add(input.name);
    if (input.name === 'zipCode') lookupZip();
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (busy || !items.length || !form.reportValidity()) return;
    busy = true;
    ++zipVersion;
    zipController?.abort();
    $('previewSubmit').disabled = true;
    $('previewSubmit').textContent = 'Gerando Pix…';
    const value = name => form.elements[name].value.trim();
    customer = { name: value('name'), email: value('email'), document: value('document'), phone: value('phone'),
      address: Object.fromEntries(['zipCode','street','number','complement','district','city','state'].map(name => [name, value(name)])) };
    const data = { items: items.map(p => ({slug:p.slug})), expectedAmount:items.reduce((sum,p)=>sum+p.priceCents,0), customer };
    const signature = JSON.stringify(data);
    if (!pendingRequest || pendingRequest.signature !== signature) pendingRequest = {signature,id:crypto.randomUUID(),token:Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('')};
    try {
      const fingerprint=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(signature))),b=>b.toString(16).padStart(2,'0')).join('');
      try {
        const saved=JSON.parse(sessionStorage.getItem('zg_pending_order')||'null');
        if(saved?.fingerprint===fingerprint&&typeof saved.id==='string'&&typeof saved.token==='string') {pendingRequest.id=saved.id;pendingRequest.token=saved.token;}
        sessionStorage.setItem('zg_pending_order',JSON.stringify({fingerprint,id:pendingRequest.id,token:pendingRequest.token}));
      } catch (_) {}
      const response = await fetch('/api/orders', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...data,requestId:pendingRequest.id,accessToken:pendingRequest.token}),signal:AbortSignal.timeout(15000)});
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Não foi possível gerar o Pix.');
      current = result;
      try { sessionStorage.setItem('zg_current_order', JSON.stringify(current)); } catch (_) {}
      showCurrentOrder();
      $('previewComplete').focus();
    } catch (error) {
      $('checkoutNotice').textContent = error.name === 'TimeoutError' || error instanceof TypeError ? 'Não foi possível conectar à API Pix. Tente novamente.' : error.message;
      $('checkoutNotice').hidden = false;
      $('checkoutNotice').scrollIntoView({block:'center'});
    } finally {busy=false;$('previewSubmit').disabled=false;$('previewSubmit').textContent='FINALIZAR COMPRA';}
  });
  $('copyPix').addEventListener('click', async () => {
    if(!current||current.status==='paid_manually')return;
    try { await navigator.clipboard.writeText(current.qrCode); $('pixStatus').textContent='Código copiado. Aguardando pagamento e conferência manual.'; }
    catch (_) { $('pixCode').focus(); $('pixCode').select(); $('pixStatus').textContent='Selecione e copie o código acima. A confirmação é manual.'; }
  });
  async function checkPaymentStatus() {
    if (!current || !pendingRequest || busy || document.hidden || current.status === 'paid_manually') return;
    try {
      const response = await fetch('/api/orders', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'status',requestId:current.id,accessToken:pendingRequest.token}),signal:AbortSignal.timeout(15000)});
      const data = await response.json();
      if (!response.ok) throw Error(data.error || 'Não foi possível consultar o pedido.');
      current = data;
      paymentStatus();
    } catch (_) {
      $('pixStatus').textContent = 'Aguardando a confirmação do pagamento.';
    }
  }
  async function init() {
    try {
      try {
        const savedRequest = JSON.parse(sessionStorage.getItem('zg_pending_order') || 'null');
        const savedOrder = JSON.parse(sessionStorage.getItem('zg_current_order') || 'null');
        if (savedRequest?.id && savedRequest?.token && savedOrder?.id === savedRequest.id) {
          pendingRequest = savedRequest;
          current = savedOrder;
          showCurrentOrder();
          await checkPaymentStatus();
          if (current?.status === 'paid_manually') return;
        }
      } catch (_) {}
      const response = await fetch('catalog.json');
      if (!response.ok) throw new Error('catalog');
      const catalog = await response.json();
      const slug = new URLSearchParams(location.search).get('produto');
      const selected = new URLSearchParams(location.search).get('itens');
      let slugs = slug ? [slug] : selected ? selected.split(',') : [];
      if (!slug && !selected) {
        try { const saved = JSON.parse(localStorage.getItem('arremata_cart') || '[]'); if (Array.isArray(saved)) slugs = saved.filter(p => p && typeof p.slug === 'string').map(p => p.slug); } catch (_) {}
      }
      items = catalog.filter(p => slugs.includes(p.slug)).map(p => ({...p, basePriceCents:p.priceCents, priceCents:StorePricing.total(p.priceCents)}));
      if (items.length && typeof window.fbq === 'function') {
        window.fbq('track', 'InitiateCheckout', {
          content_ids: items.map(item => item.slug),
          content_type: 'product',
          contents: items.map(item => ({id:item.slug,quantity:1})),
          num_items: items.length,
          value: items.reduce((sum,item) => sum + item.priceCents, 0) / 100,
          currency: 'BRL'
        });
      }
      renderItems();
      if (!items.length) { $('checkoutNotice').textContent = 'Selecione um produto no catálogo para iniciar o checkout.'; $('checkoutNotice').hidden = false; }
      $('previewSubmit').disabled = !items.length;
      update();
    } catch (_) { $('checkoutNotice').textContent = 'Não foi possível carregar os produtos. Atualize a página para tentar novamente.'; $('checkoutNotice').hidden = false; }
  }
  // Consulta automaticamente até o pagamento ser confirmado.
  setInterval(checkPaymentStatus, 5000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) checkPaymentStatus(); });
  window.addEventListener('focus', checkPaymentStatus);
  init();
})();
