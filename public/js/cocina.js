// =========================================
// PidaPues — cocina.js
// Vista de cocina: pedidos pagados en vivo, cambio de estado
// (pendiente -> en_preparacion -> listo) y notificación de pago
// confirmado. La entrega en mesa la hace el módulo de Mesero.
// =========================================

document.addEventListener("DOMContentLoaded", async () => {

  await PidaPuesAuth.exigirAcceso("cocina", "Cocina");
  await PidaPuesDatos.listo;

  const SIGUIENTE_ESTADO = {
    pendiente: "en_preparacion",
    en_preparacion: "listo",
  };
  const TEXTO_BOTON = {
    pendiente: "Iniciar preparación",
    en_preparacion: "Marcar como listo",
    listo: null, // a partir de aquí, lo entrega el mesero
  };
  const ETIQUETA_ESTADO = {
    pendiente: "Pendiente",
    en_preparacion: "En preparación",
    listo: "Listo para entregar",
  };

  let filtroActivo = "todos";

  const grilla = document.getElementById("grillaPedidos");
  const estadoVacio = document.getElementById("estadoVacioPedidos");
  const filtrosEstado = document.getElementById("filtrosEstado");
  const toastContenedor = document.getElementById("toastContenedor");
  const avisoConexion = document.getElementById("avisoConexion");
  const avisoConexionDetalle = document.getElementById("avisoConexionDetalle");

  // Antes, si esta petición fallaba (servidor caído, sesión expirada,
  // red intermitente) la pantalla se quedaba en blanco sin explicación.
  // Ahora se muestra un aviso visible y se sigue reintentando solo.
  function mostrarAvisoConexion(error) {
    avisoConexionDetalle.textContent = error && error.message ? `(${error.message})` : "";
    avisoConexion.hidden = false;
  }
  function ocultarAvisoConexion() {
    avisoConexion.hidden = true;
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

  const ETIQUETA_METODO_PAGO = { efectivo: "Efectivo", tarjeta: "Tarjeta", qr: "QR" };

  function escaparHtml(texto) {
    const div = document.createElement("div");
    div.textContent = texto;
    return div.innerHTML;
  }

  async function pedidosFiltrados() {
    // El servidor ya solo devuelve pedidos con pago verificado
    // (pendiente / en_preparacion / listo) para el rol "cocina".
    const pedidos = await PidaPuesDatos.obtenerPedidos("cocina");
    pedidos.sort((a, b) => new Date(a.fechaHoraRegistro) - new Date(b.fechaHoraRegistro));
    if (filtroActivo === "todos") return pedidos;
    return pedidos.filter((p) => p.estado === filtroActivo);
  }

  async function renderizarPedidos() {
    const lista = await pedidosFiltrados();
    grilla.innerHTML = "";
    estadoVacio.hidden = lista.length !== 0;
    grilla.closest(".tabla-envoltorio").hidden = lista.length === 0; // oculta la tabla completa si no hay filas

    lista.forEach((pedido) => {
      const siguienteEstado = SIGUIENTE_ESTADO[pedido.estado];
      const textoBoton = TEXTO_BOTON[pedido.estado];

      const fila = document.createElement("tr");
      fila.dataset.estado = pedido.estado;
      fila.innerHTML = `
        <td><b>#${pedido.id}</b></td>
        <td>Mesa ${pedido.mesa}</td>
        <td>🕒 ${PidaPuesDatos.formatoHora(pedido.fechaHoraRegistro)}</td>
        <td class="celda-productos"><ul class="pedido-items">${resumenItems(pedido)}</ul></td>
        <td>✅ ${ETIQUETA_METODO_PAGO[pedido.metodoPago] || pedido.metodoPago || "—"}</td>
        <td>${PidaPuesDatos.formatoPesos(pedido.total)}</td>
        <td><span class="pill-estado ${pedido.estado}">${ETIQUETA_ESTADO[pedido.estado]}</span></td>
        <td>
          ${textoBoton
            ? `<button class="btn-avanzar-fila" data-id="${pedido.id}" data-siguiente="${siguienteEstado}">${textoBoton}</button>`
            : `<span class="pedido-en-espera">👤 Esperando al mesero</span>`}
        </td>
      `;
      grilla.appendChild(fila);
    });

    grilla.querySelectorAll(".btn-avanzar-fila").forEach((btn) => {
      btn.addEventListener("click", async () => {
        btn.disabled = true;
        try {
          await PidaPuesDatos.actualizarEstadoCocina(Number(btn.dataset.id), btn.dataset.siguiente);
        } catch (error) {
          alert(error.message || "No se pudo actualizar el pedido.");
        }
        actualizarTodo();
      });
    });
  }

  /* ---------- Notificación de pago confirmado ---------- */
  function mostrarToast(pedido) {
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.innerHTML = `💰 Pago confirmado — Pedido <b>#${pedido.id}</b> · Mesa ${pedido.mesa}`;
    toastContenedor.appendChild(toast);
    setTimeout(() => toast.remove(), 5000);
  }

  async function revisarNotificacionesPendientes() {
    const pedidos = await PidaPuesDatos.obtenerPedidos("cocina");
    for (const pedido of pedidos) {
      if (pedido.pagado && !pedido.notificadoCocina) {
        mostrarToast(pedido);
        await PidaPuesDatos.marcarNotificado(pedido.id);
      }
    }
  }

  /* ---------- Filtros ---------- */
  filtrosEstado.addEventListener("click", (e) => {
    const boton = e.target.closest(".filtro-estado");
    if (!boton) return;
    filtrosEstado.querySelectorAll(".filtro-estado").forEach((b) => b.classList.remove("activo"));
    boton.classList.add("activo");
    filtroActivo = boton.dataset.estado;
    actualizarTodo();
  });

  /* ---------- Actualización periódica (varias cocinas/pantallas a la vez) ---------- */
  async function actualizarTodo() {
    try {
      await revisarNotificacionesPendientes();
      await renderizarPedidos();
      ocultarAvisoConexion();
    } catch (error) {
      console.error("Error consultando pedidos en cocina:", error);
      mostrarAvisoConexion(error);
    }
  }

  setInterval(actualizarTodo, 3000);

  /* ---------- Arranque ---------- */
  await actualizarTodo();
});
