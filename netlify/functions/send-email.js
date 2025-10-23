// netlify/functions/send-email.js
exports.handler = async (event) => {
  const ALLOWED_ORIGINS = [
    'https://www.fletesenki.com.ar',
    'https://fletes-enki.netlify.app',
  ];
  const origin = event.headers.origin || '';
  const cors = {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : 'https://www.fletesenki.com.ar',
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,X-Mail-Token',
    'Vary': 'Origin',
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: cors, body: 'Method Not Allowed' };
  if ((event.headers['x-mail-token'] || '') !== (process.env.MAIL_TOKEN || ''))
    return { statusCode: 401, headers: cors, body: 'Unauthorized' };

  const raw = process.env.RESEND_API_KEY || '';
  const cleaned = raw.normalize('NFKC').replace(/^['"]|['"]$/g, '').replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
  if (!/^re_[A-Za-z0-9_-]+$/.test(cleaned)) return { statusCode: 500, headers: cors, body: 'Bad RESEND_API_KEY' };

  try {
    const { viaje, fletero, tipo } = JSON.parse(event.body || '{}');

    // 🔎 Logs de mails del fletero
    console.log('Fletero emails → mail:', fletero?.mail, ' email:', fletero?.email);

    const c = viaje?.cliente || {}; const a = viaje?.ayudantes || {};
    const precioServicio = Number(c.precioServicio || 0);
    const cantAyudantes = Number(a.cantidad || 0);
    const precioAyudante = Number(a.precio || 0);
    const totalCobrar = precioServicio + cantAyudantes * precioAyudante;

    const asunto = tipo === 'nuevo'
      ? `Nuevo viaje asignado - ${c.nombre || 'Cliente'} - ${c.fecha || ''}`
      : `Viaje modificado - ${c.nombre || 'Cliente'} - ${c.fecha || ''}`;

    const cuerpo = `...`; // tu HTML igual que ahora

    // 🔧 Modo prueba: forzar destino a tu casilla
    const emailDestino = 'lmarelli17@gmail.com';

    const payload = {
      from: 'notificaciones@fletesenki.com.ar',
      to: [emailDestino],
      subject: asunto,
      html: cuerpo,
      reply_to: 'marellilean@gmail.com',
    };

    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${cleaned}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
    });

    const text = await resp.text();
    if (!resp.ok) return { statusCode: resp.status, headers: cors, body: text };

    const data = JSON.parse(text || '{}');
    return { statusCode: 200, headers: cors, body: JSON.stringify({ success: true, id: data.id || null }) };
  } catch (err) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ success: false, error: String(err?.message || err) }) };
  }
};
