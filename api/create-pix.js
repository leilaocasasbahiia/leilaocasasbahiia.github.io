'use strict';

const QRCode = require('../lib/vendor/QRCode');
const QRErrorCorrectLevel = require('../lib/vendor/QRCode/QRErrorCorrectLevel');

const recipient = {
    key: '44769766000100',
    name: 'GRUPO CASAS BAHIA',
    city: 'RIO DE JANEIRO'
};

function field(id, value) {
    const text = String(value);
    return id + String(Buffer.byteLength(text, 'utf8')).padStart(2, '0') + text;
}

function crc16(text) {
    let crc = 0xffff;
    for (const byte of Buffer.from(text, 'utf8')) {
        crc ^= byte << 8;
        for (let index = 0; index < 8; index += 1) {
            crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
        }
    }
    return crc.toString(16).toUpperCase().padStart(4, '0');
}

function pixCode(amount, txid) {
    const payload = field('00', '01')
        + field('26', field('00', 'br.gov.bcb.pix') + field('01', recipient.key))
        + field('52', '0000')
        + field('53', '986')
        + field('54', amount.toFixed(2))
        + field('58', 'BR')
        + field('59', recipient.name)
        + field('60', recipient.city)
        + field('62', field('05', txid))
        + '6304';
    return payload + crc16(payload);
}

function qrImage(payload) {
    const qr = new QRCode(-1, QRErrorCorrectLevel.M);
    qr.addData(payload);
    qr.make();

    const count = qr.getModuleCount();
    const size = count + 8;
    let commands = '';

    for (let row = 0; row < count; row += 1) {
        for (let column = 0; column < count; column += 1) {
            if (qr.isDark(row, column)) {
                commands += `M${column + 4} ${row + 4}h1v1h-1z`;
            }
        }
    }

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges"><path fill="#fff" d="M0 0h${size}v${size}H0z"/><path fill="#000" d="${commands}"/></svg>`;
    return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

module.exports = function handler(request, response) {
    if (request.method !== 'POST') {
        return response.status(405).json({ success: false, message: 'Método não permitido.' });
    }

    const amount = Number(request.body && request.body.total_price);
    if (!Number.isFinite(amount) || amount <= 0) {
        return response.status(400).json({ success: false, message: 'Valor inválido.' });
    }

    const rawCode = String(request.body.external_code || Date.now()).replace(/[^a-zA-Z0-9]/g, '');
    const txid = (rawCode || 'CASASBAHIA').slice(0, 25);

    const code = pixCode(amount, txid);

    return response.status(200).json({
        success: true,
        pixCode: code,
        qrCodeUrl: qrImage(code),
        paymentCode: null
    });
};
