exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { viaje, fletero, tipo } = JSON.parse(event.body);

    // 🔍 LOGS DE DEBUG
    console.log('=== INICIO DEBUG ===');
    console.log('Fletero recibido:', fletero);
    console.log('Email destino (mail):', fletero.mail);
    console.log('Email destino (email):', fletero.email);
    console.log('API Key existe:', !!process.env.RESEND_API_KEY);
    console.log('API Key primeros 10 chars:', process.env.RESEND_API_KEY?.substring(0, 10));
    console.log('Tipo de mensaje:', tipo);

    const c = viaje.cliente || {};
    const a = viaje.ayudantes || {};

    const precioServicio = c.precioServicio || 0;
    const cantAyudantes = a.cantidad || 0;
    const precioAyudante = a.precio || 0;
    const totalAyudantes = cantAyudantes * precioAyudante;
    const totalCobrar = precioServicio + totalAyudantes;

    const asunto = tipo === 'nuevo'
      ? `Nuevo viaje asignado - ${c.nombre || 'Cliente'} - ${c.fecha || ''}`
      : `Viaje modificado - ${c.nombre || 'Cliente'} - ${c.fecha || ''}`;

    const cuerpo = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #198754;">Hola ${fletero.name || 'Fletero'},</h2>
      
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
        <a href="https://fletes-enki.netlify.app/schedule.html?dni=${fletero.dni}&date=${c.fecha}" style="color: #198754;">Ver en mi agenda</a>
      </p>
    </div>
    `;

    const emailDestino = 'leanmarelli17@gmail.com'; //fletero.mail || fletero.email ||

    console.log('Email final a enviar:', emailDestino);
    console.log('Preparando llamada a Resend...');

    const payload = {
      from: 'onboarding@resend.dev',  // ⬅️ SIN nombre, solo email
      to: [emailDestino],               // ⬅️ Array
      subject: asunto,
      html: cuerpo,
    };

    console.log('Payload a enviar:', JSON.stringify(payload, null, 2));
    console.log('Llamando a Resend API...');

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    console.log('Resend response status:', response.status);
    const responseText = await response.text();
    console.log('Resend response body:', responseText);

    if (!response.ok) {
      throw new Error(`Resend error ${response.status}: ${responseText}`);
    }

    const data = JSON.parse(responseText);
    console.log('✅ Email enviado exitosamente. ID:', data.id);

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, id: data.id })
    };

  } catch (error) {
    console.error('❌ ERROR COMPLETO:', error);
    console.error('Error stack:', error.stack);
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: error.message,
        stack: error.stack
      })
    };
  }
};