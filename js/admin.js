// =========================================
// PidaPues — admin.js
// Reportes de ventas (RF008), tiempos de servicio (RF009),
// historial de transacciones (RF010) y estado de mesas (RF011)
// =========================================

document.addEventListener("DOMContentLoaded", () => {

  const ETIQUETA_ESTADO = {
    pendiente: "Pendiente",
    en_preparacion: "En preparación",
    listo: "Listo",
    entregado: "Entregado",
  };

  const tarjetasResumen = document.getElementById("tarjetasResumen");
  const grillaMesas = document.getElementById("grillaMesas");
  const tablaHistorialCuerpo = document.querySelector("#tablaHistorial tbody");
  const tablaTiemposCuerpo = document.querySelector("#tablaTiempos tbody");
  const historialVacio = document.getElementById("historialVacio");
  const tiemposVacio = document.getElementById("tiemposVacio");
  const btnReiniciarDemo = document.getElementById("btnReiniciarDemo");

  function escaparHtml(texto) {
    const div = document.createElement("div");
    div.textContent = texto;
    return div.innerHTML;
  }

  function resumenProductos(pedido) {
    return pedido.items.map((i) => {
      const producto = PidaPuesDatos.obtenerProducto(i.productoId);
      return `${i.cantidad}× ${producto ? producto.nombre : "Producto"}`;
    }).join(", ");
  }

  /* ---------- RF008: Tarjetas de resumen de ventas ---------- */
  function renderizarResumen(pedidos) {
    const pagados = pedidos.filter((p) => p.pagado);
    const totalVentas = pagados.reduce((suma, p) => suma + p.total, 0);
    const ticketPromedio = pagados.length ? Math.round(totalVentas / pagados.length) : 0;
    const pendientesCocina = pedidos.filter((p) => p.estado !== "entregado").length;

    const tarjetas = [
      { etiqueta: "Ventas registradas", valor: PidaPuesDatos.formatoPesos(totalVentas), acento: true },
      { etiqueta: "Pedidos realizados", valor: pedidos.length, acento: false },
      { etiqueta: "Ticket promedio", valor: PidaPuesDatos.formatoPesos(ticketPromedio), acento: false },
      { etiqueta: "Pedidos en curso", valor: pendientesCocina, acento: false },
    ];

    tarjetasResumen.innerHTML = tarjetas.map((t) => `
      <div class="tarjeta-resumen">
        <div class="tarjeta-resumen-etiqueta">${t.etiqueta}</div>
        <div class="tarjeta-resumen-valor ${t.acento ? "acento" : ""}">${t.valor}</div>
      </div>
    `).join("");
  }

  /* ---------- RF011: Estado de mesas ---------- */
  function renderizarMesas() {
    const mesas = PidaPuesDatos.obtenerMesas();
    const etiquetaEstado = { libre: "Libre", ocupada: "Ocupada", pago: "En pago" };
    grillaMesas.innerHTML = mesas.map((m) => `
      <div class="mesa" data-estado="${m.estado}">
        <div class="mesa-numero">${m.numero}</div>
        <div class="mesa-estado">${etiquetaEstado[m.estado] || m.estado}</div>
      </div>
    `).join("");
  }

  /* ---------- RF010: Historial de pedidos y pagos ---------- */
  function renderizarHistorial(pedidos) {
    const ordenados = pedidos.slice().sort((a, b) => new Date(b.fechaHoraRegistro) - new Date(a.fechaHoraRegistro));
    historialVacio.hidden = ordenados.length !== 0;
    tablaHistorialCuerpo.innerHTML = ordenados.map((p) => `
      <tr>
        <td>#${p.id}</td>
        <td>Mesa ${p.mesa}</td>
        <td class="celda-productos">${escaparHtml(resumenProductos(p))}</td>
        <td>${PidaPuesDatos.formatoPesos(p.total)}</td>
        <td>${p.metodoPago || "—"}</td>
        <td><span class="pill-estado ${p.estado}">${ETIQUETA_ESTADO[p.estado]}</span></td>
        <td>${PidaPuesDatos.formatoFechaHora(p.fechaHoraRegistro)}</td>
      </tr>
    `).join("");
  }

  /* ---------- RF009: Tiempos de servicio ---------- */
  function renderizarTiempos(pedidos) {
    const ordenados = pedidos.slice().sort((a, b) => new Date(b.fechaHoraRegistro) - new Date(a.fechaHoraRegistro));
    tiemposVacio.hidden = ordenados.length !== 0;
    tablaTiemposCuerpo.innerHTML = ordenados.map((p) => {
      const duracion = PidaPuesDatos.minutosEntre(p.fechaHoraRegistro, p.fechaHoraEntregado);
      return `
        <tr>
          <td>#${p.id}</td>
          <td>${PidaPuesDatos.formatoFechaHora(p.fechaHoraRegistro)}</td>
          <td>${PidaPuesDatos.formatoFechaHora(p.fechaHoraInicioPreparacion)}</td>
          <td>${PidaPuesDatos.formatoFechaHora(p.fechaHoraListo)}</td>
          <td>${PidaPuesDatos.formatoFechaHora(p.fechaHoraEntregado)}</td>
          <td>${duracion !== null ? duracion + " min" : "—"}</td>
        </tr>
      `;
    }).join("");
  }

  function renderizarTodo() {
    const pedidos = PidaPuesDatos.obtenerPedidos();
    renderizarResumen(pedidos);
    renderizarMesas();
    renderizarHistorial(pedidos);
    renderizarTiempos(pedidos);
  }

  /* ---------- Utilidad de demo ---------- */
  btnReiniciarDemo.addEventListener("click", () => {
    const confirmado = window.confirm("Esto borrará todos los pedidos y mesas de la demo. ¿Continuar?");
    if (!confirmado) return;
    PidaPuesDatos.limpiarDatosDemo();
    renderizarTodo();
  });

  /* ---------- Actualización en vivo ---------- */
  window.addEventListener("storage", renderizarTodo);
  setInterval(renderizarTodo, 3000);

  renderizarTodo();
});
