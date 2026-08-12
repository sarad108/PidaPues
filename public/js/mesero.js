// =========================================
// PidaPues — mesero.js
// El mesero ve los pedidos que cocina marcó como "listo" y los
// entrega en la mesa. Al confirmar la entrega, la mesa se libera.
// =========================================

document.addEventListener("DOMContentLoaded", async () => {

  await PidaPuesAuth.exigirAcceso("mesero", "Mesero");
  await PidaPuesDatos.listo;

  const grilla = document.getElementById("grillaPedidos");
  const estadoVacio = document.getElementById("estadoVacioPedidos");
  const toastContenedor = document.getElementById("toastContenedor");
  const avisoConexion = document.getElementById("avisoConexion");
  const avisoConexionDetalle = document.getElementById("avisoConexionDetalle");

  function mostrarAvisoConexion(error) {
    avisoConexionDetalle.textContent = error && error.message ? `(${error.message})` : "";
    avisoConexion.hidden = false;
  }
  function ocultarAvisoConexion() {
    avisoConexion.hidden = true;
  }

  let idsConocidos = new Set();

  function escaparHtml(texto) {
    const div = document.createElement("div");
    div.textContent = texto;
    return div.innerHTML;
  }

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

  function mostrarToast(pedido) {
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.innerHTML = `🔔 Pedido <b>#${pedido.id}</b> listo para llevar a la Mesa ${pedido.mesa}`;
    toastContenedor.appendChild(toast);
    setTimeout(() => toast.remove(), 5000);
  }

  async function renderizarPedidos() {
    const lista = await PidaPuesDatos.obtenerPedidos("mesero");
    lista.sort((a, b) => new Date(a.fechaHoraListo) - new Date(b.fechaHoraListo));

    // Avisa (toast) de los pedidos que se volvieron "listo" desde la última revisión
    lista.forEach((p) => {
      if (!idsConocidos.has(p.id)) mostrarToast(p);
    });
    idsConocidos = new Set(lista.map((p) => p.id));

    grilla.innerHTML = "";
    estadoVacio.hidden = lista.length !== 0;
    grilla.hidden = lista.length === 0;

    lista.forEach((pedido) => {
      const tarjeta = document.createElement("article");
      tarjeta.className = "tarjeta-pedido";
      tarjeta.dataset.estado = pedido.estado;
      tarjeta.innerHTML = `
        <div class="pedido-encabezado">
          <span class="pedido-numero">#${pedido.id}</span>
          <span class="pedido-mesa">Mesa ${pedido.mesa}</span>
        </div>
        <div class="pedido-meta">
          <span>🔔 Listo desde ${PidaPuesDatos.formatoHora(pedido.fechaHoraListo)}</span>
        </div>
        <ul class="pedido-items">${resumenItems(pedido)}</ul>
        <div class="pedido-pie">
          <span class="pedido-total">${PidaPuesDatos.formatoPesos(pedido.total)}</span>
          <span class="badge-estado listo">Listo</span>
        </div>
        <button class="btn-avanzar-estado" data-id="${pedido.id}">🍽️ Marcar como entregado</button>
      `;
      grilla.appendChild(tarjeta);
    });

    grilla.querySelectorAll(".btn-avanzar-estado").forEach((btn) => {
      btn.addEventListener("click", async () => {
        btn.disabled = true;
        btn.textContent = "Entregando…";
        try {
          await PidaPuesDatos.marcarEntregado(Number(btn.dataset.id));
        } catch (error) {
          alert(error.message || "No se pudo confirmar la entrega.");
        }
        actualizarTodo();
      });
    });
  }

  async function actualizarTodo() {
    try {
      await renderizarPedidos();
      ocultarAvisoConexion();
    } catch (error) {
      console.error("Error consultando pedidos en mesero:", error);
      mostrarAvisoConexion(error);
    }
  }

  setInterval(actualizarTodo, 3000);
  await actualizarTodo();
});
