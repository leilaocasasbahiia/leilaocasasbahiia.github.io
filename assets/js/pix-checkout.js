(function () {
    'use strict';

    const form = document.getElementById('checkout-form');

    if (!form) {
        return;
    }

    const payButton = form.querySelector('.checkout-pay-button');
    const actionField = form.querySelector('[name="action"]');
    const isBidFlow = new URLSearchParams(window.location.search).get('action') === 'bid'
        || (actionField && actionField.value === 'bid');
    const originalButtonText = payButton
        ? payButton.textContent.trim()
        : 'Pagar via Pix';

    let generating = false;
    let lastPayment = null;
    let purchaseTracked = false;
    let currentOrderId = null;
    let reservationTimer = null;
    let bidCountdownTimer = null;
    let paymentPollTimeout = null;
    let paymentPollStartedAt = 0;
    let bidStage = isBidFlow ? 'confirmation' : 'payment';

    injectStyles();
    ensureFieldIds();
    ensurePixPanel();
    ensureBidPanels();

    form.addEventListener(
        'submit',
        function (event) {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();

            if (isBidFlow && bidStage === 'confirmation') {
                showBidCountdown();
                return;
            }

            createPixPayment();
        },
        true
    );

    // CAPTURA E PERSISTÊNCIA DE UTMs
    function saveUTMs() {
        const urlParams = new URLSearchParams(window.location.search);
        const utmKeys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'src', 'sck'];
        let storedUtms = {};

        try {
            storedUtms = JSON.parse(localStorage.getItem('tracking_utms') || '{}');
        } catch (e) { }

        let hasNewUtms = false;
        utmKeys.forEach(function (param) {
            if (urlParams.has(param)) {
                storedUtms[param] = urlParams.get(param);
                hasNewUtms = true;
            }
        });

        if (hasNewUtms) {
            localStorage.setItem('tracking_utms', JSON.stringify(storedUtms));
        }
        return storedUtms;
    }
    const trackingUtms = saveUTMs();

    window.paymentApproved = function paymentApproved() {
        stopPaymentPolling();
        if (lastPayment) {
            saveUpsellOrderData(
                lastPayment.amount,
                lastPayment.name,
                currentOrderId || ('CB_' + (getLotId() || 'LOTE') + '_' + Date.now()),
                lastPayment.paymentCode || null
            );
        }

        markPaymentApproved();
        setTimeout(function () {
            window.location.href = getUpsellPageUrl();
        }, 900);
    }; function getUpsellPageUrl() {
        // checkout/*.html → ../upsell.html | páginas na raiz → upsell.html
        if (/\/checkout\//i.test(window.location.pathname)) {
            return new URL('../upsell.html', window.location.href).href;
        }

        return new URL('upsell.html', window.location.href).href;
    } function ensureFieldIds() {
        setIdByName('name', 'name');
        setIdByName('document', 'cpf');
        setIdByName('email', 'email');
        setIdByName('phone', 'phone');

        if (payButton) {
            if (!payButton.id) {
                payButton.id = 'buy-btn';
            }
        }
    } function setIdByName(name, id) {
        const field = form.querySelector('[name="' + name + '"]');

        if (field && !field.id) {
            field.id = id;
        }
    } async function generatePixViaServer(config) {
        const response = await fetch(endpointUrl('../api/create-pix.php'), {
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
    } async function queryPaymentStatus(payment) {
        const response = await fetch(endpointUrl('../api/payment-status.php'), {
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
    } function trackBrowserPurchase(result, payment) {
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
            // A deduplicação principal continua sendo feita pelo event_id na Meta.
        }

        const contentIds = Array.isArray(result.contentIds) && result.contentIds.length
            ? result.contentIds
            : [getLotId() || 'produto'];
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
            // Sem armazenamento, a Meta ainda deduplica pelo event_id.
        }
        purchaseTracked = true;
        return true;
    } function stopPaymentPolling() {
        if (paymentPollTimeout) {
            clearTimeout(paymentPollTimeout);
            paymentPollTimeout = null;
        }
    } function triggerMetaWorker() {
        fetch(endpointUrl('../api/meta-worker.php'), {
            method: 'GET',
            credentials: 'same-origin',
            cache: 'no-store',
            keepalive: true
        }).catch(function () {
            // O Cron continuará tentando caso o navegador seja fechado.
        });
    } function startPaymentPolling(payment) {
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
                console.warn('Consulta do Pix será repetida.', error);
            }

            const currentElapsed = Date.now() - paymentPollStartedAt;
            const delay = document.hidden
                ? 30000
                : (currentElapsed < 5 * 60 * 1000 ? 10000 : 30000);
            paymentPollTimeout = setTimeout(poll, delay);
        };

        paymentPollTimeout = setTimeout(poll, 7000);
    } function getFieldValue(id, name) {
        const byId = document.getElementById(id);
        const byName = form.querySelector('[name="' + name + '"]');
        const field = byId || byName;

        return field ? String(field.value || '').trim() : '';
    } function parsePrice(text) {
        const raw = String(text || '').trim();
        const numeric = raw
            .replace(/[^\d,.-]/g, '')
            .replace(/\./g, '')
            .replace(',', '.');

        const value = parseFloat(numeric);

        return Number.isFinite(value) ? value : 0;
    } function getTotalPrice() {
        const totalEl = document.querySelector('.pay-now-value');

        if (totalEl) {
            const value = parsePrice(totalEl.textContent);

            if (value > 0) {
                return value;
            }
        }

        return parsePrice(originalButtonText);
    } function isBrandProductName(name) {
        const normalized = String(name || '')
            .trim()
            .toLowerCase()
            .replace(/\s+/g, ' ');

        return !normalized
            || normalized === 'casas'
            || normalized === 'casas bahia'
            || normalized === 'produto'
            || normalized.indexOf('finalizar') !== -1;
    }

    function getProductName() {
        const candidates = [];

        const productStrong = document.querySelector('.checkout-product-data strong');

        if (productStrong) {
            candidates.push(String(productStrong.textContent || '').trim());
        }

        const productImage = document.querySelector('.checkout-product-image img');

        if (productImage) {
            candidates.push(String(productImage.getAttribute('alt') || '').trim());
        }

        const lotLabel = document.querySelector('.checkout-product-data small');

        if (lotLabel) {
            const lotText = String(lotLabel.textContent || '').trim();

            if (lotText && /^lote\s+/i.test(lotText) === false) {
                candidates.push(lotText);
            }
        }

        const title = String(document.title || '');
        const titleParts = title.split('|');

        for (let i = 0; i < titleParts.length; i += 1) {
            candidates.push(titleParts[i].trim());
        }

        const html = document.documentElement.innerHTML;
        const match = html.match(/"content_name"\s*:\s*"((?:\\.|[^"\\])*)"/);

        if (match && match[1]) {
            candidates.push(
                match[1]
                    .replace(/\\"/g, '"')
                    .replace(/\\u0022/g, '"')
                    .trim()
            );
        }

        for (let i = 0; i < candidates.length; i += 1) {
            const name = candidates[i];

            if (!isBrandProductName(name)) {
                return name;
            }
        }

        return 'Produto';
    } function getLotId() {
        const field = form.querySelector('[name="id"]');
        return field ? String(field.value || '').trim() : '';
    } function getShipping() {
        const read = function (id) {
            const el = document.getElementById(id);
            return el ? String(el.value || '').trim() : '';
        };

        const zip = read('cep');
        const street = read('street');
        const city = read('city');

        if (!zip && !street && !city) {
            return null;
        }

        return {
            zip_code: zip,
            street: street,
            neighborhood: read('neighborhood'),
            city: city,
            state: read('state'),
            number: read('number'),
            complement: (form.querySelector('[name="complement"]') || {}).value || ''
        };
    } function formatMoney(value) {
        return value.toLocaleString('pt-BR', {
            style: 'currency',
            currency: 'BRL'
        });
    } function getCookie(name) {
        const prefix = name + '=';
        const cookie = document.cookie.split(';').map(function (part) {
            return part.trim();
        }).find(function (part) {
            return part.indexOf(prefix) === 0;
        });

        return cookie ? decodeURIComponent(cookie.slice(prefix.length)) : '';
    } function setTrackingCookie(name, value) {
        const secure = window.location.protocol === 'https:' ? '; Secure' : '';
        document.cookie = name + '=' + encodeURIComponent(value) +
            '; Path=/; Max-Age=7776000; SameSite=Lax' + secure;
    } function ensureMetaAttribution() {
        const params = new URLSearchParams(window.location.search);
        let stored = {};
        try {
            stored = JSON.parse(localStorage.getItem('site_attribution_v1') || '{}') || {};
        } catch (error) {
            stored = {};
        }

        const incomingFbclid = params.get('fbclid');
        if (incomingFbclid) {
            const normalizedFbclid = incomingFbclid.slice(0, 1000);
            if (stored.fbclid !== normalizedFbclid || !stored.fbclid_timestamp) {
                stored.fbclid_timestamp = Date.now();
            }
            stored.fbclid = normalizedFbclid;
        }

        let fbp = getCookie('_fbp');
        if (!fbp) {
            let randomPart = String(Math.floor(Math.random() * 10000000000));
            if (window.crypto && window.crypto.getRandomValues) {
                const values = new Uint32Array(2);
                window.crypto.getRandomValues(values);
                randomPart = String(values[0]) + String(values[1]);
            }
            fbp = 'fb.1.' + Date.now() + '.' + randomPart;
            setTrackingCookie('_fbp', fbp);
        }

        const fbclid = stored.fbclid || '';
        let fbc = getCookie('_fbc');
        if (fbclid && !fbc.endsWith('.' + fbclid)) {
            const clickTimestamp = Number(stored.fbclid_timestamp) || Date.now();
            fbc = 'fb.1.' + clickTimestamp + '.' + fbclid;
            setTrackingCookie('_fbc', fbc);
        }

        try {
            localStorage.setItem('site_attribution_v1', JSON.stringify(stored));
        } catch (error) {
            // Os cookies próprios continuam preservando a atribuição.
        }

        return {
            fbp: fbp,
            fbc: fbc,
            fbclid: fbclid,
            fbclidTimestamp: Number(stored.fbclid_timestamp) || null
        };
    } function endpointUrl(file) {
        return new URL(file, window.location.href).href.split('?')[0];
    } function getTrackingParameters() {
        const params = new URLSearchParams(window.location.search);
        let stored = {};
        try {
            stored = JSON.parse(localStorage.getItem('site_attribution_v1') || '{}') || {};
        } catch (error) {
            stored = {};
        }

        const read = function (key) {
            return params.get(key) || stored[key] || null;
        };

        return {
            src: read('src'),
            sck: read('sck'),
            utm_source: read('utm_source'),
            utm_medium: read('utm_medium'),
            utm_campaign: read('utm_campaign'),
            utm_content: read('utm_content'),
            utm_term: read('utm_term'),
            fbclid: read('fbclid'),
            fbclid_timestamp: stored.fbclid_timestamp || null
        };
    } function buildCustomerPayload() {
        return {
            name: getFieldValue('name', 'name'),
            email: getFieldValue('email', 'email'),
            phone: getFieldValue('phone', 'phone'),
            document: getFieldValue('cpf', 'document')
        };
    } function buildProductsPayload(totalPrice, itemName) {
        return [
            {
                id: getLotId() || 'produto',
                name: itemName,
                quantity: 1,
                priceInCents: Math.round(totalPrice * 100)
            }
        ];
    } function saveUtmifyContext(orderId, totalPrice, itemName) {
        const metaAttribution = ensureMetaAttribution();
        const context = {
            order_id: orderId,
            customer: buildCustomerPayload(),
            shipping: getShipping(),
            products: buildProductsPayload(totalPrice, itemName),
            total_price_cents: Math.round(totalPrice * 100),
            src: getTrackingParameters().src,
            sck: getTrackingParameters().sck,
            utm_source: getTrackingParameters().utm_source,
            utm_medium: getTrackingParameters().utm_medium,
            utm_campaign: getTrackingParameters().utm_campaign,
            utm_content: getTrackingParameters().utm_content,
            utm_term: getTrackingParameters().utm_term,
            fbp: metaAttribution.fbp || null,
            fbc: metaAttribution.fbc || null,
            fbclid: metaAttribution.fbclid || getTrackingParameters().fbclid,
            fbclid_timestamp: metaAttribution.fbclidTimestamp,
            client_user_agent: navigator.userAgent,
            event_source_url: window.location.href
        };

        return fetch(endpointUrl('../api/utmify-context.php'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(context),
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
    } function toSiteAssetPath(src) {
        if (!src) {
            return '';
        }

        try {
            const absolute = new URL(src, window.location.href);
            const marker = '/assets/';
            const index = absolute.pathname.indexOf(marker);

            if (index !== -1) {
                return absolute.pathname.slice(index + 1);
            }
        } catch (error) {
            // fallback abaixo
        }

        return String(src).replace(/^\.\.\//, '');
    } function saveUpsellOrderData(totalPrice, itemName, orderId, paymentCode) {
        const order = {
            orderId: orderId,
            paymentCode: paymentCode || null,
            productName: itemName,
            lotId: getLotId(),
            productImage: toSiteAssetPath(getProductImage()),
            amount: totalPrice,
            customer: buildCustomerPayload(),
            address: {
                zip: getFieldValue('cep', 'cep'),
                street: getFieldValue('street', 'street'),
                number: getFieldValue('number', 'number'),
                neighborhood: getFieldValue('neighborhood', 'neighborhood'),
                city: getFieldValue('city', 'city'),
                state: getFieldValue('state', 'state'),
                complement: ((form.querySelector('[name="complement"]') || {}).value || '').trim()
            },
            tracking: getTrackingParameters(),
            createdAt: Date.now()
        };

        try {
            sessionStorage.setItem('upsell_order', JSON.stringify(order));
            localStorage.setItem('upsell_order', JSON.stringify(order));
        } catch (error) {
            console.error(error);
        }
    } function friendlyMessage(message) {
        const text = String(message || '').toLowerCase();

        if (text.indexOf('to many request') !== -1) {
            return 'Aguarde alguns segundos e tente gerar o Pix novamente.';
        }

        return message || 'Não foi possível gerar o Pix. Tente novamente.';
    } function setButtonState(disabled, text) {
        if (!payButton) {
            return;
        }

        payButton.disabled = disabled;
        payButton.textContent = text;
    } async function createPixPayment() {
        if (generating) {
            return;
        }

        const name = getFieldValue('name', 'name');
        const documentValue = getFieldValue('cpf', 'document');
        const email = getFieldValue('email', 'email');
        const phone = getFieldValue('phone', 'phone');
        const totalPrice = getTotalPrice();
        const itemName = getProductName();

        if (!name || !documentValue || !email || !phone) {
            alert('Preencha nome, e-mail, CPF e telefone para continuar.');
            showStepSafely(1);
            return;
        }

        if (totalPrice <= 0) {
            alert('Não foi possível identificar o valor do pagamento.');
            return;
        }

        generating = true;
        setButtonState(true, 'Gerando Pix...');

        try {
            const externalCode = 'CB_' + (getLotId() || 'LOTE') + '_' + Date.now();
            currentOrderId = externalCode;

            // Persiste a correspondência antes de criar o pagamento.
            await saveUtmifyContext(externalCode, totalPrice, itemName);

            // --- INÍCIO DA CAPTURA DE UTMS ---
            // Garante que pegamos as UTMs reais salvas na navegação
            let currentUtms = {};
            try {
                currentUtms = JSON.parse(localStorage.getItem('tracking_utms') || '{}');
            } catch (e) { }
            // --- FIM DA CAPTURA DE UTMS ---

            const config = {
                total_price: totalPrice,
                shipping_price: 0,
                customer: {
                    name: name,
                    document: documentValue,
                    email: email,
                    phone: phone
                },
                shipping: getShipping(),
                items: [
                    {
                        name: itemName,
                        price: totalPrice,
                        quantity: 1
                    }
                ],
                external_code: externalCode,
                metadata: typeof getTrackingParameters === 'function' ? getTrackingParameters() : {},
                utms: currentUtms // INJEÇÃO DIRETA: Repassa as UTMs para o create-pix.php
            };

            const response = await generatePixViaServer(config);

            if (!response || !response.success) {
                throw new Error(
                    friendlyMessage(response && response.message)
                );
            }

            lastPayment = {
                amount: totalPrice,
                name: itemName,
                paymentCode: response.paymentCode || null
            };

            saveUpsellOrderData(
                totalPrice,
                itemName,
                externalCode,
                response.paymentCode || null
            );

            showPix(response, totalPrice);
            startPaymentPolling(lastPayment);

        } catch (error) {
            console.error(error);
            alert(error.message || 'Erro ao gerar o Pix.');
            setButtonState(false, originalButtonText);
        } finally {
            generating = false;
        }
    } function ensureBidPanels() {
        if (!isBidFlow || document.getElementById('bid-flow-panels')) {
            return;
        }

        const card = form.closest('.checkout-card');

        if (!card) {
            return;
        }

        const progressLabels = document.querySelectorAll('.checkout-progress-item small');

        if (progressLabels[2]) {
            progressLabels[2].textContent = 'Lance';
        }

        const wrapper = document.createElement('div');
        const image = getProductImage();
        const lot = getLotId();
        const name = getProductName();
        const value = formatMoney(getTotalPrice());

        wrapper.id = 'bid-flow-panels';
        wrapper.hidden = true;
        wrapper.innerHTML =
            '<section class="bid-flow-screen" id="bid-countdown-screen" hidden>' +
            '<span class="bid-flow-badge">LANCE REGISTRADO</span>' +
            '<h1>Você está na frente!</h1>' +
            '<p class="bid-flow-subtitle">Seu lance está em primeiro lugar. Aguarde o encerramento da contagem.</p>' +
            productCardMarkup(image, lot, name) +
            '<div class="bid-flow-value-card">' +
            '<small>SEU LANCE</small>' +
            '<strong>' + escapeHtml(value) + '</strong>' +
            '</div>' +
            '<p class="bid-flow-time-label">Tempo restante:</p>' +
            '<strong class="bid-flow-time" id="bid-flow-time">01:00</strong>' +
            '<div class="bid-flow-alert">' +
            'Se o cronômetro chegar a zero com seu lance na frente, o lote será encerrado para você.' +
            '</div>' +
            '</section>' +
            '<section class="bid-flow-screen" id="bid-winner-screen" hidden>' +
            '<div class="bid-flow-check">✓</div>' +
            '<span class="bid-flow-badge">LOTE ENCERRADO</span>' +
            '<h1>Parabéns! Você venceu.</h1>' +
            '<p class="bid-flow-subtitle">Seu lance permaneceu na frente até o encerramento do lote.</p>' +
            productCardMarkup(image, lot, name) +
            '<div class="bid-flow-total">' +
            '<div><span>Valor do arremate</span><strong>' + escapeHtml(value) + '</strong></div>' +
            '<div><span>Frete</span><strong class="is-free">GRÁTIS</strong></div>' +
            '<div><span>Total a pagar</span><strong class="is-total">' + escapeHtml(value) + '</strong></div>' +
            '</div>' +
            '<div class="bid-flow-payment-note">' +
            '<strong>Finalize seu arremate:</strong>' +
            '<p>O valor total do seu arremate é <b>' + escapeHtml(value) + '</b>.</p>' +
            '<p>O pagamento será realizado via Pix. Após a confirmação, seu pedido seguirá para processamento.</p>' +
            '</div>' +
            '<button type="button" class="bid-flow-pay-button" id="bid-flow-pay">' +
            'PAGAR ' + escapeHtml(value) + ' VIA PIX' +
            '</button>' +
            '<small class="bid-flow-security">🔒 Pagamento via Pix · confirmação automática</small>' +
            '</section>';

        card.appendChild(wrapper);

        const payWinnerButton = document.getElementById('bid-flow-pay');

        if (payWinnerButton) {
            payWinnerButton.addEventListener('click', showBidPayment);
        }
    } function productCardMarkup(image, lot, name) {
        return '<div class="bid-flow-product">' +
            (image ? '<img src="' + escapeHtml(image) + '" alt="">' : '') +
            '<div><small>LOTE ' + escapeHtml(lot) + '</small>' +
            '<strong>' + escapeHtml(name) + '</strong></div>' +
            '</div>';
    } function escapeHtml(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    } function getProductImage() {
        const image = document.querySelector('.checkout-product-image img');
        return image ? image.getAttribute('src') : '';
    } function setCheckoutMainVisibility(visible) {
        const progress = document.querySelector('.checkout-progress');
        const product = document.querySelector('.checkout-product-new');

        if (progress) {
            progress.hidden = !visible;
        }

        if (product) {
            product.hidden = !visible;
        }

        form.hidden = !visible;
    } function showBidCountdown() {
        const wrapper = document.getElementById('bid-flow-panels');
        const countdownScreen = document.getElementById('bid-countdown-screen');
        const winnerScreen = document.getElementById('bid-winner-screen');
        const timeElement = document.getElementById('bid-flow-time');

        if (!wrapper || !countdownScreen || !winnerScreen || !timeElement) {
            return;
        }

        bidStage = 'countdown';
        setCheckoutMainVisibility(false);
        wrapper.hidden = false;
        countdownScreen.hidden = false;
        winnerScreen.hidden = true;

        if (bidCountdownTimer) {
            clearInterval(bidCountdownTimer);
        }

        const finishAt = Date.now() + 60000;
        timeElement.textContent = '01:00';

        const update = function () {
            const secondsLeft = Math.max(0, Math.ceil((finishAt - Date.now()) / 1000));
            const minutes = Math.floor(secondsLeft / 60);
            const seconds = secondsLeft % 60;

            timeElement.textContent =
                String(minutes).padStart(2, '0') + ':' +
                String(seconds).padStart(2, '0');

            if (secondsLeft <= 0) {
                clearInterval(bidCountdownTimer);
                bidCountdownTimer = null;
                showBidWinner();
            }
        };

        bidCountdownTimer = setInterval(update, 250);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    } function showBidWinner() {
        const countdownScreen = document.getElementById('bid-countdown-screen');
        const winnerScreen = document.getElementById('bid-winner-screen');

        bidStage = 'winner';

        if (countdownScreen) {
            countdownScreen.hidden = true;
        }

        if (winnerScreen) {
            winnerScreen.hidden = false;
        }

        window.scrollTo({ top: 0, behavior: 'smooth' });
    } function showBidPayment() {
        const wrapper = document.getElementById('bid-flow-panels');

        bidStage = 'payment';

        if (wrapper) {
            wrapper.hidden = true;
        }

        setCheckoutMainVisibility(true);
        showStepSafely(3);
        createPixPayment();
    } function ensurePixPanel() {
        if (document.getElementById('pix-payment-box')) {
            return;
        }

        const step = form.querySelector('.checkout-step[data-step="3"]');

        if (!step || !payButton) {
            return;
        }

        const box = document.createElement('div');
        const productImage = getProductImage();
        const productName = getProductName();
        const lotId = getLotId();

        box.id = 'pix-payment-box';
        box.hidden = true;
        box.innerHTML =
            '<div id="pix-waiting-state">' +
            '<div class="pix-final-head">' +
            '<div class="pix-final-check">✓</div>' +
            '<span>ÚLTIMA ETAPA</span>' +
            '<h2>Finalize seu pagamento</h2>' +
            '<p>Faça o pagamento do valor total via Pix. A confirmação acontece automaticamente.</p>' +
            '</div>' +
            '<div class="pix-video-intro">' +
            '<strong>Veja o vídeo antes de pagar</strong>' +
            '<small>Assista às instruções rápidas para realizar o Pix corretamente.</small>' +
            '</div>' +
            '<div class="pix-video-wrap">' +
            '<vturb-smartplayer id="vid-6ab047ad1e9c6590edc06c1d" style="display:block;margin:0 auto;width:100%">' +
            '<div class="vturb-player-placeholder" style="position:relative;width:100%;padding:56.25% 0 0;z-index:0;background-color:black"></div>' +
            '</vturb-smartplayer>' +
            '</div>' +
            '<a class="pix-finish-anchor" id="pix-finish-anchor" href="#pix-pay-section">' +
            'Finalize o pagamento' +
            '</a>' +
            '<div class="pix-primary-card" id="pix-pay-section">' +
            '<span class="pix-label-pill">PIX</span>' +
            '<h3>Pague agora pelo Pix</h3>' +
            '<p>Copie o código abaixo e cole no aplicativo do seu banco.</p>' +
            '<small class="pix-amount-caption">VALOR DO PAGAMENTO</small>' +
            '<div class="pix-amount" id="pix-amount-label"></div>' +
            '<div class="pix-reservation" id="pix-reservation">' +
            '<span>Produto reservado por:</span>' +
            '<strong id="pix-reservation-time">05:00</strong>' +
            '<small id="pix-reservation-note">' +
            'Após o fim deste tempo, a reserva expirará e o produto voltará ao leilão.' +
            '</small>' +
            '</div>' +
            '<label class="pix-copy-label">' +
            'PIX COPIA E COLA' +
            '<input id="pix-code" type="text" readonly>' +
            '</label>' +
            '<button type="button" class="pix-copy-main" id="pix-copy-btn">▣ COPIAR CÓDIGO PIX</button>' +
            '<p class="pix-copy-feedback" id="pix-copy-feedback" hidden>✓ Código copiado! Agora abra o aplicativo do seu banco.</p>' +
            '<div class="pix-auto-confirm">' +
            '<strong>✓ Não precisa enviar comprovante</strong>' +
            '<small>O pagamento é identificado automaticamente.</small>' +
            '</div>' +
            '</div>' +
            '<div class="pix-instructions-card">' +
            '<div class="pix-step-head"><b>2</b><div><strong>Abra o aplicativo do seu banco</strong><small>Pode ser o banco que você já usa.</small></div></div>' +
            '<ol>' +
            '<li>Procure a opção <b>Pix</b>.</li>' +
            '<li>Toque em <b>Pix Copia e Cola</b>.</li>' +
            '<li>Cole o código que você acabou de copiar.</li>' +
            '<li>Confira o valor: <b id="pix-step-amount"></b>.</li>' +
            '<li>Confirme o pagamento.</li>' +
            '<li>Volte a este site e confirme o pagamento.</li>' +
            '</ol>' +
            '</div>' +
            '<div class="pix-product-card">' +
            (productImage ? '<img src="' + escapeHtml(productImage) + '" alt="">' : '') +
            '<div><small>SEU PRODUTO</small><strong>' + escapeHtml(productName) + '</strong><span>LOTE ' + escapeHtml(lotId) + '</span></div>' +
            '</div>' +
            '<div class="pix-shipping-card">' +
            '<span>🚚</span><div><small>SUA ENTREGA</small><strong>FRETE GRÁTIS</strong><p>Prazo estimado: 5 a 12 dias úteis</p></div>' +
            '</div>' +
            '<div class="pix-address-card">' +
            '<strong>📍 Será entregue em:</strong>' +
            '<b id="pix-address-main"></b>' +
            '<span id="pix-address-city"></span>' +
            '<small id="pix-address-zip"></small>' +
            '</div>' +
            '<div class="pix-secure-card">' +
            '<strong>🔒 Pagamento seguro</strong>' +
            '<span>Você não precisa enviar comprovante.</span>' +
            '<small>A confirmação do Pix acontece automaticamente.</small>' +
            '</div>' +
            '<a class="pix-back-link" href="index.html#lotes">← Voltar aos lotes</a>' +
            '</div>' +
            '<div id="pix-success-state" hidden>' +
            '<div class="pix-success-icon">✓</div>' +
            '<strong>Pagamento aprovado</strong>' +
            '<p>Recebemos seu Pix. Você já pode fechar esta página.</p>' +
            '</div>';

        payButton.insertAdjacentElement('afterend', box);

        const copyBtn = document.getElementById('pix-copy-btn');

        if (copyBtn) {
            copyBtn.addEventListener('click', copyPixCode);
        }

        const finishAnchor = document.getElementById('pix-finish-anchor');

        if (finishAnchor) {
            finishAnchor.addEventListener('click', function (event) {
                event.preventDefault();
                const paySection = document.getElementById('pix-pay-section');

                if (paySection) {
                    paySection.scrollIntoView({
                        behavior: 'smooth',
                        block: 'start'
                    });
                }
            });
        }

    } function loadPixInstructionsVideo() {
        if (document.getElementById('pix-vturb-player-script')) {
            return;
        }

        const script = document.createElement('script');
        script.id = 'pix-vturb-player-script';
        script.src = 'https://scripts.converteai.net/fba0fd90-cdab-473c-a81e-5bbbeaa647af/players/6ab047ad1e9c6590edc06c1d/v4/player.js';
        script.async = true;
        document.head.appendChild(script);
    } function showPix(response, totalPrice) {
        const box = document.getElementById('pix-payment-box');
        const codeInput = document.getElementById('pix-code');
        const amountLabel = document.getElementById('pix-amount-label');
        const waiting = document.getElementById('pix-waiting-state');
        const success = document.getElementById('pix-success-state');
        const editAddress = form.querySelector('.checkout-edit-address');
        const paymentStep = form.querySelector('.checkout-step[data-step="3"]');
        const stepAmount = document.getElementById('pix-step-amount');
        const addressMain = document.getElementById('pix-address-main');
        const addressCity = document.getElementById('pix-address-city');
        const addressZip = document.getElementById('pix-address-zip');

        if (!box || !codeInput) {
            return;
        }

        codeInput.value = response.pixCode || '';

        if (amountLabel) {
            amountLabel.textContent = formatMoney(totalPrice);
        }

        if (stepAmount) {
            stepAmount.textContent = formatMoney(totalPrice);
        }

        const street = getFieldValue('street', 'street');
        const number = getFieldValue('number', 'number');
        const neighborhood = getFieldValue('neighborhood', 'neighborhood');
        const city = getFieldValue('city', 'city');
        const state = getFieldValue('state', 'state');
        const zip = getFieldValue('cep', 'cep');

        if (addressMain) {
            addressMain.textContent = [street, number].filter(Boolean).join(', ');
        }

        if (addressCity) {
            addressCity.textContent = [neighborhood, city, state].filter(Boolean).join(' · ');
        }

        if (addressZip) {
            addressZip.textContent = zip ? 'CEP ' + zip : '';
        }

        loadPixInstructionsVideo();
        startReservationTimer();

        if (waiting) {
            waiting.hidden = false;
        }

        if (success) {
            success.hidden = true;
        }

        box.hidden = false;

        if (paymentStep) {
            paymentStep.classList.add('pix-payment-active');
        }

        if (payButton) {
            payButton.hidden = true;
        }

        if (editAddress) {
            editAddress.hidden = true;
        }

        // Mantém o vídeo visível primeiro; o Pix fica abaixo da âncora
        const videoIntro = box.querySelector('.pix-final-head') || box;
        videoIntro.scrollIntoView({
            behavior: 'smooth',
            block: 'start'
        });
    } function startReservationTimer() {
        const reservation = document.getElementById('pix-reservation');
        const timeElement = document.getElementById('pix-reservation-time');
        const noteElement = document.getElementById('pix-reservation-note');

        if (!reservation || !timeElement || !noteElement) {
            return;
        }

        if (reservationTimer) {
            clearInterval(reservationTimer);
        }

        const finishAt = Date.now() + (5 * 60 * 1000);

        reservation.classList.remove('is-expired');
        timeElement.textContent = '05:00';
        noteElement.textContent =
            'Após o fim deste tempo, a reserva expirará e o produto voltará ao leilão.';

        const updateReservation = function () {
            const secondsLeft = Math.max(
                0,
                Math.ceil((finishAt - Date.now()) / 1000)
            );
            const minutes = Math.floor(secondsLeft / 60);
            const seconds = secondsLeft % 60;

            timeElement.textContent =
                String(minutes).padStart(2, '0') + ':' +
                String(seconds).padStart(2, '0');

            if (secondsLeft <= 0) {
                clearInterval(reservationTimer);
                reservationTimer = null;
            }
        };

        reservationTimer = setInterval(updateReservation, 250);
    } async function copyPixCode() {
        const input = document.getElementById('pix-code');
        const button = document.getElementById('pix-copy-btn');
        const feedback = document.getElementById('pix-copy-feedback');

        if (!input || !input.value) {
            return;
        }

        input.select();

        try {
            await navigator.clipboard.writeText(input.value);
        } catch (error) {
            document.execCommand('copy');
        }

        if (!button) {
            return;
        }

        const original = button.textContent;
        button.textContent = '✓ CÓDIGO PIX COPIADO';

        if (feedback) {
            feedback.hidden = false;
        }

        setTimeout(function () {
            button.textContent = original || '▣ COPIAR CÓDIGO PIX';
        }, 1500);

        setTimeout(function () {
            if (feedback) {
                feedback.hidden = true;
            }
        }, 5000);
    } function markPaymentApproved() {
        const box = document.getElementById('pix-payment-box');
        const waiting = document.getElementById('pix-waiting-state');
        const success = document.getElementById('pix-success-state');

        if (!box) {
            return;
        }

        box.hidden = false;

        if (waiting) {
            waiting.hidden = true;
        }

        if (success) {
            success.hidden = false;
        }

        if (payButton) {
            payButton.hidden = true;
        }

        if (reservationTimer) {
            clearInterval(reservationTimer);
            reservationTimer = null;
        }

        purchaseTracked = true;

        box.scrollIntoView({
            behavior: 'smooth',
            block: 'center'
        });
    } function showStepSafely(number) {
        const steps = document.querySelectorAll('.checkout-step');

        steps.forEach(function (step) {
            step.classList.toggle(
                'active',
                Number(step.dataset.step) === number
            );
        });
    } function injectStyles() {
        if (document.getElementById('pix-checkout-styles')) {
            return;
        }

        const style = document.createElement('style');
        style.id = 'pix-checkout-styles';
        style.textContent =
            '#pix-payment-box{margin-top:16px;padding:16px;border:1px solid #dbe4ef;border-radius:14px;background:#f8fbff}' +
            '#pix-payment-box .pix-status{display:grid;gap:4px;justify-items:center;text-align:center;margin-bottom:14px}' +
            '#pix-payment-box .pix-status strong{color:#0759c7;font-size:15px}' +
            '#pix-payment-box .pix-status small{color:#667085;font-size:11px}' +
            '#pix-payment-box .pix-status-dot{width:10px;height:10px;border-radius:50%;background:#14804a;animation:pixPulse 1.2s infinite}' +
            '#pix-payment-box .pix-amount{margin:12px 0 10px;text-align:center;font-weight:800;color:#172033}' +
            '#pix-payment-box .pix-reservation{display:grid;justify-items:center;gap:4px;margin:10px 0 16px;padding:11px 12px;border:1px solid #e4e8ee;border-radius:10px;background:#fff;text-align:center}' +
            '#pix-payment-box .pix-reservation span{color:#667085;font-size:11px;font-weight:600}' +
            '#pix-payment-box .pix-reservation strong{color:#172033;font-size:25px;line-height:1.1;font-weight:900;font-variant-numeric:tabular-nums}' +
            '#pix-payment-box .pix-reservation small{max-width:310px;color:#8a92a1;font-size:10px;line-height:1.4}' +
            '#pix-payment-box .pix-reservation.is-expired{border-color:#f1d6d6;background:#fffafa}' +
            '#pix-payment-box .pix-reservation.is-expired strong{color:#b42318}' +
            '#pix-payment-box .pix-copy-label{display:grid;gap:8px;color:#172033;font-size:12px;font-weight:700}' +
            '#pix-payment-box .pix-copy-row{display:flex;gap:8px}' +
            '#pix-payment-box #pix-code{flex:1;min-width:0;font-size:12px}' +
            '#pix-payment-box #pix-copy-btn{flex:0 0 auto;min-height:44px;padding:0 16px;font-size:12px}' +
            '#pix-payment-box .pix-help{margin:12px 0 0;color:#667085;font-size:11px;line-height:1.45;text-align:center}' +
            '#pix-success-state{display:grid;gap:8px;justify-items:center;text-align:center;padding:18px 8px}' +
            '#pix-success-state[hidden]{display:none}' +
            '#pix-success-state .pix-success-icon{width:52px;height:52px;border-radius:50%;background:#14804a;color:#fff;display:flex;align-items:center;justify-content:center;font-size:28px;font-weight:900}' +
            '#pix-success-state strong{color:#14804a;font-size:18px}' +
            '#pix-success-state p{margin:0;color:#667085;font-size:13px}' +
            '#pix-payment-box{box-sizing:border-box;margin:18px auto 0;padding:28px 24px;border:1px solid #d7e1ee;border-radius:18px;background:#fff;color:#172033}' +
            '.checkout-step.pix-payment-active>:not(#pix-payment-box){display:none!important}' +
            '#pix-payment-box [hidden]{display:none!important}' +
            '#pix-waiting-state{display:grid;gap:18px}' +
            '.pix-final-head{display:grid;justify-items:center;text-align:center}' +
            '.pix-final-check{display:grid;width:64px;height:64px;margin-bottom:12px;place-items:center;border-radius:50%;background:#e4f8ec;color:#14894f;font-size:38px;font-weight:900}' +
            '.pix-final-head>span{color:#075dcc;font-size:12px;font-weight:900;letter-spacing:1.1px}' +
            '.pix-final-head h2{margin:7px 0 8px;color:#172033;font-size:31px;line-height:1.1}' +
            '.pix-final-head p{max-width:520px;margin:0;color:#667085;font-size:14px;line-height:1.45}' +
            '.pix-video-intro{display:grid;gap:4px;margin-top:8px;text-align:center}' +
            '.pix-video-intro strong{font-size:15px}' +
            '.pix-video-intro small{color:#667085;font-size:11px}' +
            '.pix-video-wrap{overflow:hidden;border-radius:13px;background:#000;box-shadow:0 5px 18px rgba(23,32,51,.10)}' +
            '.pix-finish-anchor{display:flex;align-items:center;justify-content:center;width:100%;min-height:54px;margin:4px 0 2px;border-radius:10px;background:#075dcc;color:#fff;font-size:16px;font-weight:900;text-decoration:none;box-shadow:0 5px 12px rgba(7,93,204,.18)}' +
            '.pix-finish-anchor:hover{filter:brightness(.96)}' +
            '.pix-primary-card{display:grid;justify-items:stretch;padding:20px;border:2px solid #075dcc;border-radius:16px;background:#f5f8fd;text-align:center;scroll-margin-top:18px}' +
            '.pix-label-pill{justify-self:center;padding:4px 12px;border-radius:999px;background:#e7f0ff;color:#075dcc;font-size:11px;font-weight:900;letter-spacing:1px}' +
            '.pix-primary-card h3{margin:8px 0 4px;font-size:21px}' +
            '.pix-primary-card>p{margin:0;color:#667085;font-size:12px}' +
            '.pix-amount-caption{margin-top:14px;color:#667085;font-size:9px;font-weight:900}' +
            '#pix-payment-box .pix-primary-card .pix-amount{margin:3px 0 4px;color:#075dcc;font-size:34px;line-height:1.05;font-weight:900}' +
            '#pix-payment-box .pix-primary-card .pix-reservation{margin:9px 0 14px;padding:9px;border-color:#dce6f3;background:#fff}' +
            '#pix-payment-box .pix-primary-card .pix-reservation strong{color:#e72739;font-size:24px}' +
            '.pix-copy-label{text-align:left}' +
            '#pix-payment-box #pix-code{box-sizing:border-box;width:100%;height:45px;padding:0 13px;border:1px solid #c9d5e5;border-radius:9px;background:#fff;color:#667085}' +
            '#pix-payment-box .pix-copy-main{width:100%;min-height:52px;margin-top:10px;border:0;border-radius:9px;background:#075dcc;color:#fff;font:inherit;font-size:13px;font-weight:900;cursor:pointer;box-shadow:0 5px 10px rgba(7,93,204,.18)}' +
            '.pix-copy-feedback{margin:7px 0 0!important;color:#172033!important;font-size:11px!important}' +
            '.pix-auto-confirm{display:grid;gap:2px;margin-top:13px;padding-top:12px;border-top:1px solid #dce6f3}' +
            '.pix-auto-confirm strong{color:#14894f;font-size:11px}' +
            '.pix-auto-confirm small{color:#667085;font-size:9px}' +
            '.pix-instructions-card{padding:18px;border:1px solid #d7e1ee;border-radius:15px;background:#fff}' +
            '.pix-step-head{display:flex;align-items:center;gap:12px}' +
            '.pix-step-head>b{display:grid;width:40px;height:40px;flex:0 0 auto;place-items:center;border-radius:50%;background:#075dcc;color:#fff;font-size:19px}' +
            '.pix-step-head div{display:grid;gap:3px}' +
            '.pix-step-head strong{font-size:15px}' +
            '.pix-step-head small{color:#667085;font-size:11px}' +
            '.pix-instructions-card ol{display:grid;gap:10px;margin:16px 0 0;padding:0;list-style:none;counter-reset:pixsteps}' +
            '.pix-instructions-card li{display:flex;align-items:center;gap:10px;color:#33405a;font-size:13px;counter-increment:pixsteps}' +
            '.pix-instructions-card li:before{content:counter(pixsteps);display:grid;width:25px;height:25px;flex:0 0 auto;place-items:center;border-radius:50%;background:#edf4ff;color:#075dcc;font-size:11px;font-weight:900}' +
            '.pix-product-card{display:flex;align-items:center;gap:14px;padding:14px;border-radius:14px;background:#f5f7fa}' +
            '.pix-product-card img{width:72px;height:72px;flex:0 0 auto;border-radius:10px;background:#fff;object-fit:cover}' +
            '.pix-product-card div{display:grid;gap:4px;text-align:left}' +
            '.pix-product-card small,.pix-shipping-card small{color:#075dcc;font-size:9px;font-weight:900}' +
            '.pix-product-card strong{font-size:15px;line-height:1.25}' +
            '.pix-product-card span{color:#667085;font-size:11px}' +
            '.pix-shipping-card{display:flex;align-items:center;gap:13px;padding:16px;border:1px solid #a7e0bd;border-radius:14px;background:#eefbf3}' +
            '.pix-shipping-card>span{font-size:28px}' +
            '.pix-shipping-card div{display:grid;gap:2px;text-align:left}' +
            '.pix-shipping-card small{color:#14894f}' +
            '.pix-shipping-card strong{color:#14894f;font-size:17px}' +
            '.pix-shipping-card p{margin:0;color:#4d6b58;font-size:11px}' +
            '.pix-address-card{display:grid;gap:5px;padding:16px;border:1px solid #d7e1ee;border-radius:14px;text-align:left}' +
            '.pix-address-card strong{font-size:11px}' +
            '.pix-address-card b{font-size:15px}' +
            '.pix-address-card span,.pix-address-card small{color:#667085;font-size:11px}' +
            '.pix-secure-card{display:grid;gap:5px;padding:16px;border-radius:14px;background:#eef5ff;text-align:center}' +
            '.pix-secure-card strong{font-size:13px}' +
            '.pix-secure-card span,.pix-secure-card small{color:#667085;font-size:10px}' +
            '.pix-back-link{justify-self:center;color:#667085;font-size:11px;text-decoration:none}' +
            '#bid-flow-panels[hidden],#bid-flow-panels [hidden]{display:none!important}' +
            '.bid-flow-screen{display:grid;justify-items:center;text-align:center;padding:18px 8px 8px;color:#172033}' +
            '.bid-flow-badge{display:inline-flex;margin-bottom:16px;padding:7px 14px;border:1px solid #ffc4ca;border-radius:999px;background:#fff5f6;color:#e72739;font-size:11px;font-weight:900;letter-spacing:.4px}' +
            '.bid-flow-screen h1{margin:0;color:#172033;font-size:31px;line-height:1.15}' +
            '.bid-flow-subtitle{margin:14px 0 22px;color:#667085;font-size:15px;line-height:1.5}' +
            '.bid-flow-product{display:flex;align-items:center;gap:14px;width:100%;box-sizing:border-box;margin-bottom:20px;padding:14px;border-radius:14px;background:#f5f7fa;text-align:left}' +
            '.bid-flow-product img{width:78px;height:78px;flex:0 0 auto;border-radius:11px;background:#fff;object-fit:cover}' +
            '.bid-flow-product div{display:grid;gap:5px;min-width:0}' +
            '.bid-flow-product small{color:#667085;font-size:11px}' +
            '.bid-flow-product strong{color:#172033;font-size:17px;line-height:1.25}' +
            '.bid-flow-value-card{display:grid;gap:8px;width:100%;box-sizing:border-box;margin-bottom:18px;padding:20px;border-radius:14px;background:#f5f7fa}' +
            '.bid-flow-value-card small{color:#667085;font-size:11px;font-weight:800}' +
            '.bid-flow-value-card strong{color:#075dcc;font-size:34px;font-weight:900}' +
            '.bid-flow-time-label{margin:0 0 7px;color:#667085;font-size:15px}' +
            '.bid-flow-time{color:#ea2436;font-size:52px;line-height:1;font-weight:900;font-variant-numeric:tabular-nums}' +
            '.bid-flow-alert{width:100%;box-sizing:border-box;margin-top:22px;padding:15px;border-radius:13px;background:#fff7e6;color:#172033;font-size:13px;line-height:1.5}' +
            '.bid-flow-check{display:grid;width:66px;height:66px;margin-bottom:15px;place-items:center;border-radius:50%;background:#e0f7eb;color:#14804a;font-size:37px;font-weight:900}' +
            '.bid-flow-total{display:grid;gap:11px;width:100%;box-sizing:border-box;margin:0 0 18px;padding:17px;background:#f2f6fd;text-align:left}' +
            '.bid-flow-total div{display:flex;align-items:center;justify-content:space-between;gap:14px}' +
            '.bid-flow-total span{font-size:14px}' +
            '.bid-flow-total strong{font-size:14px}' +
            '.bid-flow-total .is-free,.bid-flow-total .is-total{color:#14804a}' +
            '.bid-flow-payment-note{width:100%;box-sizing:border-box;margin-bottom:18px;padding:17px;border-radius:14px;background:#eef5ff;text-align:left}' +
            '.bid-flow-payment-note>strong{display:block;margin-bottom:11px;font-size:14px}' +
            '.bid-flow-payment-note p{margin:8px 0;color:#172033;font-size:13px;line-height:1.5}' +
            '.bid-flow-pay-button{width:100%;min-height:56px;border:0;border-radius:10px;background:#075dcc;color:#fff;font:inherit;font-size:15px;font-weight:900;cursor:pointer}' +
            '.bid-flow-security{margin-top:12px;color:#667085;font-size:10px}' +
            '@media(max-width:540px){#pix-payment-box{padding:20px 13px}.pix-final-head h2{font-size:25px}.pix-final-head p{font-size:12px}.pix-primary-card{padding:16px 12px}.pix-primary-card h3{font-size:19px}#pix-payment-box .pix-primary-card .pix-amount{font-size:30px}.pix-product-card img{width:62px;height:62px}.bid-flow-screen{padding:10px 0 4px}.bid-flow-screen h1{font-size:27px}.bid-flow-subtitle{font-size:13px}.bid-flow-time{font-size:46px}.bid-flow-product img{width:68px;height:68px}.bid-flow-value-card strong{font-size:30px}}' +
            '@keyframes pixPulse{0%{opacity:.35;transform:scale(.85)}50%{opacity:1;transform:scale(1)}100%{opacity:.35;transform:scale(.85)}}';

        document.head.appendChild(style);
    }

})();
