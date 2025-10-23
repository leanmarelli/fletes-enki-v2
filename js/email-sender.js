// js/email-sender.js
export async function enviarEmailViaje(viaje, fletero, tipo = 'nuevo') {
    try {
        const response = await fetch('/.netlify/functions/send-email', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ viaje, fletero, tipo })
        });

        if (!response.ok) {
            throw new Error(`Error ${response.status}`);
        }

        const data = await response.json();
        console.log('✅ Email enviado correctamente:', data);
        return true;
    } catch (error) {
        console.error('❌ Error al enviar email:', error);
        return false;
    }
}