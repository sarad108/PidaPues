// =========================================
// PidaPues — factura.js
// Genera el HTML de la factura legal de un pedido.
// Se usa tanto en el módulo de pago (al verificar el pago)
// como en el menú del cliente (botón "Ver factura").
// =========================================

const PidaPuesFactura = (() => {

  function escaparHtml(texto) {
    const div = document.createElement("div");
    div.textContent = texto == null ? "" : String(texto);
    return div.innerHTML;
  }

  function etiquetaMetodoPago(metodo) {
    return { efectivo: "Efectivo", tarjeta: "Tarjeta", qr: "Código QR" }[metodo] || metodo || "—";
  }

  function filaItem(item) {
    const producto = PidaPuesDatos.obtenerProducto(item.productoId != null ? item.productoId : item.id);
    if (!producto) return "";
    const cantidad = item.cantidad;
    const subtotal = producto.precio * cantidad;
    return `
      <tr>
        <td>${escaparHtml(producto.nombre)}</td>
        <td class="fac-centro">${cantidad}</td>
        <td class="fac-derecha">${PidaPuesDatos.formatoPesos(producto.precio)}</td>
        <td class="fac-derecha">${PidaPuesDatos.formatoPesos(subtotal)}</td>
      </tr>
    `;
  }

  // pedido: objeto con { id, mesa, items, total, metodoPago, factura }
  function renderizarHTML(pedido) {
    const f = pedido.factura || {};
    const negocio = PidaPuesDatos.datosNegocio;

    const filasItems = pedido.items.map(filaItem).join("");

    const infoTransferencia = (pedido.metodoPago === "tarjeta" || pedido.metodoPago === "qr")
      ? `
        <div class="fac-cuenta">
          <p class="fac-cuenta-titulo">Datos de la cuenta receptora</p>
          <p><b>Titular:</b> ${escaparHtml(f.titularCuenta || negocio.titularCuenta)}</p>
          <p><b>Banco:</b> ${escaparHtml(f.banco || negocio.banco)}</p>
          <p><b>${escaparHtml(f.tipoCuenta || negocio.tipoCuenta)}:</b> ${escaparHtml(f.numeroCuenta || negocio.numeroCuenta)}</p>
        </div>
      `
      : "";

    return `
      <div class="factura">
        <div class="factura-encabezado">
          <div>
            <p class="factura-negocio">${escaparHtml(f.razonSocial || negocio.razonSocial)}</p>
            <p class="factura-dato">NIT: ${escaparHtml(f.nit || negocio.nit)}</p>
            <p class="factura-dato">${escaparHtml(f.direccion || negocio.direccion)}</p>
            <p class="factura-dato">${escaparHtml(f.regimen || negocio.regimen)}</p>
          </div>
          <div class="factura-numero">
            <p class="factura-numero-etiqueta">Factura de venta</p>
            <p class="factura-numero-valor">${escaparHtml(f.numero || "—")}</p>
            <p class="factura-dato">${PidaPuesDatos.formatoFechaHora(f.fecha || pedido.fechaHoraRegistro)}</p>
          </div>
        </div>

        <div class="factura-cliente">
          <p><b>Cliente:</b> ${escaparHtml(f.cliente || "Consumidor final")}</p>
          <p><b>Mesa:</b> ${escaparHtml(pedido.mesa)} &nbsp;·&nbsp; <b>Pedido:</b> #${escaparHtml(pedido.id)}</p>
          <p><b>Método de pago:</b> ${etiquetaMetodoPago(pedido.metodoPago)}</p>
        </div>

        <table class="factura-tabla">
          <thead>
            <tr><th>Producto</th><th class="fac-centro">Cant.</th><th class="fac-derecha">Precio</th><th class="fac-derecha">Subtotal</th></tr>
          </thead>
          <tbody>${filasItems}</tbody>
        </table>

        <div class="factura-total">
          <span>Total pagado</span>
          <span>${PidaPuesDatos.formatoPesos(pedido.total)}</span>
        </div>

        ${infoTransferencia}

        <p class="factura-pie">Documento generado electrónicamente por PidaPues como soporte de la transacción. Prototipo con fines demostrativos.</p>
      </div>
    `;
  }

  return { renderizarHTML };
})();
