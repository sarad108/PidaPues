// =========================================
// PidaPues — envío de la factura por correo (Gmail / SMTP con nodemailer)
// =========================================
//
// Configuración en .env:
//   GMAIL_USER=tu_correo@gmail.com
//   GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx   (contraseña de aplicación, NO tu clave normal)
//
// Cómo crear la contraseña de aplicación: cuenta de Google -> Seguridad ->
// activar "Verificación en 2 pasos" -> https://myaccount.google.com/apppasswords
//
// Si falta la configuración o nodemailer no está instalado, el sistema sigue
// funcionando: el pago se guarda y la pantalla avisa que el correo no salió.

let nodemailer = null;
try {
  nodemailer = require("nodemailer");
} catch {
  nodemailer = null;
}

let transporte = null;

function estaConfigurado() {
  return !!(nodemailer && process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
}

function obtenerTransporte() {
  if (!transporte) {
    transporte = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: {
        user: process.env.GMAIL_USER,
        pass: String(process.env.GMAIL_APP_PASSWORD).replace(/\s+/g, ""),
      },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
    });
  }
  return transporte;
}

function esc(texto) {
  return String(texto == null ? "" : texto)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function pesos(valor) {
  return "$" + Number(valor || 0).toLocaleString("es-CO");
}

function fechaLegible(iso) {
  if (!iso) return "";
  const f = new Date(iso);
  return isNaN(f) ? String(iso) : f.toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" });
}

const ETIQUETA_METODO = { efectivo: "Efectivo", tarjeta: "Tarjeta", qr: "Código QR" };

function construirHtml(f) {
  const n = f.negocio || {};
  const filas = f.items.map((i) => `
    <tr>
      <td style="padding:6px 8px;border-bottom:1px solid #eee">${esc(i.nombre)}${i.observacion ? `<br><small style="color:#888">Obs: ${esc(i.observacion)}</small>` : ""}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:center">${i.cantidad}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right">${pesos(i.precio)}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right">${pesos(i.subtotal)}</td>
    </tr>`).join("");

  return `
  <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#2b2118">
    <h2 style="margin-bottom:0">${esc(n.razon_social || "PidaPues")}</h2>
    <p style="margin:2px 0;color:#666">NIT: ${esc(n.nit)} · ${esc(n.direccion)}<br>${esc(n.regimen)}</p>
    <hr>
    <p><b>Factura de venta ${esc(f.numero)}</b><br>${esc(fechaLegible(f.fecha))}</p>
    <p><b>Cliente:</b> ${esc(f.cliente)}<br>
       <b>Documento:</b> ${esc(f.documento)}<br>
       <b>Mesa:</b> ${esc(f.mesa)} · <b>Pedido:</b> #${esc(f.pedidoId)}<br>
       <b>Método de pago:</b> ${esc(ETIQUETA_METODO[f.metodoPago] || f.metodoPago)}</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px">
      <thead><tr style="background:#fff0e6">
        <th style="padding:6px 8px;text-align:left">Producto</th>
        <th style="padding:6px 8px">Cant.</th>
        <th style="padding:6px 8px;text-align:right">Precio</th>
        <th style="padding:6px 8px;text-align:right">Subtotal</th>
      </tr></thead>
      <tbody>${filas}</tbody>
    </table>
    <p style="text-align:right;font-size:18px"><b>Total pagado: ${pesos(f.total)}</b></p>
    <p style="font-size:12px;color:#888">Documento generado electrónicamente por PidaPues como soporte de la transacción. Prototipo con fines demostrativos.</p>
  </div>`;
}

function construirTexto(f) {
  const lineas = f.items.map((i) => `- ${i.cantidad}x ${i.nombre}  ${pesos(i.subtotal)}`).join("\n");
  return `Factura ${f.numero}\nCliente: ${f.cliente} (${f.documento})\nMesa ${f.mesa} · Pedido #${f.pedidoId}\n\n${lineas}\n\nTotal pagado: ${pesos(f.total)}`;
}

// Devuelve { enviado: boolean, motivo?: string }. Lanza error solo si el SMTP falla.
async function enviarFactura({ para, factura }) {
  if (!estaConfigurado()) {
    return { enviado: false, motivo: "El envío de correos no está configurado en el servidor." };
  }
  await obtenerTransporte().sendMail({
    from: `"${(factura.negocio && factura.negocio.razon_social) || "PidaPues"}" <${process.env.GMAIL_USER}>`,
    to: para,
    subject: `Factura ${factura.numero} — ${(factura.negocio && factura.negocio.razon_social) || "PidaPues"}`,
    text: construirTexto(factura),
    html: construirHtml(factura),
  });
  return { enviado: true };
}

module.exports = { enviarFactura, estaConfigurado };
