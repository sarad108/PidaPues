// =========================================
// PidaPues — admin.js
// Reportes de ventas, tiempos de servicio, historial de
// transacciones y estado de mesas — leídos desde la API/MySQL.
// =========================================

document.addEventListener("DOMContentLoaded", async () => {

  await PidaPuesAuth.exigirAcceso("admin", "Administración");
  await PidaPuesDatos.listo;

  const ETIQUETA_ESTADO = {
    pendiente_pago: "Pago no verificado",
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
  const avisoConexion = document.getElementById("avisoConexion");
  const avisoConexionDetalle = document.getElementById("avisoConexionDetalle");

  function mostrarAvisoConexion(error) {
    avisoConexionDetalle.textContent = error && error.message ? `(${error.message})` : "";
    avisoConexion.hidden = false;
  }
  function ocultarAvisoConexion() {
    avisoConexion.hidden = true;
  }

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

  /* ---------- Tarjetas de resumen de ventas ---------- */
  function renderizarResumen(pedidos) {
    const pagados = pedidos.filter((p) => p.pagado);
    const sinPagar = pedidos.filter((p) => !p.pagado);
    const totalVentas = pagados.reduce((suma, p) => suma + p.total, 0);
    const ticketPromedio = pagados.length ? Math.round(totalVentas / pagados.length) : 0;
    const enCurso = pagados.filter((p) => p.estado !== "entregado").length;

    const tarjetas = [
      { etiqueta: "Ventas confirmadas", valor: PidaPuesDatos.formatoPesos(totalVentas), acento: true },
      { etiqueta: "Pedidos pagados", valor: pagados.length, acento: false },
      { etiqueta: "Ticket promedio", valor: PidaPuesDatos.formatoPesos(ticketPromedio), acento: false },
      { etiqueta: "Pedidos en curso", valor: enCurso, acento: false },
      { etiqueta: "Carritos sin pago verificado", valor: sinPagar.length, acento: false },
    ];

    tarjetasResumen.innerHTML = tarjetas.map((t) => `
      <div class="tarjeta-resumen">
        <div class="tarjeta-resumen-etiqueta">${t.etiqueta}</div>
        <div class="tarjeta-resumen-valor ${t.acento ? "acento" : ""}">${t.valor}</div>
      </div>
    `).join("");
  }

  /* ---------- Estado de mesas ---------- */
  async function renderizarMesas() {
    const mesas = await PidaPuesDatos.obtenerMesas();
    const etiquetaEstado = { libre: "Libre", pago: "En proceso de pago", ocupada: "Ocupada" };
    grillaMesas.innerHTML = mesas.map((m) => `
      <div class="mesa" data-estado="${m.estado}">
        <div class="mesa-numero">${m.numero}</div>
        <div class="mesa-estado">${etiquetaEstado[m.estado] || m.estado}</div>
      </div>
    `).join("");
  }

  /* ---------- Historial de pedidos y pagos ---------- */
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
        <td><span class="pill-estado ${p.estado}">${ETIQUETA_ESTADO[p.estado] || p.estado}</span></td>
        <td>${PidaPuesDatos.formatoFechaHora(p.fechaHoraRegistro)}</td>
      </tr>
    `).join("");
  }

  /* ---------- Tiempos de servicio ---------- */
  function renderizarTiempos(pedidos) {
    const pagados = pedidos.filter((p) => p.pagado)
      .slice()
      .sort((a, b) => new Date(b.fechaHoraRegistro) - new Date(a.fechaHoraRegistro));
    tiemposVacio.hidden = pagados.length !== 0;
    tablaTiemposCuerpo.innerHTML = pagados.map((p) => {
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

  async function renderizarTodo() {
    const pedidos = await PidaPuesDatos.obtenerPedidos("admin");
    renderizarResumen(pedidos);
    await renderizarMesas();
    renderizarHistorial(pedidos);
    renderizarTiempos(pedidos);
  }

  async function actualizarTodo() {
    try {
      await renderizarTodo();
      ocultarAvisoConexion();
    } catch (error) {
      console.error("Error consultando el panel de administración:", error);
      mostrarAvisoConexion(error);
    }
  }

  /* ---------- Utilidad de demo ---------- */
  btnReiniciarDemo.addEventListener("click", async () => {
    const confirmado = window.confirm("Esto borrará todos los pedidos y mesas de la demo. ¿Continuar?");
    if (!confirmado) return;
    try {
      await PidaPuesDatos.limpiarDatosDemo();
    } catch (error) {
      alert(error.message || "No se pudieron reiniciar los datos de demo.");
    }
    await actualizarTodo();
  });

  /* ---------- Actualización periódica ---------- */
  setInterval(actualizarTodo, 3000);

  await actualizarTodo();
});
