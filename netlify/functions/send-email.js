// netlify/functions/send-email.js
exports.handler = async (event) => {
  // Método permitido
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  // Normalización fuerte de la API key
  const raw = process.env.RESEND_API_KEY || '';
  const cleaned = raw
    .normalize('NFKC')
    .replace(/^['"]|['"]$/g, '')           // quita comillas pegadas
    .replace(/[\u200B-\u200D\uFEFF]/g, '') // quita ZWSP/BOM
    .trim();

  console.log('KEY lens', { raw: raw.length, cleaned: cleaned.length });
  if (!/^re_[A-Za-z0-9_-]+$/.test(cleaned)) {
    console.error('Formato RESEND_API_KEY sospechoso o vacío');
    return { statusCode: 500, body: 'Bad RESEND_API_KEY' };
  }

  try {
    const { viaje, fletero, tipo } = JSON.parse(event.body || '{}');

    // Debug mínimo
    console.log('=== INICIO DEBUG ===');
    console.log('Fletero:', { name: fletero?.name, mail: fletero?.mail, email: fletero?.email, dni: fletero?.dni });
    console.log('Tipo:', tipo);

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
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #198754;">Hola ${fletero?.name || 'Fletero'},</h2>
      <p>Se te ha ${tipo === 'nuevo' ? 'asignado un nuevo' : 'modificado un'} viaje:</p>

      <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin: 15px 0;">
        <h3 style="color: #135322; margin-top: 0;">📋 CLIENTE</h3>
        <p><strong>Nombre:</strong> ${c.nombre || '-'}</p>
        <p><strong>Teléfono:</strong> ${c.telefono || '-'}</p>
      </div>

      <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin: 15px 0;">
        <h3 style="color: #135322; margin-top: 0;">📅 SERVICIO</h3>
        <p><strong>Tipo:</strong> ${c.tipoServicio || '-'}</p>
        <p><strong>Fecha:</strong> ${c.fecha || '-'}</p>
        <p><strong>Hora:</strong> ${c.horario || '-'}</p>
      </div>

      <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin: 15px 0;">
        <h3 style="color: #135322; margin-top: 0;">📍 CARGA</h3>
        <p><strong>Dirección:</strong> ${c.direccionCarga || '-'}</p>
        <p><strong>Localidad:</strong> ${c.localidadCarga || '-'}</p>
      </div>

      <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin: 15px 0;">
        <h3 style="color: #135322; margin-top: 0;">📦 DETALLE</h3>
        <p>${c.detalle || '-'}</p>
      </div>

      <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin: 15px 0;">
        <h3 style="color: #135322; margin-top: 0;">📍 DESCARGA</h3>
        <p><strong>Dirección:</strong> ${c.direccionDescarga || '-'}</p>
        <p><strong>Localidad:</strong> ${c.localidadDescarga || '-'}</p>
      </div>

      <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin: 15px 0;">
        <h3 style="color: #135322; margin-top: 0;">💰 PRECIO</h3>
        <p><strong>Servicio:</strong> $${precioServicio.toLocaleString('es-AR')}</p>
        ${cantAyudantes > 0 ? `<p><strong>Ayudantes:</strong> ${cantAyudantes} x $${precioAyudante.toLocaleString('es-AR')}</p>` : ''}
        <p><strong>Peajes:</strong> ${c.peajes || '-'}</p>
        ${cantAyudantes > 0 ? `<hr style="border: 1px solid #dee2e6;">` : ''}
        <p style="font-size: 18px;"><strong>Total a cobrar: $${totalCobrar.toLocaleString('es-AR')}</strong></p>
      </div>

      <hr style="border: 1px solid #dee2e6; margin: 20px 0;">
      <p style="color: #6c757d; font-size: 14px; text-align: center;">
        Gestión Fletes Enki<br>
        <a href="https://fletes-enki.netlify.app/schedule.html?dni=${fletero?.dni || ''}&date=${c.fecha || ''}" style="color: #198754;">Ver en mi agenda</a>
      </p>
    </div>
    `;

    // Destino: usa mail/email y fallback a tu inbox
    const emailDestino = fletero?.mail || fletero?.email || 'leanmarelli17@gmail.com';
    console.log('Email destino:', emailDestino);

    const payload = {
      from: 'onboarding@resend.dev',
      to: [emailDestino],
      subject: asunto,
      html: cuerpo,
    };

    console.log('Llamando a Resend…');
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cleaned}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const text = await resp.text();
    console.log('Resend status:', resp.status);
    console.log('Resend body:', text);

    if (!resp.ok) {
      // Propaga el status para ver 401/422/4xx en el cliente
      return { statusCode: resp.status, body: text };
    }

    const data = JSON.parse(text);
    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, id: data.id || null }),
    };
  } catch (err) {
    console.error('❌ ERROR COMPLETO:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, error: String(err?.message || err) }),
    };
  }
};
