const SEND_EMAIL_URL = 'https://fletes-enki.netlify.app/.netlify/functions/send-email';
const MAIL_TOKEN_PUBLIC = '8d6c2a5f0c2a4c86b5b0a9b3c3f1e7d49e2f6c1a0f8b7c4d2e9a1b3c5d7e9f0';

export async function enviarEmailViaje(viaje, fletero, tipo = 'nuevo') {
    try {
        const res = await fetch(SEND_EMAIL_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Mail-Token': MAIL_TOKEN_PUBLIC },
            body: JSON.stringify({ viaje, fletero, tipo }),
        });
        const txt = await res.text();
        if (!res.ok) {
            console.error('Email fail', res.status, txt);
            return false;
        }
        console.log('✔ Email enviado', txt);
        return true;
    } catch (e) {
        console.error('Email fetch error', e);
        return false;
    }
}
