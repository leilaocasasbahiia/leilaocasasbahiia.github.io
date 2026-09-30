(function () {
    'use strict';

    const OFFERS = [
        {
            id: '011',
            name: 'Air Fryer Mondial 12L',
            image: 'assets/images/lotes/500ff41d-0aa2-47f4-88c9-a10eb29263be.webp',
            oldPrice: 290,
            price: 149.9,
            badge: 'Mais pedido'
        },
        {
            id: '015',
            name: 'Cafeteira Nespresso 15 Bar',
            image: 'assets/images/lotes/images-1.jpg',
            oldPrice: 220,
            price: 119.9,
            badge: 'Economize agora'
        },
        {
            id: '014',
            name: 'Micro-ondas Philco 34L Inox',
            image: 'assets/images/lotes/fotos_5HQwyzyjzHKUYFDtY7Y67B0p28ErSDbjeatsWP3QhEJNWuWJVc8E4oA8VyoX.jpg',
            oldPrice: 150,
            price: 97.9,
            badge: 'Preço único'
        }
    ];

    const order = loadOrder();
    const buyBtn = document.getElementById('buy-btn');
    const offersEl = document.getElementById('upsell-offers');
    const pixBox = document.getElementById('pix-payment-box');
    const waiting = document.getElementById('pix-waiting-state');
    const success = document.getElementById('pix-success-state');
    const codeInput = document.getElementById('pix-code');
    const qrImage = document.getElementById('pix-qr-image');
    const copyBtn = document.getElementById('pix-copy-btn');
    const qrToggle = document.getElementById('pix-qr-toggle');
    const qrWrap = document.getElementById('pix-qr-wrap');
    const amountLabel = document.getElementById('pix-amount-label');
    const selectedNameEl = document.getElementById('pix-selected-name');

    let selectedOffer = null;
    let generating = false;
    let purchaseTracked = false;
    let currentOrderId = null;
    let lastPayment = null;
    let paymentPollTimeout = null;
    let paymentPollStartedAt = 0;

    fillOrderSummary(order);
    fillHiddenCustomer(order);
    renderOffers();
    startOfferTimer();

    if (buyBtn) {
        buyBtn.addEventListener('click', createOfferPix);
    }

    if (copyBtn) {
        copyBtn.addEventListener('click', copyPixCode);
    }

    if (qrToggle && qrWrap) {
        qrToggle.addEventListener('click', function () {
            const willOpen = qrWrap.hidden;
            qrWrap.hidden = !willOpen;
            qrToggle.textContent = willOpen
                ? '− Ocultar QR Code'
                : '＋ Prefere pagar usando QR Code?';
        });
    }

    window.paymentApproved = function paymentApproved() {
        stopPaymentPolling();
        markOfferPaid();
    };    function loadOrder() {
        try {
            const raw = sessionStorage.getItem('upsell_order')
                || localStorage.getItem('upsell_order');
            return raw ? JSON.parse(raw) : null;
        } catch (error) {
            return null;
        }
    }    function formatMoney(value) {
        return Number(value || 0).toLocaleString('pt-BR', {
            style: 'currency',
            currency: 'BRL'
        });
    }    function fillOrderSummary(data) {
        const nameEl = document.getElementById('upsell-product-name');
        const lotEl = document.getElementById('upsell-lot');
        const amountEl = document.getElementById('upsell-product-amount');
        const imageEl = document.getElementById('upsell-product-image');

        if (!data) {
            if (nameEl) nameEl.textContent = 'Seu pedido';
            if (amountEl) amountEl.textContent = 'Pagamento confirmado';
            return;
        }

        if (nameEl) nameEl.textContent = data.productName || 'Produto';
        if (lotEl) lotEl.textContent = data.lotId ? 'LOTE ' + data.lotId : 'SEU PEDIDO';
        if (amountEl) amountEl.textContent = 'Pago: ' + formatMoney(data.amount);

        if (imageEl && data.productImage) {
            imageEl.src = data.productImage;
            imageEl.alt = data.productName || '';
            imageEl.hidden = false;
        }
    }    function fillHiddenCustomer(data) {
        if (!data || !data.customer) {
            return;
        }

        const map = {
            name: data.customer.name || '',
            cpf: data.customer.document || '',
            email: data.customer.email || '',
            phone: data.customer.phone || ''
        };

        Object.keys(map).forEach(function (id) {
            const el = document.getElementById(id);
            if (el) {
                el.value = map[id];
            }
        });
    }    function availableOffers() {
        const boughtLot = order && order.lotId ? String(order.lotId) : '';
        const boughtName = order && order.productName
            ? String(order.productName).toLowerCase()
            : '';

        return OFFERS.filter(function (offer) {
            if (boughtLot && String(offer.id) === boughtLot) {
                return false;
            }

            return boughtName.indexOf(String(offer.name).toLowerCase()) === -1;
        });
    }    function renderOffers() {
        if (!offersEl) {
            return;
        }

        const list = availableOffers();
        offersEl.innerHTML = '';

        if (!list.length) {
            offersEl.innerHTML = '<p class="upsell-empty">Nenhuma oferta disponível no momento.</p>';
            if (buyBtn) buyBtn.disabled = true;
            return;
        }

        list.forEach(function (offer, index) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'upsell-offer';
            button.setAttribute('role', 'radio');
            button.setAttribute('aria-checked', 'false');
            button.dataset.offerId = offer.id;

            button.innerHTML =
                '<span class="upsell-offer-badge">' + escapeHtml(offer.badge) + '</span>' +
                '<img src="' + escapeHtml(offer.image) + '" alt="' + escapeHtml(offer.name) + '" loading="lazy">' +
                '<span class="upsell-offer-body">' +
                    '<strong>' + escapeHtml(offer.name) + '</strong>' +
                    '<span class="upsell-offer-prices">' +
                        '<s>' + formatMoney(offer.oldPrice) + '</s>' +
                        '<b>' + formatMoney(offer.price) + '</b>' +
                    '</span>' +
                    '<em>Frete grátis no mesmo envio</em>' +
                '</span>';

            button.addEventListener('click', function () {
                selectOffer(offer, button);
            });

            offersEl.appendChild(button);

            if (index === 0) {
                selectOffer(offer, button);
            }
        });
    }    function selectOffer(offer, button) {
        selectedOffer = offer;

        Array.prototype.forEach.call(
            offersEl.querySelectorAll('.upsell-offer'),
            function (el) {
                el.classList.remove('is-selected');
                el.setAttribute('aria-checked', 'false');
            }
        );

        button.classList.add('is-selected');
        button.setAttribute('aria-checked', 'true');

        if (buyBtn) {
            buyBtn.disabled = false;
            buyBtn.textContent = 'Garantir ' + formatMoney(offer.price) + ' via Pix';
        }
    }    function startOfferTimer() {
        const timerEl = document.getElementById('upsell-timer');
        if (!timerEl) {
            return;
        }

        let remaining = 12 * 60;

        function tick() {
            const minutes = Math.floor(remaining / 60);
            const seconds = remaining % 60;
            timerEl.textContent =
                'Oferta disponível por ' +
                String(minutes).padStart(2, '0') +
                ':' +
                String(seconds).padStart(2, '0');

            if (remaining <= 0) {
                return;
            }

            remaining -= 1;
            setTimeout(tick, 1000);
        }

        tick();
    }    function escapeHtml(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }    function endpointUrl(file) {
        return new URL(file, window.location.href).href.split('?')[0];
    }    function getCookie(name) {
        const prefix = name + '=';
        const parts = document.cookie ? document.cookie.split(';') : [];
        for (let i = 0; i < parts.length; i += 1) {
            const part = parts[i].trim();
            if (part.indexOf(prefix) === 0) {
                return decodeURIComponent(part.slice(prefix.length));
            }
        }
        return '';
    }    async function generatePixViaServer(config) {
        const response = await fetch(endpointUrl('api/create-pix.php'), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            credentials: 'same-origin',
            body: JSON.stringify(config)
        });

        let result = null;
        try {
            result = await response.json();
        } catch (error) {
            throw new Error('A API de pagamentos retornou uma resposta inválida.');
        }

        if (!response.ok || !result || !result.success) {
            throw new Error(result && result.message
                ? result.message
                : 'Não foi possível gerar o Pix.');
        }

        return result;
    }    async function queryPaymentStatus(payment) {
        const response = await fetch(endpointUrl('api/payment-status.php'), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            credentials: 'same-origin',
            cache: 'no-store',
            body: JSON.stringify({
                payment_code: payment.paymentCode,
                external_code: currentOrderId
            })
        });
        let result = null;
        try {
            result = await response.json();
        } catch (error) {
            throw new Error('Resposta de status inválida.');
        }
        if (!response.ok || !result || !result.success) {
            throw new Error(result && result.message
                ? result.message
                : 'Não foi possível consultar o pagamento.');
        }
        return result;
    }    function trackBrowserPurchase(result, payment) {
        if (!result || !result.eventId || typeof window.fbq !== 'function') {
            return false;
        }
        const storageKey = 'meta_browser_purchase_' + payment.paymentCode;
        try {
            if (localStorage.getItem(storageKey) === result.eventId) {
                purchaseTracked = true;
                return true;
            }
        } catch (error) {
            // O event_id também protege contra duplicidade na Meta.
        }
        const contentIds = Array.isArray(result.contentIds) && result.contentIds.length
            ? result.contentIds
            : [selectedOffer ? String(selectedOffer.id) : 'upsell'];
        window.fbq('track', 'Purchase', {
            value: Number(result.value) || Number(payment.amount) || 0,
            currency: result.currency || 'BRL',
            content_type: 'product',
            content_ids: contentIds,
            contents: contentIds.map(function (id) {
                return { id: String(id), quantity: 1 };
            }),
            num_items: 1
        }, {
            eventID: result.eventId
        });
        try {
            localStorage.setItem(storageKey, result.eventId);
        } catch (error) {
            // O envio pela Conversions API continua ativo.
        }
        purchaseTracked = true;
        return true;
    }    function stopPaymentPolling() {
        if (paymentPollTimeout) {
            clearTimeout(paymentPollTimeout);
            paymentPollTimeout = null;
        }
    }    function triggerMetaWorker() {
        fetch(endpointUrl('api/meta-worker.php'), {
            method: 'GET',
            credentials: 'same-origin',
            cache: 'no-store',
            keepalive: true
        }).catch(function () {
            // O Cron continuará tentando caso o navegador seja fechado.
        });
    }    function startPaymentPolling(payment) {
        stopPaymentPolling();
        if (!payment || !payment.paymentCode || !currentOrderId) {
            return;
        }
        paymentPollStartedAt = Date.now();
        const poll = async function () {
            const elapsed = Date.now() - paymentPollStartedAt;
            if (elapsed > 30 * 60 * 1000) {
                stopPaymentPolling();
                return;
            }
            try {
                const result = await queryPaymentStatus(payment);
                if (result.approved && result.status === 'approved') {
                    trackBrowserPurchase(result, payment);
                    triggerMetaWorker();
                    window.paymentApproved();
                    return;
                }
                if (['refused', 'refunded', 'expired', 'cancelled', 'canceled'].indexOf(result.status) !== -1) {
                    stopPaymentPolling();
                    return;
                }
            } catch (error) {
                console.warn('Consulta do Pix adicional será repetida.', error);
            }
            const currentElapsed = Date.now() - paymentPollStartedAt;
            const delay = document.hidden
                ? 30000
                : (currentElapsed < 5 * 60 * 1000 ? 10000 : 30000);
            paymentPollTimeout = setTimeout(poll, delay);
        };
        paymentPollTimeout = setTimeout(poll, 7000);
    }    function getTrackingParameters() {
        const params = new URLSearchParams(window.location.search);
        let stored = {};
        try {
            stored = JSON.parse(localStorage.getItem('site_attribution_v1') || '{}') || {};
        } catch (error) {
            stored = {};
        }

        const orderTracking = order && order.tracking ? order.tracking : {};
        const read = function (key) {
            return params.get(key) || orderTracking[key] || stored[key] || null;
        };

        return {
            src: read('src'),
            sck: read('sck'),
            utm_source: read('utm_source'),
            utm_medium: read('utm_medium'),
            utm_campaign: read('utm_campaign'),
            utm_content: read('utm_content'),
            utm_term: read('utm_term'),
            fbclid: read('fbclid')
        };
    }    function buildProductPayload(offer) {
        return [
            {
                id: String(offer.id),
                name: offer.name,
                quantity: 1,
                priceInCents: Math.round(offer.price * 100)
            }
        ];
    }    function saveUtmifyContext(orderId, offer) {
        const customer = (order && order.customer) || {};
        const address = (order && order.address) || {};
        const body = {
            order_id: orderId,
            customer: customer,
            shipping: {
                zip_code: address.zip || '',
                city: address.city || '',
                state: address.state || ''
            },
            products: buildProductPayload(offer),
            total_price_cents: Math.round(offer.price * 100),
            src: getTrackingParameters().src,
            sck: getTrackingParameters().sck,
            utm_source: getTrackingParameters().utm_source,
            utm_medium: getTrackingParameters().utm_medium,
            utm_campaign: getTrackingParameters().utm_campaign,
            utm_content: getTrackingParameters().utm_content,
            utm_term: getTrackingParameters().utm_term,
            fbp: getCookie('_fbp') || null,
            fbc: getCookie('_fbc') || null,
            fbclid: getTrackingParameters().fbclid,
            client_user_agent: navigator.userAgent,
            event_source_url: window.location.href
        };

        return fetch(endpointUrl('api/utmify-context.php'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            credentials: 'same-origin',
            keepalive: true
        }).then(async function (response) {
            let result = null;
            try {
                result = await response.json();
            } catch (error) {
                result = null;
            }
            if (!response.ok || !result || !result.ok) {
                throw new Error('Não foi possível registrar os dados de atribuição. Tente novamente.');
            }
            return result;
        });
    }    async function createOfferPix() {
        if (generating || !selectedOffer) {
            return;
        }

        if (!order || !order.customer || !order.customer.name || !order.customer.document) {
            alert('Não encontramos os dados da compra. Refaça o pagamento do produto.');
            return;
        }

        generating = true;
        buyBtn.disabled = true;
        buyBtn.textContent = 'Gerando Pix...';

        try {
            const baseId = (order.orderId || ('CB_' + Date.now())).replace(/[^A-Za-z0-9_-]/g, '');
            currentOrderId = 'UP_' + selectedOffer.id + '_' + baseId.slice(0, 70);
            await saveUtmifyContext(currentOrderId, selectedOffer);

            const shipping = order.address || {};
            const config = {
                total_price: selectedOffer.price,
                shipping_price: 0,
                customer: {
                    name: order.customer.name,
                    document: order.customer.document,
                    email: order.customer.email || '',
                    phone: order.customer.phone || ''
                },
                shipping: {
                    zip_code: shipping.zip || '',
                    street: shipping.street || '',
                    neighborhood: shipping.neighborhood || '',
                    city: shipping.city || '',
                    state: shipping.state || '',
                    number: shipping.number || '',
                    complement: shipping.complement || ''
                },
                items: [
                    {
                        name: selectedOffer.name,
                        price: selectedOffer.price,
                        quantity: 1
                    }
                ],
                external_code: currentOrderId,
                metadata: getTrackingParameters()
            };

            const response = await generatePixViaServer(config);

            if (!response || !response.success) {
                throw new Error(response && response.message
                    ? response.message
                    : 'Não foi possível gerar o Pix.');
            }

            lastPayment = {
                amount: selectedOffer.price,
                paymentCode: response.paymentCode || null
            };
            showPix(response, selectedOffer);
            startPaymentPolling(lastPayment);
        } catch (error) {
            console.error(error);
            alert(error.message || 'Erro ao gerar o Pix da oferta.');
            buyBtn.disabled = false;
            buyBtn.textContent = selectedOffer
                ? 'Garantir ' + formatMoney(selectedOffer.price) + ' via Pix'
                : 'Escolha um produto';
        } finally {
            generating = false;
        }
    }    function showPix(response, offer) {
        const qr = response.qrCodeImage || '';
        qrImage.src = qr.indexOf('data:image') === 0 || qr.indexOf('http') === 0
            ? qr
            : 'data:image/png;base64,' + qr;
        codeInput.value = response.pixCode || '';

        if (amountLabel) amountLabel.textContent = formatMoney(offer.price);
        if (selectedNameEl) selectedNameEl.textContent = offer.name;

        buyBtn.hidden = true;
        const skip = document.getElementById('upsell-skip');
        if (skip) skip.hidden = true;
        if (offersEl) offersEl.hidden = true;

        pixBox.hidden = false;
        waiting.hidden = false;
        success.hidden = true;

        pixBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }    async function copyPixCode() {
        if (!codeInput || !codeInput.value) {
            return;
        }

        codeInput.select();

        try {
            await navigator.clipboard.writeText(codeInput.value);
        } catch (error) {
            document.execCommand('copy');
        }

        const original = copyBtn.textContent;
        copyBtn.textContent = '✓ CÓDIGO PIX COPIADO';
        const feedback = document.getElementById('pix-copy-feedback');
        if (feedback) feedback.hidden = false;

        setTimeout(function () {
            copyBtn.textContent = original;
        }, 1500);

        setTimeout(function () {
            if (feedback) feedback.hidden = true;
        }, 4000);
    }    function markOfferPaid() {
        if (waiting) waiting.hidden = true;
        if (success) success.hidden = false;
        if (pixBox) pixBox.hidden = false;
        if (buyBtn) buyBtn.hidden = true;

        purchaseTracked = true;
    }
})();
