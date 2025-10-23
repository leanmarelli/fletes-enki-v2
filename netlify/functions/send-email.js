// netlify/functions/send-email.js
exports.handler = async (event) => {
  // CORS
  const ALLOWED_ORIGINS = [
    'https://fletesenki.com.ar',
    'https://fletes-enki.netlify.app',
  ];
  const origin = event.headers.origin || '';
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : 'https://fletesenki.com.ar';
  const cors = {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,X-Mail-Token',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: cors, body: 'Method Not Allowed' };
  if ((event.headers['x-mail-token'] || '') !== (process.env.MAIL_TOKEN || ''))
    return { statusCode: 401, headers: cors, body: 'Unauthorized' };

  // API key
  const raw = process.env.RESEND_API_KEY || '';
  const cleaned = raw.normalize('NFKC').replace(/^['"]|['"]$/g, '').replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
  if (!/^re_[A-Za-z0-9_-]+$/.test(cleaned)) return { statusCode: 500, headers: cors, body: 'Bad RESEND_API_KEY' };

  try {
    const { viaje, fletero, tipo } = JSON.parse(event.body || '{}');

    // Logs
    console.log('Fletero emails → mail:', fletero?.mail, ' email:', fletero?.email);

    const c = viaje?.cliente || {};
    const a = viaje?.ayudantes || {};

    const precioServicio = Number(c.precioServicio || 0);
    const cantAyudantes = Number(a.cantidad || 0);
    const precioAyudante = Number(a.precio || 0);
    const totalAyudantes = cantAyudantes * precioAyudante;
    const totalCobrar = precioServicio + totalAyudantes;

    const asunto =
      tipo === 'nuevo'
        ? `Nuevo viaje asignado - ${c.nombre || 'Cliente'} - ${c.fecha || ''}`
        : `Viaje modificado - ${c.nombre || 'Cliente'} - ${c.fecha || ''}`;

    const cuerpo = `
  <div style="max-width:600px;margin:0 auto;font-family:Arial,Helvetica,sans-serif;color:#333;">
    
    <!-- Encabezado -->
    <h2 style="color:#198754;margin-bottom:5px;">
      ${tipo === 'nuevo' ? '📢 Nuevo viaje asignado' : '✏️ Viaje modificado'}
    </h2>
    <p style="margin:0 0 20px 0;">
      Hola <strong>${fletero?.name || 'Fletero'}</strong>, se te ha 
      ${tipo === 'nuevo' ? 'asignado un nuevo' : 'modificado un'} viaje.
    </p>

    <!-- Tabla de información -->
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
      <tr><td>Peajes:</td><td>${c.peajes || '-'}</td></tr>
      <tr><td><strong>Total:</strong></td><td><strong>$${totalCobrar.toLocaleString('es-AR')}</strong></td></tr>
    </table>

    <!-- Footer -->
    <p style="margin-top:25px;font-size:13px;color:#777;text-align:center;">
      <a href="https://fletesenki.com.ar/agenda.html?dni=${fletero?.dni || ''}&date=${c.fecha || ''}" 
         style="color:#198754;text-decoration:none;">📅 Ver en mi agenda</a>
      <br><br>
      — Gestión Fletes Enki —
    </p>
  </div>
`;




    // Modo prueba: forzar destino a tu casilla
    const emailDestino = fletero?.mail?.trim() || fletero?.email?.trim() || 'marellilean@gmail.com';


    const payload = {
      from: 'Fletes Enki <notificaciones@fletesenki.com.ar>',  // nombre + email
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

    console.log('Key check', { has: !!cleaned, len: cleaned.length, head: cleaned.slice(0, 8) });

    const text = await resp.text();
    if (!resp.ok) return { statusCode: resp.status, headers: cors, body: text };

    const data = JSON.parse(text || '{}');
    return { statusCode: 200, headers: cors, body: JSON.stringify({ success: true, id: data.id || null }) };
  } catch (err) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ success: false, error: String(err?.message || err) }) };
  }
};
