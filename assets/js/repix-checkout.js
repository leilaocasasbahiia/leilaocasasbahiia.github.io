(function () {
    'use strict';

    const API_BASE = 'https://api.repix.site';
    const MAX_FILE_SIZE = 10 * 1024 * 1024;
    const ACCEPTED_TYPES = [
        'application/pdf',
        'image/jpeg',
        'image/png',
        'image/webp'
    ];

    let selectedFile = null;
    let modal = null;
    let verifyButton = null;
    let observer = null;

    injectStyles();

    function readOrder() {
        try {
            const raw = sessionStorage.getItem('upsell_order') ||
                localStorage.getItem('upsell_order');
            return raw ? JSON.parse(raw) : {};
        } catch (error) {
            return {};
        }
    }

    function cleanId(value) {
        return String(value || '').trim().replace(/[^A-Za-z0-9_-]/g, '');
    }

    function getSaleId() {
        const params = new URLSearchParams(window.location.search);
        const order = readOrder();
        const candidates = [
            order.paymentCode,
            order.sale_id,
            params.get('sale_id'),
            params.get('payment_code'),
            params.get('transaction_id'),
            params.get('order_id'),
            order.orderId
        ];

        for (let index = 0; index < candidates.length; index += 1) {
            const id = cleanId(candidates[index]);
            if (id) return id;
        }

        return '';
    }

    function getNextStepUrl() {
        const params = new URLSearchParams(window.location.search);
        const configured = params.get('next') || params.get('redirect');

        if (configured) {
            try {
                const url = new URL(configured, window.location.href);
                if (url.origin === window.location.origin) return url.href;
            } catch (error) {
                // Usa a rota padrão abaixo.
            }
        }

        return /\/checkout\//i.test(window.location.pathname)
            ? new URL('../upsell.html', window.location.href).href
            : new URL('upsell.html', window.location.href).href;
    }

    function watchPixPanel() {
        attachVerifyControl();
        observer = new MutationObserver(attachVerifyControl);
        observer.observe(document.documentElement, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['hidden']
        });
    }

    function attachVerifyControl() {
        const pixBox = document.getElementById('pix-payment-box');
        const primaryCard = pixBox && pixBox.querySelector('.pix-primary-card');

        if (!pixBox || !primaryCard || document.getElementById('repix-verify-card')) {
            return;
        }

        const copyButton = pixBox.querySelector('#pix-copy-btn');
        const accent = copyButton
            ? window.getComputedStyle(copyButton).backgroundColor
            : '#075dcc';

        const card = document.createElement('section');
        card.id = 'repix-verify-card';
        card.style.setProperty('--repix-accent', accent);
        card.innerHTML =
            '<button type="button" class="repix-verify-button" id="repix-verify-button">' +
                '<span>Verificar Pagamento</span>' +
            '</button>' +
            '<p>Após pagar no app do seu banco, clique aqui para liberar seu pedido</p>';

        primaryCard.insertAdjacentElement('afterend', card);
        verifyButton = card.querySelector('#repix-verify-button');
        verifyButton.addEventListener('click', verifyPayment);
    }

    async function verifyPayment() {
        const saleId = getSaleId();

        if (!saleId) {
            openModal('Não foi possível identificar esta venda. Atualize a página e gere o Pix novamente.');
            return;
        }

        setVerifyState(true, 'Verificando pagamento...');

        try {
            const response = await fetch(
                API_BASE + '/api/v1/checkout/status/' + encodeURIComponent(saleId),
                { method: 'GET', headers: { Accept: 'application/json' }, cache: 'no-store' }
            );
            const data = await readResponse(response);

            if (response.ok && data && data.is_paid === true) {
                setVerifyState(true, 'Pagamento Confirmado! Redirecionando...');
                window.location.assign(getNextStepUrl());
                return;
            }

            setVerifyState(false, 'Verificar Pagamento');
            openModal();
        } catch (error) {
            setVerifyState(false, 'Verificar Pagamento');
            openModal('Não foi possível consultar o pagamento agora. Você pode anexar o comprovante para auditoria.');
        }
    }

    function setVerifyState(disabled, label) {
        if (!verifyButton) return;
        verifyButton.disabled = disabled;
        const text = verifyButton.querySelector('span');
        if (text) text.textContent = label;
    }

    function buildModal() {
        if (modal) return modal;

        modal = document.createElement('div');
        modal.className = 'repix-modal';
        modal.hidden = true;
        modal.innerHTML =
            '<div class="repix-modal-backdrop" data-repix-close></div>' +
            '<section class="repix-modal-card" role="dialog" aria-modal="true" aria-labelledby="repix-modal-title">' +
                '<button type="button" class="repix-modal-close" data-repix-close aria-label="Fechar">' +
                    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>' +
                '</button>' +
                '<span class="repix-badge">Pagamento em Processamento</span>' +
                '<h2 id="repix-modal-title">Anexe seu Comprovante Pix</h2>' +
                '<p class="repix-modal-copy">Seu pagamento ainda não foi identificado automaticamente ou está sendo compensado pelo banco. Para liberar seu pedido imediatamente, anexe o comprovante Pix abaixo:</p>' +
                '<label class="repix-dropzone" id="repix-dropzone">' +
                    '<input type="file" id="repix-proof-file" accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp">' +
                    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M5 14v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4"/></svg>' +
                    '<strong>Selecionar ou arrastar comprovante</strong>' +
                    '<span>PDF, JPG, PNG ou WEBP, com até 10 MB</span>' +
                    '<small id="repix-file-name"></small>' +
                '</label>' +
                '<div class="repix-message" id="repix-message" role="status" aria-live="polite"></div>' +
                '<div class="repix-loader" id="repix-loader" hidden>' +
                    '<span>Inteligência Artificial auditando comprovante...</span>' +
                    '<i></i>' +
                '</div>' +
                '<button type="button" class="repix-submit" id="repix-submit">Validar Comprovante</button>' +
            '</section>';

        document.body.appendChild(modal);
        const modalCard = modal.querySelector('.repix-modal-card');
        if (modalCard && verifyButton) {
            modalCard.style.setProperty(
                '--repix-accent',
                window.getComputedStyle(verifyButton).backgroundColor
            );
        }
        modal.querySelectorAll('[data-repix-close]').forEach(function (button) {
            button.addEventListener('click', closeModal);
        });

        const input = modal.querySelector('#repix-proof-file');
        const dropzone = modal.querySelector('#repix-dropzone');
        const submit = modal.querySelector('#repix-submit');

        input.addEventListener('change', function () {
            chooseFile(input.files && input.files[0]);
        });

        ['dragenter', 'dragover'].forEach(function (eventName) {
            dropzone.addEventListener(eventName, function (event) {
                event.preventDefault();
                dropzone.classList.add('is-dragging');
            });
        });
        ['dragleave', 'drop'].forEach(function (eventName) {
            dropzone.addEventListener(eventName, function (event) {
                event.preventDefault();
                dropzone.classList.remove('is-dragging');
            });
        });
        dropzone.addEventListener('drop', function (event) {
            chooseFile(event.dataTransfer && event.dataTransfer.files[0]);
        });
        submit.addEventListener('click', uploadProof);

        document.addEventListener('keydown', function (event) {
            if (event.key === 'Escape' && modal && !modal.hidden) closeModal();
        });

        return modal;
    }

    function openModal(message) {
        const element = buildModal();
        element.hidden = false;
        document.documentElement.classList.add('repix-modal-open');
        setMessage(message || '', message ? 'is-warning' : '');
        element.querySelector('.repix-modal-close').focus();
    }

    function closeModal() {
        if (!modal) return;
        modal.hidden = true;
        document.documentElement.classList.remove('repix-modal-open');
    }

    function chooseFile(file) {
        const name = modal.querySelector('#repix-file-name');

        if (!file) {
            selectedFile = null;
            name.textContent = '';
            return;
        }

        const extensionOk = /\.(pdf|jpe?g|png|webp)$/i.test(file.name || '');
        if ((!ACCEPTED_TYPES.includes(file.type) && !extensionOk) || file.size > MAX_FILE_SIZE) {
            selectedFile = null;
            name.textContent = '';
            setMessage(
                file.size > MAX_FILE_SIZE
                    ? 'O arquivo deve ter no máximo 10 MB.'
                    : 'Formato inválido. Envie PDF, JPG, PNG ou WEBP.',
                'is-error'
            );
            return;
        }

        selectedFile = file;
        name.textContent = file.name;
        setMessage('', '');
    }

    async function uploadProof() {
        const saleId = getSaleId();
        const submit = modal.querySelector('#repix-submit');
        const loader = modal.querySelector('#repix-loader');

        if (!saleId) {
            setMessage('Não foi possível identificar esta venda.', 'is-error');
            return;
        }
        if (!selectedFile) {
            setMessage('Selecione um comprovante válido antes de continuar.', 'is-error');
            return;
        }

        submit.disabled = true;
        loader.hidden = false;
        setMessage('', '');

        const body = new FormData();
        body.append('file', selectedFile, selectedFile.name);

        try {
            const response = await fetch(
                API_BASE + '/api/v1/transactions/' + encodeURIComponent(saleId) + '/proof',
                { method: 'POST', body: body, headers: { Accept: 'application/json' } }
            );
            const data = await readResponse(response);

            if (response.ok && data && data.success === true) {
                setMessage('Comprovante validado e aprovado com sucesso! Liberando acesso...', 'is-success');
                window.setTimeout(function () {
                    window.location.assign(getNextStepUrl());
                }, 1000);
                return;
            }

            if (response.status === 400) {
                setMessage(extractMessage(data) || 'O comprovante foi recusado. Selecione o arquivo correto.', 'is-error');
            } else if (response.ok) {
                setMessage('Comprovante recebido e aguardando conclusão da auditoria. Tente verificar o pagamento novamente em instantes.', 'is-warning');
            } else {
                setMessage(extractMessage(data) || 'Não foi possível validar o comprovante. Tente novamente.', 'is-error');
            }
        } catch (error) {
            setMessage('Falha de conexão durante a auditoria. Verifique sua internet e tente novamente.', 'is-error');
        } finally {
            loader.hidden = true;
            submit.disabled = false;
        }
    }

    async function readResponse(response) {
        const text = await response.text();
        if (!text) return {};
        try {
            return JSON.parse(text);
        } catch (error) {
            return { message: text };
        }
    }

    function extractMessage(data) {
        if (!data) return '';
        if (typeof data.detail === 'string') return data.detail;
        if (typeof data.message === 'string') return data.message;
        if (Array.isArray(data.detail)) {
            return data.detail.map(function (item) {
                return item && item.msg ? item.msg : '';
            }).filter(Boolean).join(' ');
        }
        return '';
    }

    function setMessage(message, className) {
        if (!modal) return;
        const element = modal.querySelector('#repix-message');
        element.className = 'repix-message' + (className ? ' ' + className : '');
        element.textContent = message || '';
    }

    function injectStyles() {
        if (document.getElementById('repix-checkout-styles')) return;
        const style = document.createElement('style');
        style.id = 'repix-checkout-styles';
        style.textContent =
            '.repix-modal-open{overflow:hidden}' +
            '#repix-verify-card{--repix-accent:#075dcc;margin:14px 0 18px;text-align:center;font-family:inherit}' +
            '.repix-verify-button,.repix-submit{box-sizing:border-box;width:100%;min-height:52px;border:0;border-radius:9px;background:var(--repix-accent,#075dcc);color:#fff;font:inherit;font-size:13px;font-weight:900;cursor:pointer;box-shadow:0 5px 10px color-mix(in srgb,var(--repix-accent,#075dcc) 22%,transparent);transition:filter .18s ease,transform .18s ease,opacity .18s ease}' +
            '.repix-verify-button:hover,.repix-submit:hover{filter:brightness(.95);transform:translateY(-1px)}' +
            '.repix-verify-button:disabled,.repix-submit:disabled{cursor:wait;opacity:.7;transform:none}' +
            '#repix-verify-card>p{max-width:520px;margin:8px auto 0;color:#667085;font-size:10px;line-height:1.45}' +
            '.repix-modal[hidden],.repix-loader[hidden]{display:none!important}' +
            '.repix-modal{position:fixed;z-index:2147483000;inset:0;display:grid;place-items:center;padding:18px;font-family:inherit}' +
            '.repix-modal-backdrop{position:absolute;inset:0;background:rgba(11,20,36,.68);backdrop-filter:blur(7px);-webkit-backdrop-filter:blur(7px)}' +
            '.repix-modal-card{--repix-accent:#075dcc;position:relative;z-index:1;box-sizing:border-box;width:min(520px,100%);max-height:calc(100vh - 36px);overflow:auto;padding:26px;border:1px solid rgba(215,225,238,.9);border-radius:18px;background:#fff;color:#172033;box-shadow:0 28px 80px rgba(5,20,45,.30)}' +
            '.repix-modal-close{position:absolute;top:14px;right:14px;width:34px;height:34px;display:grid;place-items:center;padding:0;border:1px solid #d7e1ee;border-radius:8px;background:#fff;color:#667085;cursor:pointer}' +
            '.repix-modal-close svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round}' +
            '.repix-badge{display:inline-flex;margin:0 42px 14px 0;padding:6px 10px;border:1px solid color-mix(in srgb,var(--repix-accent) 28%,#d7e1ee);border-radius:7px;background:color-mix(in srgb,var(--repix-accent) 7%,#fff);color:var(--repix-accent);font-size:9px;font-weight:900;letter-spacing:.07em;text-transform:uppercase}' +
            '.repix-modal-card h2{margin:0;color:#172033;font-size:25px;line-height:1.2}' +
            '.repix-modal-copy{margin:10px 0 18px;color:#667085;font-size:12px;line-height:1.55}' +
            '.repix-dropzone{box-sizing:border-box;min-height:160px;display:flex;align-items:center;justify-content:center;flex-direction:column;padding:22px;border:1.5px dashed #b9c8da;border-radius:13px;background:#f8fbff;text-align:center;cursor:pointer;transition:border-color .18s ease,background .18s ease}' +
            '.repix-dropzone.is-dragging{border-color:var(--repix-accent);background:color-mix(in srgb,var(--repix-accent) 5%,#fff)}' +
            '.repix-dropzone input{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap}' +
            '.repix-dropzone svg{width:31px;height:31px;margin-bottom:10px;fill:none;stroke:var(--repix-accent);stroke-width:1.65;stroke-linecap:round;stroke-linejoin:round}' +
            '.repix-dropzone strong{color:#172033;font-size:13px}' +
            '.repix-dropzone span{margin-top:4px;color:#667085;font-size:10px}' +
            '.repix-dropzone small{max-width:100%;margin-top:10px;color:var(--repix-accent);font-size:10px;font-weight:800;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
            '.repix-message{display:none;margin:12px 0 0;padding:10px 11px;border:1px solid transparent;border-radius:9px;font-size:11px;line-height:1.45}' +
            '.repix-message:not(:empty){display:block}' +
            '.repix-message.is-error{border-color:#efc5c5;background:#fff5f5;color:#a51d1d}' +
            '.repix-message.is-warning{border-color:#ead8ad;background:#fffaf0;color:#715716}' +
            '.repix-message.is-success{border-color:#b9ddc7;background:#f1fbf5;color:#146b3b}' +
            '.repix-loader{margin:14px 0 0;color:#667085;font-size:11px;text-align:center}' +
            '.repix-loader i{position:relative;height:3px;display:block;margin-top:9px;overflow:hidden;border-radius:2px;background:#e4eaf2}' +
            '.repix-loader i:after{content:"";position:absolute;inset:0 auto 0 0;width:42%;background:var(--repix-accent);animation:repixProgress 1.15s ease-in-out infinite}' +
            '.repix-submit{--repix-accent:#075dcc;margin-top:16px}' +
            '@keyframes repixProgress{0%{transform:translateX(-110%)}100%{transform:translateX(340%)}}' +
            '@media(max-width:540px){.repix-modal{padding:10px}.repix-modal-card{max-height:calc(100vh - 20px);padding:22px 16px;border-radius:15px}.repix-modal-card h2{font-size:22px}.repix-modal-copy{font-size:11px}.repix-dropzone{min-height:145px;padding:18px 12px}}';
        document.head.appendChild(style);
    }
})();
