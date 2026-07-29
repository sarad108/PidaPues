// =========================================
// PidaPues — cocina.js
// Vista de cocina: pedidos en vivo, cambio de estado (RF003, RF004)
// y notificación de pago confirmado (RF007)
// =========================================

document.addEventListener("DOMContentLoaded", () => {

  const ORDEN_ESTADOS = ["pendiente", "en_preparacion", "listo", "entregado"];
  const SIGUIENTE_ESTADO = {
    pendiente: "en_preparacion",
    en_preparacion: "listo",
    listo: "entregado",
  };
  const TEXTO_BOTON = {
    pendiente: "Iniciar preparación",
    en_preparacion: "Marcar como listo",
    listo: "Marcar como entregado",
    entregado: null,
  };
  const ETIQUETA_ESTADO = {
    pendiente: "Pendiente",
    en_preparacion: "En preparación",
    listo: "Listo",
    entregado: "Entregado",
  };

  let filtroActivo = "todos";

  const grilla = document.getElementById("grillaPedidos");
  const estadoVacio = document.getElementById("estadoVacioPedidos");
  const filtrosEstado = document.getElementById("filtrosEstado");
  const toastContenedor = document.getElementById("toastContenedor");

  function resumenItems(pedido) {
    return pedido.items.map((i) => {
      const producto = PidaPuesDatos.obtenerProducto(i.productoId);
      const nombre = producto ? producto.nombre : "Producto";
      const obs = i.observacion
        ? `<span class="pedido-item-obs">📝 ${escaparHtml(i.observacion)}</span>`
        : "";
      return `<li class="pedido-item"><b>${i.cantidad}×</b> ${escaparHtml(nombre)}${obs}</li>`;
    }).join("");
  }

  function escaparHtml(texto) {
    const div = document.createElement("div");
    div.textContent = texto;
    return div.innerHTML;
  }

  function pedidosFiltrados() {
    const pedidos = PidaPuesDatos.obtenerPedidos()
      .slice()
      .sort((a, b) => new Date(a.fechaHoraRegistro) - new Date(b.fechaHoraRegistro));
    if (filtroActivo === "todos") return pedidos;
    return pedidos.filter((p) => p.estado === filtroActivo);
  }

  function renderizarPedidos() {
    const lista = pedidosFiltrados();
    grilla.innerHTML = "";
    estadoVacio.hidden = lista.length !== 0;
    grilla.hidden = lista.length === 0;

    lista.forEach((pedido) => {
      const siguienteEstado = SIGUIENTE_ESTADO[pedido.estado];
      const textoBoton = TEXTO_BOTON[pedido.estado];

      const tarjeta = document.createElement("article");
      tarjeta.className = "tarjeta-pedido";
      tarjeta.dataset.estado = pedido.estado;
      tarjeta.innerHTML = `
        <div class="pedido-encabezado">
          <span class="pedido-numero">#${pedido.id}</span>
          <span class="pedido-mesa">Mesa ${pedido.mesa}</span>
        </div>
        <div class="pedido-meta">
          <span>🕒 ${PidaPuesDatos.formatoHora(pedido.fechaHoraRegistro)}</span>
          <span class="pedido-pago">${pedido.pagado ? "✅ Pagado" : "⏳ Sin pagar"} (${pedido.metodoPago || "—"})</span>
        </div>
        <ul class="pedido-items">${resumenItems(pedido)}</ul>
        <div class="pedido-pie">
          <span class="pedido-total">${PidaPuesDatos.formatoPesos(pedido.total)}</span>
          <span class="badge-estado ${pedido.estado}">${ETIQUETA_ESTADO[pedido.estado]}</span>
        </div>
        ${textoBoton ? `<button class="btn-avanzar-estado" data-id="${pedido.id}" data-siguiente="${siguienteEstado}">${textoBoton}</button>` : ""}
      `;
      grilla.appendChild(tarjeta);
    });

    grilla.querySelectorAll(".btn-avanzar-estado").forEach((btn) => {
      btn.addEventListener("click", () => {
        PidaPuesDatos.actualizarEstadoPedido(Number(btn.dataset.id), btn.dataset.siguiente);
        renderizarPedidos();
      });
    });
  }

  /* ---------- Notificación de pago confirmado (RF007) ---------- */
  function mostrarToast(pedido) {
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.innerHTML = `💰 Pago confirmado — Pedido <b>#${pedido.id}</b> · Mesa ${pedido.mesa}`;
    toastContenedor.appendChild(toast);
    setTimeout(() => toast.remove(), 5000);
  }

  function revisarNotificacionesPendientes() {
    const pedidos = PidaPuesDatos.obtenerPedidos();
    pedidos.forEach((pedido) => {
      if (pedido.pagado && !pedido.notificadoCocina) {
        mostrarToast(pedido);
        PidaPuesDatos.marcarNotificado(pedido.id);
      }
    });
  }

  /* ---------- Filtros ---------- */
  filtrosEstado.addEventListener("click", (e) => {
    const boton = e.target.closest(".filtro-estado");
    if (!boton) return;
    filtrosEstado.querySelectorAll(".filtro-estado").forEach((b) => b.classList.remove("activo"));
    boton.classList.add("activo");
    filtroActivo = boton.dataset.estado;
    renderizarPedidos();
  });

  /* ---------- Actualización en vivo ---------- */
  window.addEventListener("storage", () => {
    revisarNotificacionesPendientes();
    renderizarPedidos();
  });

  setInterval(() => {
    revisarNotificacionesPendientes();
    renderizarPedidos();
  }, 3000);

  /* ---------- Arranque ---------- */
  revisarNotificacionesPendientes();
  renderizarPedidos();
});
