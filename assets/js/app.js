/* ================================================================
   PERSISTÊNCIA DE ATRIBUIÇÃO META / UTM
================================================================ */

const ATTRIBUTION_STORAGE_KEY = 'site_attribution_v1';
const ATTRIBUTION_KEYS = [
    'src', 'sck', 'utm_source', 'utm_medium', 'utm_campaign',
    'utm_content', 'utm_term', 'fbclid'
];

const readAttributionCookie = name => {
    const prefix = `${name}=`;
    const item = document.cookie.split(';').map(part => part.trim())
        .find(part => part.indexOf(prefix) === 0);
    return item ? decodeURIComponent(item.slice(prefix.length)) : '';
};

const writeAttributionCookie = (name, value) => {
    const secure = window.location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=7776000; SameSite=Lax${secure}`;
};

const loadAttribution = () => {
    try {
        const stored = JSON.parse(localStorage.getItem(ATTRIBUTION_STORAGE_KEY) || '{}');
        return stored && typeof stored === 'object' ? stored : {};
    } catch (error) {
        return {};
    }
};

const attribution = loadAttribution();
const attributionParams = new URLSearchParams(window.location.search);

ATTRIBUTION_KEYS.forEach(key => {
    const value = attributionParams.get(key);
    if (value) attribution[key] = value.slice(0, 1000);
});

const incomingFbclid = attributionParams.get('fbclid');
if (incomingFbclid) {
    const normalizedFbclid = incomingFbclid.slice(0, 1000);
    if (attribution.fbclid !== normalizedFbclid || !attribution.fbclid_timestamp) {
        attribution.fbclid_timestamp = Date.now();
    }
    attribution.fbclid = normalizedFbclid;
}

try {
    localStorage.setItem(ATTRIBUTION_STORAGE_KEY, JSON.stringify(attribution));
} catch (error) {
    // Os cookies ainda preservam os identificadores principais.
}

let attributionFbp = readAttributionCookie('_fbp');
if (!attributionFbp) {
    let randomPart = Math.floor(Math.random() * 10000000000);
    if (window.crypto && window.crypto.getRandomValues) {
        const values = new Uint32Array(2);
        window.crypto.getRandomValues(values);
        randomPart = `${values[0]}${values[1]}`;
    }
    attributionFbp = `fb.1.${Date.now()}.${randomPart}`;
    writeAttributionCookie('_fbp', attributionFbp);
}

if (attribution.fbclid) {
    const currentFbc = readAttributionCookie('_fbc');
    const expectedSuffix = `.${attribution.fbclid}`;
    if (!currentFbc.endsWith(expectedSuffix)) {
        const clickTimestamp = Number(attribution.fbclid_timestamp) || Date.now();
        writeAttributionCookie('_fbc', `fb.1.${clickTimestamp}.${attribution.fbclid}`);
    }
}

/* ================================================================
   CRONÔMETROS DOS LOTES
================================================================ */

const TIMER_STORAGE_KEY = 'leilao_prazos_v2';
const TIMER_MINIMUM = 28 * 60 * 1000;
const TIMER_VARIATIONS = [
    43, 18, 51, 36, 27, 49, 12, 58, 33, 46
];

const auctionTimerStyle = document.createElement('style');

auctionTimerStyle.textContent = `
    .cb-card-timer {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 112px;
        padding: 5px 9px;
        border: 1px solid rgba(190, 30, 45, .22);
        border-radius: 7px;
        background: rgba(190, 30, 45, .07);
        color: #b51f2e !important;
        font-weight: 800;
        font-variant-numeric: tabular-nums;
        letter-spacing: .1px;
    }
`;

document.head.appendChild(auctionTimerStyle);

const loadTimerDeadlines = () => {
    try {
        return JSON.parse(localStorage.getItem(TIMER_STORAGE_KEY)) || {};
    } catch (error) {
        return {};
    }
};

const timerDeadlines = loadTimerDeadlines();

const saveTimerDeadlines = () => {
    try {
        localStorage.setItem(TIMER_STORAGE_KEY, JSON.stringify(timerDeadlines));
    } catch (error) {
        // O cronômetro continua funcionando mesmo com o armazenamento bloqueado.
    }
};

const createDeadline = index => {
    const variation = TIMER_VARIATIONS[index % TIMER_VARIATIONS.length];
    const extra = variation * 1000;

    return Date.now() + TIMER_MINIMUM + extra;
};

document.querySelectorAll('[data-end]').forEach((el, index) => {

    const timerId = `lote-${index}`;
    let end = Number(timerDeadlines[timerId]);

    if (!Number.isFinite(end) || end <= Date.now()) {
        end = createDeadline(index);
        timerDeadlines[timerId] = end;
        saveTimerDeadlines();
    }

    const tick = () => {

        let left = end - Date.now();

        // Ao concluir um ciclo, inicia outro automaticamente. Assim, o card
        // nunca exibe zero, "Encerrado" ou "Esgotado".
        if (left <= 0) {
            end = createDeadline(index);
            timerDeadlines[timerId] = end;
            saveTimerDeadlines();
            left = end - Date.now();
        }

        const m = Math.floor(
            left / 60000
        );

        const s = Math.floor(
            (left % 60000) / 1000
        );

        el.textContent = `⏱ ${m} min ${String(s).padStart(2, '0')} s`;
    };

    tick();

    setInterval(
        tick,
        1000
    );
});
/* ================================================================
   BOTÕES GENÉRICOS DE COPIAR
================================================================ */

document.querySelectorAll('[data-copy]').forEach(btn => {

    btn.addEventListener('click', async () => {

        const input = document.getElementById(
            btn.dataset.copy
        );

        if (!input) {
            return;
        }

        input.select();

        try {

            await navigator.clipboard.writeText(
                input.value
            );

        } catch (error) {

            document.execCommand('copy');
        }

        const originalText =
            btn.textContent;

        btn.textContent =
            'Copiado ✓';

        setTimeout(
            () => {

                btn.textContent =
                    originalText || 'Copiar';

            },
            1500
        );

    });

});
/* ================================================================
   LANCES DEMO
================================================================ */

document.querySelectorAll('[data-demo-lot]').forEach(box => {

    const lotId =
        box.dataset.demoLot;

    const valueElement =
        box.querySelector(
            '[data-demo-value]'
        );

    const nameElement =
        box.querySelector(
            '[data-demo-name]'
        );

    const nextElement =
        box.querySelector(
            '[data-demo-next]'
        );

    const action =
        document.querySelector(
            '[data-demo-action]'
        );

    let lastValue = '';

    const refresh = async () => {

        try {

            const response = await fetch(
                `demo_bid.php?id=${encodeURIComponent(lotId)}&_=${Date.now()}`, {
                    cache: 'no-store',
                    credentials: 'same-origin'
                }
            );

            if (!response.ok) {
                return;
            }

            const data =
                await response.json();

            /*
            |--------------------------------------------------------------------------
            | SEM VALOR = NÃO FAZ NADA
            |--------------------------------------------------------------------------
            */

            if (!data.value) {
                return;
            }

            /*
            |--------------------------------------------------------------------------
            | ATUALIZA VALOR
            |--------------------------------------------------------------------------
            */

            if (valueElement) {

                valueElement.textContent =
                    data.value;

                /*
                |--------------------------------------------------------------------------
                | PEQUENO EFEITO QUANDO O LANCE MUDA
                |--------------------------------------------------------------------------
                */

                if (
                    lastValue &&
                    lastValue !== data.value
                ) {

                    valueElement.style.transform =
                        'scale(1.05)';

                    valueElement.style.transition =
                        'transform .18s ease';

                    setTimeout(
                        () => {

                            valueElement.style.transform =
                                'scale(1)';

                        },
                        180
                    );
                }

                lastValue =
                    data.value;
            }

            /*
            |--------------------------------------------------------------------------
            | USUÁRIO JÁ DEU LANCE
            |--------------------------------------------------------------------------
            |
            | Nesse caso o demo_bid.php pausa os lances simulados.
            |
            */

            if (data.user_bid === true) {

                if (nameElement) {

                    nameElement.textContent =
                        'Você';

                }

                /*
                |--------------------------------------------------------------------------
                | AINDA ESTÁ AGUARDANDO O ENCERRAMENTO
                |--------------------------------------------------------------------------
                */

                if (
                    data.won !== true
                ) {

                    if (action) {

                        action.textContent =
                            'Seu lance está na frente';

                        action.style.pointerEvents =
                            'none';

                        action.style.opacity =
                            '.75';

                    }

                    if (nextElement) {

                        nextElement.textContent =
                            data.value;

                    }

                }

                /*
                |--------------------------------------------------------------------------
                | VENCEU
                |--------------------------------------------------------------------------
                */

                if (data.won === true) {

                    if (action) {

                        action.textContent =
                            'Você venceu este lote ✓';

                        action.href =
                            `confirmacao.php?id=${encodeURIComponent(lotId)}&type=bid`;

                        action.style.pointerEvents =
                            'auto';

                        action.style.opacity =
                            '1';

                    }

                    if (nextElement) {

                        nextElement.textContent =
                            'Lote encerrado';

                    }

                }

                return;
            }

            /*
            |--------------------------------------------------------------------------
            | LANCE DEMO NORMAL
            |--------------------------------------------------------------------------
            */

            if (
                nameElement &&
                data.name
            ) {

                nameElement.textContent =
                    data.name;

            }

            /*
            |--------------------------------------------------------------------------
            | PRÓXIMO LANCE
            |--------------------------------------------------------------------------
            */

            if (
                nextElement &&
                data.next
            ) {

                nextElement.textContent =
                    data.next;

            }

            /*
            |--------------------------------------------------------------------------
            | BOTÃO DAR LANCE
            |--------------------------------------------------------------------------
            */

            if (
                action &&
                data.next
            ) {

                action.textContent =
                    `Dar lance mínimo de ${data.next}`;

                action.style.pointerEvents =
                    'auto';

                action.style.opacity =
                    '1';

            }

        } catch (error) {

            /*
            |--------------------------------------------------------------------------
            | NÃO QUEBRA A PÁGINA SE O ENDPOINT FALHAR
            |--------------------------------------------------------------------------
            */

            console.log(
                'Atualização de lance indisponível.'
            );
        }

    };

    /*
    |--------------------------------------------------------------------------
    | ATUALIZA IMEDIATAMENTE
    |--------------------------------------------------------------------------
    */

    refresh();

    /*
    |--------------------------------------------------------------------------
    | DEPOIS A CADA 4 SEGUNDOS
    |--------------------------------------------------------------------------
    */

    setInterval(
        refresh,
        4000
    );

});
/* ================================================================
   CONFIRMAÇÃO E ESPERA DO LANCE
================================================================ */

// O lance agora segue diretamente para o formulário completo do checkout.
// O antigo modal intermediário permanece desativado.
const bidButtons = [];

if (bidButtons.length) {

    const modalStyle = document.createElement('style');

    modalStyle.textContent = `
        .bid-wait-overlay {
            position: fixed;
            inset: 0;
            z-index: 99999;
            display: none;
            align-items: center;
            justify-content: center;
            padding: 20px;
            background: rgba(10, 18, 30, .72);
            backdrop-filter: blur(5px);
        }

        .bid-wait-overlay.is-visible {
            display: flex;
        }

        .bid-wait-modal {
            width: min(100%, 430px);
            padding: 32px 26px 28px;
            border-radius: 20px;
            background: #fff;
            box-shadow: 0 24px 70px rgba(0, 0, 0, .28);
            text-align: center;
            font-family: inherit;
            animation: bidModalIn .25s ease-out;
        }

        .bid-wait-check {
            display: grid;
            width: 64px;
            height: 64px;
            margin: 0 auto 18px;
            place-items: center;
            border-radius: 50%;
            background: #14804a;
            color: #fff;
            font-size: 34px;
            font-weight: 800;
        }

        .bid-wait-modal h2 {
            margin: 0 0 9px;
            color: #172033;
            font-size: 25px;
            line-height: 1.2;
        }

        .bid-wait-modal p {
            margin: 0;
            color: #5d6677;
            font-size: 15px;
            line-height: 1.55;
        }

        .bid-wait-value {
            display: block;
            margin-top: 8px;
            color: #14804a;
            font-size: 17px;
            font-weight: 800;
        }

        .bid-wait-countdown {
            display: block;
            margin: 22px 0 12px;
            color: #172033;
            font-size: 44px;
            font-weight: 900;
            letter-spacing: 1px;
            line-height: 1;
            font-variant-numeric: tabular-nums;
        }

        .bid-wait-note {
            display: block;
            color: #7b8493;
            font-size: 12px;
        }

        .bid-wait-cancel {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            margin-top: 18px;
            padding: 7px 12px;
            border: 1px solid #d8dce3;
            border-radius: 8px;
            background: transparent;
            color: #7b8493;
            font: inherit;
            font-size: 11px;
            font-weight: 500;
            line-height: 1;
            cursor: pointer;
            transition: background .18s ease, color .18s ease, border-color .18s ease;
        }

        .bid-wait-cancel:hover,
        .bid-wait-cancel:focus-visible {
            border-color: #b8bec8;
            background: #f6f7f9;
            color: #505867;
        }

        @keyframes bidModalIn {
            from { opacity: 0; transform: translateY(10px) scale(.98); }
            to { opacity: 1; transform: translateY(0) scale(1); }
        }
    `;

    document.head.appendChild(modalStyle);

    const overlay = document.createElement('div');

    overlay.className = 'bid-wait-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'bid-wait-title');
    overlay.innerHTML = `
        <div class="bid-wait-modal">
            <div class="bid-wait-check" aria-hidden="true">✓</div>
            <h2 id="bid-wait-title">Lance realizado com sucesso!</h2>
            <p>
                Seu lance foi registrado.
                <strong class="bid-wait-value"></strong>
            </p>
            <strong class="bid-wait-countdown" aria-live="polite">01:00</strong>
            <small class="bid-wait-note">
                Aguarde a finalização. Você será encaminhado automaticamente.
            </small>
            <button class="bid-wait-cancel" type="button">Cancelar lance</button>
        </div>
    `;

    document.body.appendChild(overlay);

    const countdownElement = overlay.querySelector('.bid-wait-countdown');
    const valueElement = overlay.querySelector('.bid-wait-value');
    const cancelButton = overlay.querySelector('.bid-wait-cancel');
    let bidInterval = null;
    let bidInProgress = false;

    const cancelBid = () => {
        if (bidInterval) {
            clearInterval(bidInterval);
            bidInterval = null;
        }

        bidInProgress = false;
        overlay.classList.remove('is-visible');
        document.body.style.overflow = '';
    };

    cancelButton.addEventListener('click', cancelBid);

    const formatBidTime = seconds => {
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;

        return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
    };

    bidButtons.forEach(button => {

        button.addEventListener('click', event => {

            event.preventDefault();

            if (bidInProgress) {
                return;
            }

            bidInProgress = true;

            const checkoutUrl = button.href;
            const buttonTitle = button.querySelector('[data-bid-button-title]');
            const bidText = buttonTitle ? buttonTitle.textContent.trim() : button.textContent.trim();
            const bidValue = bidText.match(/R\$\s*[\d.,]+/i);
            const finishAt = Date.now() + 60000;

            valueElement.textContent = bidValue ? `Valor: ${bidValue[0]}` : '';
            countdownElement.textContent = '01:00';
            overlay.classList.add('is-visible');
            document.body.style.overflow = 'hidden';

            bidInterval = setInterval(() => {
                const secondsLeft = Math.max(0, Math.ceil((finishAt - Date.now()) / 1000));

                countdownElement.textContent = formatBidTime(secondsLeft);

                if (secondsLeft <= 0) {
                    clearInterval(bidInterval);
                    bidInterval = null;
                    window.location.assign(checkoutUrl);
                }
            }, 250);
        });
    });
}