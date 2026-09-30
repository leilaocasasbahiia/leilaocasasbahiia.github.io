(function () {
    'use strict';

    if (window.__metaFunnelLoaded) {
        return;
    }
    window.__metaFunnelLoaded = true;

    var pixelIds = [
        '2672428056549161',
        '1111426627910585',
        '1650092006738557',
        '1914250040013418'
    ];

    if (!window.fbq) {
        var fbq = window.fbq = function () {
            fbq.callMethod
                ? fbq.callMethod.apply(fbq, arguments)
                : fbq.queue.push(arguments);
        };
        window._fbq = fbq;
        fbq.push = fbq;
        fbq.loaded = true;
        fbq.version = '2.0';
        fbq.queue = [];

        var script = document.createElement('script');
        script.async = true;
        script.src = 'https://connect.facebook.net/en_US/fbevents.js';
        var firstScript = document.getElementsByTagName('script')[0];
        firstScript.parentNode.insertBefore(script, firstScript);
    }

    pixelIds.forEach(function (pixelId) {
        window.fbq('init', pixelId);
    });
    window.fbq('track', 'PageView');

    function lotId() {
        return new URLSearchParams(window.location.search).get('id') || 'produto';
    }

    function productValue() {
        var element = document.querySelector('.pay-now-value, .product-price, .lot-price');
        if (!element) {
            return 0;
        }
        var value = String(element.textContent || '')
            .replace(/[^\d,.-]/g, '')
            .replace(/\./g, '')
            .replace(',', '.');
        return Number(value) || 0;
    }

    function trackOnce(storageKey, eventName, data, options) {
        try {
            if (sessionStorage.getItem(storageKey)) {
                return;
            }
            sessionStorage.setItem(storageKey, '1');
        } catch (error) {}

        if (options) {
            window.fbq('track', eventName, data, options);
        } else {
            window.fbq('track', eventName, data);
        }
    }

    document.addEventListener('click', function (event) {
        var link = event.target.closest('a[href*="/checkout/"], a[href^="../checkout/"]');
        if (!link || window.location.pathname.indexOf('/produtos/') === -1) {
            return;
        }

        var id = lotId();
        trackOnce('meta_add_cart_' + id, 'AddToCart', {
            content_ids: [id],
            content_type: 'product',
            contents: [{ id: id, quantity: 1 }],
            value: productValue(),
            currency: 'BRL'
        });
    }, true);

    if (window.location.pathname.indexOf('/checkout/') !== -1) {
        var id = lotId();
        trackOnce('meta_checkout_' + id, 'InitiateCheckout', {
            content_ids: [id],
            content_type: 'product',
            contents: [{ id: id, quantity: 1 }],
            value: productValue(),
            currency: 'BRL'
        });
    }

    window.metaFunnelPurchase = function (details, eventId) {
        var id = details && details.contentId ? String(details.contentId) : lotId();
        var purchaseId = eventId || ('purchase_' + id + '_' + Date.now());
        trackOnce('meta_' + purchaseId, 'Purchase', {
            content_ids: [id],
            content_type: 'product',
            contents: [{ id: id, quantity: 1 }],
            num_items: 1,
            value: Number(details && details.value) || productValue(),
            currency: 'BRL'
        }, {
            eventID: purchaseId
        });
    };
})();
