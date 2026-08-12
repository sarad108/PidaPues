// =========================================
// PidaPues — menu.js
// Productos, búsqueda, carrito, pedido, pago y seguimiento en vivo
// =========================================

document.addEventListener("DOMContentLoaded", async () => {

  await PidaPuesDatos.listo;

  /* ---------- 1. Datos ---------- */
  const productos = PidaPuesDatos.productos;

  /* ---------- 2. Estado ---------- */
  const CLAVE_CARRITO = "pidapues_carrito";
  const CLAVE_PEDIDO_PENDIENTE = "pidapues_pedido_pendiente";
  const CLAVE_PEDIDO_ACTIVO = "pidapues_pedido_activo";
  let carrito = cargarCarrito();          // [{id, cantidad, observacion}, ...]
  let categoriaActiva = "todos";
  let textoBusqueda = "";
  let pedidoActivoId = null;
  let temporizadorSeguimiento = null;

  /* ---------- 3. Referencias al DOM ---------- */
  const grilla = document.getElementById("grillaProductos");
  const estadoVacio = document.getElementById("estadoVacio");
  const campoBuscar = document.getElementById("campoBuscar");
  const categoriasNav = document.getElementById("categorias");

  const carritoLista = document.getElementById("carritoLista");
  const carritoVacio = document.getElementById("carritoVacio");
  const carritoResumen = document.getElementById("carritoResumen");
  const carritoConfirmado = document.getElementById("carritoConfirmado");
  const carritoSubtotal = document.getElementById("carritoSubtotal");
  const carritoTotal = document.getElementById("carritoTotal");
  const numeroPedido = document.getElementById("numeroPedido");
  const mesaConfirmada = document.getElementById("mesaConfirmada");
  const seguimiento = document.getElementById("seguimiento");

  const campoMesa = document.getElementById("campoMesa");
  const errorConfirmar = document.getElementById("errorConfirmar");
  const btnVerFactura = document.getElementById("btnVerFactura");
  const modalFactura = document.getElementById("modalFactura");
  const modalFacturaFondo = document.getElementById("modalFacturaFondo");
  const modalFacturaContenido = document.getElementById("modalFacturaContenido");

  const panelCarrito = document.getElementById("panelCarrito");
  const superposicion = document.getElementById("superposicion");
  const btnAbrirCarrito = document.getElementById("btnAbrirCarrito");
  const btnCerrarCarrito = document.getElementById("btnCerrarCarrito");
  const badgeCarrito = document.getElementById("badgeCarrito");
  const fabCarrito = document.getElementById("fabCarrito");
  const fabTotal = document.getElementById("fabTotal");
  const btnConfirmar = document.getElementById("btnConfirmar");
  const btnNuevoPedido = document.getElementById("btnNuevoPedido");

  /* ---------- 4. Utilidades ---------- */
  const formatoPesos = PidaPuesDatos.formatoPesos;

  function cargarCarrito() {
    try {
      const guardado = localStorage.getItem(CLAVE_CARRITO);
      return guardado ? JSON.parse(guardado) : [];
    } catch {
      return [];
    }
  }

  function guardarCarrito() {
    try {
      localStorage.setItem(CLAVE_CARRITO, JSON.stringify(carrito));
    } catch {
      /* almacenamiento no disponible: seguimos sin persistir */
    }
  }

  /* ---------- 5. Render de productos ---------- */

  // Si el producto tiene foto, la muestra; si no existe o falla al cargar,
  // cae automáticamente al emoji (así el menú nunca se ve roto).
  function imagenONEmoji(p) {
    if (!p.imagenUrl) return p.emoji;
    return `<img src="${p.imagenUrl}" alt="${p.nombre}" loading="lazy"
                 onerror="this.replaceWith(Object.assign(document.createElement('span'), { textContent: '${p.emoji}' }))" />`;
  }

  function productosFiltrados() {
    return productos.filter((p) => {
      const coincideCategoria = categoriaActiva === "todos" || p.categoria === categoriaActiva;
      const coincideTexto = p.nombre.toLowerCase().includes(textoBusqueda) ||
                             p.descripcion.toLowerCase().includes(textoBusqueda);
      return coincideCategoria && coincideTexto;
    });
  }

  function renderizarProductos() {
    const lista = productosFiltrados();
    grilla.innerHTML = "";

    estadoVacio.hidden = lista.length !== 0;
    grilla.hidden = lista.length === 0;

    lista.forEach((p) => {
      const tarjeta = document.createElement("article");
      tarjeta.className = "tarjeta";
      tarjeta.innerHTML = `
        <div class="tarjeta-imagen">${imagenONEmoji(p)}</div>
        <h3 class="tarjeta-nombre">${p.nombre}</h3>
        <p class="tarjeta-descripcion">${p.descripcion}</p>
        <div class="tarjeta-pie">
          <span class="tarjeta-precio">${formatoPesos(p.precio)}</span>
          <button class="btn-agregar" data-id="${p.id}">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 5V19M5 12H19" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>
            </svg>
            Agregar
          </button>
        </div>
      `;
      grilla.appendChild(tarjeta);
    });

    // Conectar botones "Agregar"
    grilla.querySelectorAll(".btn-agregar").forEach((btn) => {
      btn.addEventListener("click", () => agregarAlCarrito(Number(btn.dataset.id), btn));
    });
  }

  /* ---------- 6. Lógica del carrito ---------- */
  function agregarAlCarrito(id, boton) {
    const item = carrito.find((i) => i.id === id);
    if (item) {
      item.cantidad += 1;
    } else {
      carrito.push({ id, cantidad: 1, observacion: "" });
    }
    guardarCarrito();
    renderizarCarrito();

    // Micro-feedback en el botón
    if (boton) {
      const textoOriginal = boton.innerHTML;
      boton.classList.add("agregado");
      boton.innerHTML = "✓ Agregado";
      setTimeout(() => {
        boton.classList.remove("agregado");
        boton.innerHTML = textoOriginal;
      }, 900);
    }
  }

  function cambiarCantidad(id, delta) {
    const item = carrito.find((i) => i.id === id);
    if (!item) return;
    item.cantidad += delta;
    if (item.cantidad <= 0) {
      carrito = carrito.filter((i) => i.id !== id);
    }
    guardarCarrito();
    renderizarCarrito();
  }

  function actualizarObservacion(id, texto) {
    const item = carrito.find((i) => i.id === id);
    if (!item) return;
    item.observacion = texto;
    guardarCarrito();
  }

  function totalCarrito() {
    return carrito.reduce((suma, i) => {
      const producto = PidaPuesDatos.obtenerProducto(i.id);
      return suma + (producto ? producto.precio * i.cantidad : 0);
    }, 0);
  }

  function cantidadTotalItems() {
    return carrito.reduce((suma, i) => suma + i.cantidad, 0);
  }

  function renderizarCarrito() {
    const hayItems = carrito.length > 0;

    carritoVacio.hidden = hayItems;
    carritoResumen.hidden = !hayItems;

    // Limpiar items previos (dejando el bloque "vacío" intacto en el DOM)
    carritoLista.querySelectorAll(".item-carrito").forEach((el) => el.remove());

    carrito.forEach((i) => {
      const producto = PidaPuesDatos.obtenerProducto(i.id);
      if (!producto) return;

      const fila = document.createElement("div");
      fila.className = "item-carrito";
      fila.innerHTML = `
        <div class="item-emoji">${imagenONEmoji(producto)}</div>
        <div class="item-info">
          <div class="item-nombre">${producto.nombre}</div>
          <div class="item-precio-unidad">${formatoPesos(producto.precio)} c/u</div>
          <input
            type="text"
            class="item-observacion"
            data-id="${producto.id}"
            placeholder="Observación (ej: sin cebolla)"
            value="${i.observacion ? i.observacion.replace(/"/g, "&quot;") : ""}"
            maxlength="80"
          />
        </div>
        <div class="item-controles">
          <button class="btn-cantidad" data-accion="restar" data-id="${producto.id}" aria-label="Quitar uno">−</button>
          <span class="item-cantidad">${i.cantidad}</span>
          <button class="btn-cantidad" data-accion="sumar" data-id="${producto.id}" aria-label="Agregar uno">+</button>
        </div>
        <div class="item-subtotal">${formatoPesos(producto.precio * i.cantidad)}</div>
      `;
      carritoLista.appendChild(fila);
    });

    // Conectar botones +/-
    carritoLista.querySelectorAll(".btn-cantidad").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = Number(btn.dataset.id);
        const delta = btn.dataset.accion === "sumar" ? 1 : -1;
        cambiarCantidad(id, delta);
      });
    });

    // Conectar observaciones (RF001: observaciones opcionales)
    carritoLista.querySelectorAll(".item-observacion").forEach((input) => {
      input.addEventListener("input", () => {
        actualizarObservacion(Number(input.dataset.id), input.value);
      });
    });

    const total = totalCarrito();
    carritoSubtotal.textContent = formatoPesos(total);
    carritoTotal.textContent = formatoPesos(total);

    // Badge y FAB (móvil)
    const totalItems = cantidadTotalItems();
    if (totalItems > 0) {
      badgeCarrito.hidden = false;
      badgeCarrito.textContent = totalItems;
      fabCarrito.hidden = false;
      fabTotal.textContent = formatoPesos(total);
    } else {
      badgeCarrito.hidden = true;
      fabCarrito.hidden = true;
    }
  }

  /* ---------- 7. Validación previa ---------- */
  function mostrarError(mensaje) {
    errorConfirmar.textContent = mensaje;
    errorConfirmar.hidden = false;
  }

  function ocultarError() {
    errorConfirmar.hidden = true;
  }

  /* ---------- 8. Ir al módulo de pago (RF001, RF006, RF007) ----------
     El pedido NO se crea aquí. Solo se guarda como "pendiente de pago"
     y se redirige a pago.html, donde se verifica el pago (con QR
     simulado y factura) antes de enviarlo a cocina. */
  function irAPagar() {
    if (carrito.length === 0) return;

    const mesa = Number(campoMesa.value);
    if (!mesa || mesa < 1 || mesa > PidaPuesDatos.TOTAL_MESAS) {
      mostrarError(`Ingresa un número de mesa válido (1 a ${PidaPuesDatos.TOTAL_MESAS}).`);
      campoMesa.focus();
      return;
    }
    ocultarError();

    const items = carrito.map((i) => ({
      productoId: i.id,
      cantidad: i.cantidad,
      observacion: i.observacion || "",
    }));

    const pedidoPendiente = { mesa, items };

    try {
      localStorage.setItem(CLAVE_PEDIDO_PENDIENTE, JSON.stringify(pedidoPendiente));
    } catch {
      mostrarError("No se pudo continuar al pago. Intenta de nuevo.");
      return;
    }

    window.location.href = "pago.html";
  }

  /* ---------- 8b. Mostrar confirmación si venimos de un pago verificado ---------- */
  async function revisarPedidoRecienPagado() {
    let idGuardado = null;
    try {
      idGuardado = localStorage.getItem(CLAVE_PEDIDO_ACTIVO);
    } catch {
      idGuardado = null;
    }
    if (!idGuardado) return;

    const pedido = await PidaPuesDatos.obtenerPedido(Number(idGuardado));
    if (!pedido) return;

    pedidoActivoId = pedido.id;
    numeroPedido.textContent = "#" + pedido.id;
    mesaConfirmada.textContent = pedido.mesa;

    carritoResumen.hidden = true;
    carritoLista.hidden = true;
    carritoConfirmado.hidden = false;

    actualizarPasosSeguimiento(pedido.estado);
    iniciarSeguimientoEnVivo();

    carrito = [];
    guardarCarrito();
    badgeCarrito.hidden = true;
    fabCarrito.hidden = true;
  }

  /* ---------- 8c. Factura del pedido activo ---------- */
  async function abrirModalFactura() {
    if (!pedidoActivoId) return;
    const pedido = await PidaPuesDatos.obtenerPedido(pedidoActivoId);
    if (!pedido) return;
    modalFacturaContenido.innerHTML = PidaPuesFactura.renderizarHTML(pedido) +
      `<button class="btn-cerrar-factura" id="btnCerrarFactura">Cerrar</button>`;
    modalFactura.hidden = false;
    document.getElementById("btnCerrarFactura").addEventListener("click", cerrarModalFactura);
  }

  function cerrarModalFactura() {
    modalFactura.hidden = true;
  }

  /* ---------- 9. Seguimiento en vivo del pedido (RF005) ---------- */
  const ORDEN_ESTADOS = ["pendiente", "en_preparacion", "listo", "entregado"];

  function actualizarPasosSeguimiento(estadoActual) {
    const indiceActual = ORDEN_ESTADOS.indexOf(estadoActual);
    seguimiento.querySelectorAll(".seguimiento-paso").forEach((paso) => {
      const indicePaso = ORDEN_ESTADOS.indexOf(paso.dataset.estado);
      paso.classList.toggle("completado", indicePaso < indiceActual);
      paso.classList.toggle("activo", indicePaso === indiceActual);
    });
  }

  function iniciarSeguimientoEnVivo() {
    detenerSeguimientoEnVivo();
    temporizadorSeguimiento = setInterval(async () => {
      if (!pedidoActivoId) return;
      const pedido = await PidaPuesDatos.obtenerPedido(pedidoActivoId);
      if (pedido) actualizarPasosSeguimiento(pedido.estado);
    }, 1500);
  }

  function detenerSeguimientoEnVivo() {
    if (temporizadorSeguimiento) clearInterval(temporizadorSeguimiento);
    temporizadorSeguimiento = null;
  }

  function iniciarNuevoPedido() {
    detenerSeguimientoEnVivo();
    pedidoActivoId = null;
    try {
      localStorage.removeItem(CLAVE_PEDIDO_ACTIVO);
    } catch { /* almacenamiento no disponible */ }
    campoMesa.value = "";
    carritoConfirmado.hidden = true;
    carritoLista.hidden = false;
    renderizarCarrito();
    cerrarCarritoMovil();
  }

  /* ---------- 10. Apertura/cierre del panel en móvil ---------- */
  function abrirCarritoMovil() {
    panelCarrito.classList.add("abierto");
    superposicion.classList.add("visible");
  }

  function cerrarCarritoMovil() {
    panelCarrito.classList.remove("abierto");
    superposicion.classList.remove("visible");
  }

  /* ---------- 11. Eventos ---------- */
  campoBuscar.addEventListener("input", (e) => {
    textoBusqueda = e.target.value.trim().toLowerCase();
    renderizarProductos();
  });

  categoriasNav.addEventListener("click", (e) => {
    const boton = e.target.closest(".categoria");
    if (!boton) return;
    categoriasNav.querySelectorAll(".categoria").forEach((b) => b.classList.remove("activa"));
    boton.classList.add("activa");
    categoriaActiva = boton.dataset.categoria;
    renderizarProductos();
  });

  btnAbrirCarrito.addEventListener("click", abrirCarritoMovil);
  fabCarrito.addEventListener("click", abrirCarritoMovil);
  btnCerrarCarrito.addEventListener("click", cerrarCarritoMovil);
  superposicion.addEventListener("click", cerrarCarritoMovil);

  btnConfirmar.addEventListener("click", irAPagar);
  btnNuevoPedido.addEventListener("click", iniciarNuevoPedido);
  btnVerFactura.addEventListener("click", abrirModalFactura);
  modalFacturaFondo.addEventListener("click", cerrarModalFactura);

  /* ---------- 12. Arranque ---------- */
  renderizarProductos();
  renderizarCarrito();
  await revisarPedidoRecienPagado();
});
