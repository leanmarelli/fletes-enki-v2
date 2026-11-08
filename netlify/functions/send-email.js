// netlify/functions/send-email.js
exports.handler = async (event) => {
  const ALLOWED_ORIGINS = [
    'https://fletesenki.com.ar',
    'http://fletesenki.com.ar',
    'https://www.fletesenki.com.ar',
    'http://www.fletesenki.com.ar',
    'https://fletes-enki.netlify.app',
  ];
  const origin = event.headers.origin || '';
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : 'https://fletesenki.com.ar';
  const cors = {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,X-Mail-Token',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: cors, body: 'Method Not Allowed' };

  // Token app-level
  const tokenOk = (event.headers['x-mail-token'] || '') === (process.env.MAIL_TOKEN || '');
  if (!tokenOk) return { statusCode: 401, headers: cors, body: 'Unauthorized' };

  // API key Resend
  const raw = process.env.RESEND_API_KEY || '';
  const cleaned = raw.normalize('NFKC').replace(/^['"]|['"]$/g, '').replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
  if (!/^re_[A-Za-z0-9_-]+$/.test(cleaned)) return { statusCode: 500, headers: cors, body: 'Bad RESEND_API_KEY' };

  try {
    const { viaje, fletero, tipo } = JSON.parse(event.body || '{}');
    const c = viaje?.cliente || {};
    const a = viaje?.ayudantes || {};

    // === destino ===
    const emailCrudo = String(fletero?.mail || fletero?.email || '').trim().toLowerCase();
    console.log('TRACE send-email', { origin, to: emailCrudo, dni: fletero?.dni, tipo });

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailCrudo)) {
      console.error('Email inválido o vacío', emailCrudo);
      return { statusCode: 400, headers: cors, body: 'Invalid recipient email' };
    }

    // === asunto + html ===
    const precioServicio = Number(c.precioServicio || 0);
    const cantAyudantes = Number(a.cantidad || 0);
    const precioAyudante = Number(a.precio || 0);
    const totalCobrar = precioServicio + cantAyudantes * precioAyudante;

    const asunto =
      tipo === 'nuevo'
        ? `Nuevo viaje asignado - ${c.nombre || 'Cliente'} - ${c.fecha || ''}`
        : `Viaje modificado - ${c.nombre || 'Cliente'} - ${c.fecha || ''}`;

    const cuerpo = `
      <div style="max-width:600px;margin:0 auto;font-family:Arial,Helvetica,sans-serif;color:#333;">
        <h2 style="color:#198754;margin-bottom:5px;">
          ${tipo === 'nuevo' ? '📢 Nuevo viaje asignado' : '✏️ Viaje modificado'}
        </h2>
        <p style="margin:0 0 20px 0;">
          Hola <strong>${fletero?.name || 'Fletero'}</strong>, se te ha
          ${tipo === 'nuevo' ? 'asignado un nuevo' : 'modificado un'} viaje.
        </p>
        <table width="100%" cellpadding="8" cellspacing="0" style="border-collapse:collapse;background:#fafafa;">
          <tr style="background:#f0f2f2;"><td colspan="2"><strong>📋 CLIENTE</strong></td></tr>
          <tr><td style="width:120px;">Nombre:</td><td>${c.nombre || '-'}</td></tr>
          <tr><td>Teléfono:</td><td>${c.telefono || '-'}</td></tr>

          <tr style="background:#f0f2f2;"><td colspan="2"><strong>📅 SERVICIO</strong></td></tr>
          <tr><td>Tipo:</td><td>${c.tipoServicio || '-'}</td></tr>
          <tr><td>Fecha:</td><td>${c.fecha || '-'}</td></tr>
          <tr><td>Hora:</td><td>${c.horario || '-'}</td></tr>

          <tr style="background:#f0f2f2;"><td colspan="2"><strong>📍 CARGA</strong></td></tr>
          <tr><td>Dirección:</td><td>${c.direccionCarga || '-'}</td></tr>
          <tr><td>Localidad:</td><td>${c.localidadCarga || '-'}</td></tr>

          <tr style="background:#f0f2f2;"><td colspan="2"><strong>📍 DESCARGA</strong></td></tr>
          <tr><td>Dirección:</td><td>${c.direccionDescarga || '-'}</td></tr>
          <tr><td>Localidad:</td><td>${c.localidadDescarga || '-'}</td></tr>

          <tr style="background:#f0f2f2;"><td colspan="2"><strong>📦 DETALLE</strong></td></tr>
          <tr><td colspan="2">${c.detalle || '-'}</td></tr>

          <tr style="background:#f0f2f2;"><td colspan="2"><strong>💰 PRECIO</strong></td></tr>
          <tr><td>Servicio:</td><td>$${precioServicio.toLocaleString('es-AR')}</td></tr>
          ${cantAyudantes > 0 ? `<tr><td>Ayudantes:</td><td>${cantAyudantes} × $${precioAyudante.toLocaleString('es-AR')}</td></tr>` : ''}
          <tr><td><strong>Total:</strong></td><td><strong>$${totalCobrar.toLocaleString('es-AR')}</strong></td></tr>
        </table>

        <p style="margin-top:25px;font-size:13px;color:#777;text-align:center;">
          <a href="https://fletesenki.com.ar/public/schedule.html?dni=${fletero?.dni || ''}&date=${c.fecha || ''}"
             style="color:#198754;text-decoration:none;">📅 Ver en mi agenda</a>
          <br><br>— Gestión Fletes Enki —
        </p>
      </div>
    `;

    const payload = {
      from: 'Fletes Enki <notificaciones@fletesenki.com.ar>',
      to: [emailCrudo],            // ← SIEMPRE array
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
    console.log('Resend status:', resp.status, 'body:', text);
    if (!resp.ok) return { statusCode: resp.status, headers: cors, body: text };

    const data = JSON.parse(text || '{}');
    return { statusCode: 200, headers: cors, body: JSON.stringify({ success: true, id: data.id || null }) };
  } catch (err) {
    console.error('SEND-EMAIL ERROR', err);
    return { statusCode: 500, headers: cors, body: JSON.stringify({ success: false, error: String(err?.message || err) }) };
  }
};
