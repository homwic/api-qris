const express = require('express');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

// Konfigurasi
const defaultQris = "00020101021126670016COM.NOBUBANK.WWW01189360050300000879140214210379661725380303UMI51440014ID.CO.QRIS.WWW0215ID20253865385780303UMI5204541153033605802ID5922LUTIFY STORE OK23176316006BEKASI61051711162070703A0163041FF9";
const defaultAmount = 10000;
const qrSize = 300;
const qrMargin = 1;
const qrECC = 'L';

app.get('/', async (req, res) => {
    try {
        let amount = parseInt(req.query.amount) || defaultAmount;

        if (amount < 100) {
            return res.status(400).json({ status: 'error', message: 'Nominal minimal Rp100' });
        }
        if (amount > 500000) {
            return res.status(400).json({ status: 'error', message: 'Nominal maksimal Rp500.000' });
        }

        // Generate QRIS Dinamis
        const base = defaultQris.slice(0, -8).replace('010211', '010212');
        const amountStr = amount.toString();
        const tag54 = '54' + amountStr.length.toString().padStart(2, '0') + amountStr;

        const parts = base.split('5802ID');
        if (parts.length !== 2) {
            throw new Error("Format QRIS tidak valid");
        }

        let qrisString = parts[0] + tag54 + '5802ID' + parts[1];
        qrisString += '6304' + calculateCRC16(qrisString + '6304');

        // Generate QR menggunakan API eksternal
        const apiUrl = 'https://api.qrserver.com/v1/create-qr-code/';
        const params = {
            size: `${qrSize}x${qrSize}`,
            data: qrisString,
            margin: qrMargin,
            format: 'png',
            ecc: qrECC
        };

        const response = await axios.get(apiUrl, { responseType: 'arraybuffer', params });

        const tempDir = path.join(__dirname, 'temp_qris');
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }

        const filename = `qris_${Date.now()}.png`;
        const filepath = path.join(tempDir, filename);
        fs.writeFileSync(filepath, response.data);

        const baseUrl = req.protocol + '://' + req.get('host');
        const qrUrl = `${baseUrl}/temp_qris/${filename}`;

        res.json({
            status: 'success',
            message: 'QRIS generated successfully',
            data: {
                amount,
                qris_string: qrisString,
                qris_url: qrUrl,
                expiry: new Date(Date.now() + 3600 * 1000).toISOString()
            }
        });
    } catch (err) {
        res.status(400).json({
            status: 'error',
            message: err.message,
            usage: 'Gunakan: ?amount=NOMINAL (contoh: ?amount=5000)',
            parameters: {
                min_amount: 100,
                max_amount: 500000,
                default_size: qrSize
            }
        });
    }
});

// Fungsi CRC16 (sama seperti di PHP)
function calculateCRC16(str) {
    let crc = 0xFFFF;
    const polynomial = 0x1021;
    for (let i = 0; i < str.length; i++) {
        crc ^= str.charCodeAt(i) << 8;
        for (let j = 0; j < 8; j++) {
            if (crc & 0x8000) {
                crc = (crc << 1) ^ polynomial;
            } else {
                crc <<= 1;
            }
            crc &= 0xFFFF;
        }
    }
    return crc.toString(16).toUpperCase().padStart(4, '0');
}

// Folder static untuk serve QR code image
app.use('/temp_qris', express.static(path.join(__dirname, 'temp_qris')));

app.listen(PORT, () => {
    console.log(`QRIS Generator running on http://localhost:${PORT}`);
});
