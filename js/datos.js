// =========================================
// PidaPues — datos.js
// Capa de datos compartida entre Cliente, Cocina y Administración.
// Simula la persistencia en base de datos (RF001-RF011) usando
// localStorage del navegador, para que las 3 pantallas del prototipo
// reflejen el mismo estado sin necesidad de un servidor.
// =========================================

const PidaPuesDatos = (() => {

  const CLAVE_PEDIDOS = "pidapues_pedidos";
  const CLAVE_MESAS = "pidapues_mesas";
  const CLAVE_CONTADOR = "pidapues_contador_pedido";
  const TOTAL_MESAS = 8;

  /* ---------- Catálogo de productos ---------- */
  const productos = [
    { id: 1, categoria: "comida", nombre: "Hamburguesa Clásica", descripcion: "Carne de res, queso cheddar, lechuga, tomate y salsa especial.", precio: 18000, emoji: "🍔" },
    { id: 2, categoria: "comida", nombre: "Pizza Pepperoni",     descripcion: "Masa artesanal, salsa de tomate, mozzarella y pepperoni.",     precio: 25000, emoji: "🍕" },
    { id: 3, categoria: "comida", nombre: "Salchipapa",          descripcion: "Papas a la francesa, salchicha, salsas y queso fundido.",       precio: 20000, emoji: "🍟" },
    { id: 4, categoria: "comida", nombre: "Perro Caliente",      descripcion: "Salchicha, papas hilo, salsas de la casa y queso rallado.",     precio: 15000, emoji: "🌭" },
    { id: 5, categoria: "comida", nombre: "Alitas BBQ",          descripcion: "8 alitas bañadas en salsa BBQ, acompañadas de papas.",         precio: 22000, emoji: "🍗" },
    { id: 6, categoria: "bebida", nombre: "Gaseosa 400ml",       descripcion: "A elegir: Cola, Manzana o Uva, bien fría.",                    precio: 5000,  emoji: "🥤" },
    { id: 7, categoria: "bebida", nombre: "Limonada Natural",    descripcion: "Limonada fresca de la casa, endulzada al gusto.",             precio: 6000,  emoji: "🍋" },
    { id: 8, categoria: "postre", nombre: "Brownie con Helado",  descripcion: "Brownie tibio de chocolate con bola de helado de vainilla.",   precio: 12000, emoji: "🍫" },
  ];

  /* ---------- Utilidades de almacenamiento ---------- */
  function leer(clave, porDefecto) {
    try {
      const guardado = localStorage.getItem(clave);
      return guardado ? JSON.parse(guardado) : porDefecto;
    } catch {
      return porDefecto;
    }
  }

  function escribir(clave, valor) {
    try {
      localStorage.setItem(clave, JSON.stringify(valor));
    } catch {
      /* almacenamiento no disponible: seguimos sin persistir */
    }
  }

  function obtenerProducto(id) {
    return productos.find((p) => p.id === id) || null;
  }

  /* ---------- Pedidos (RF001, RF003, RF004, RF005) ---------- */
  function obtenerPedidos() {
    return leer(CLAVE_PEDIDOS, []);
  }

  function guardarPedidos(pedidos) {
    escribir(CLAVE_PEDIDOS, pedidos);
  }

  function obtenerPedido(id) {
    return obtenerPedidos().find((p) => p.id === Number(id)) || null;
  }

  function siguienteIdPedido() {
    const actual = leer(CLAVE_CONTADOR, 1000);
    const siguiente = actual + 1;
    escribir(CLAVE_CONTADOR, siguiente);
    return siguiente;
  }

  // items: [{ productoId, cantidad, observacion }]
  function crearPedido({ mesa, items, metodoPago }) {
    const ahora = new Date().toISOString();
    const total = items.reduce((suma, i) => {
      const producto = obtenerProducto(i.productoId);
      return suma + (producto ? producto.precio * i.cantidad : 0);
    }, 0);

    const pedido = {
      id: siguienteIdPedido(),
      mesa: Number(mesa),
      items,
      total,
      estado: "pendiente", // pendiente -> en_preparacion -> listo -> entregado
      metodoPago,          // "efectivo" | "tarjeta" | "qr"
      pagado: true,        // en este prototipo el pago se valida al confirmar el pedido
      notificadoCocina: false,
      fechaHoraRegistro: ahora,
      fechaHoraPago: ahora,
      fechaHoraInicioPreparacion: null,
      fechaHoraListo: null,
      fechaHoraEntregado: null,
    };

    const pedidos = obtenerPedidos();
    pedidos.push(pedido);
    guardarPedidos(pedidos);

    if (pedido.mesa) actualizarEstadoMesa(pedido.mesa, "ocupada", pedido.id);

    return pedido;
  }

  function actualizarEstadoPedido(id, nuevoEstado) {
    const pedidos = obtenerPedidos();
    const pedido = pedidos.find((p) => p.id === Number(id));
    if (!pedido) return null;

    pedido.estado = nuevoEstado;
    const ahora = new Date().toISOString();

    if (nuevoEstado === "en_preparacion" && !pedido.fechaHoraInicioPreparacion) {
      pedido.fechaHoraInicioPreparacion = ahora;
    }
    if (nuevoEstado === "listo" && !pedido.fechaHoraListo) {
      pedido.fechaHoraListo = ahora;
    }
    if (nuevoEstado === "entregado" && !pedido.fechaHoraEntregado) {
      pedido.fechaHoraEntregado = ahora;
      if (pedido.mesa) actualizarEstadoMesa(pedido.mesa, "libre", null);
    }

    guardarPedidos(pedidos);
    return pedido;
  }

  function marcarNotificado(id) {
    const pedidos = obtenerPedidos();
    const pedido = pedidos.find((p) => p.id === Number(id));
    if (!pedido) return;
    pedido.notificadoCocina = true;
    guardarPedidos(pedidos);
  }

  /* ---------- Mesas (RF011) ---------- */
  function obtenerMesas() {
    let mesas = leer(CLAVE_MESAS, null);
    if (!mesas) {
      mesas = Array.from({ length: TOTAL_MESAS }, (_, i) => ({
        numero: i + 1,
        estado: "libre", // libre | ocupada | pago
        pedidoId: null,
      }));
      escribir(CLAVE_MESAS, mesas);
    }
    return mesas;
  }

  function actualizarEstadoMesa(numero, estado, pedidoId) {
    const mesas = obtenerMesas();
    const mesa = mesas.find((m) => m.numero === Number(numero));
    if (!mesa) return;
    mesa.estado = estado;
    mesa.pedidoId = pedidoId;
    escribir(CLAVE_MESAS, mesas);
  }

  /* ---------- Formato ---------- */
  function formatoPesos(valor) {
    return "$" + Number(valor || 0).toLocaleString("es-CO");
  }

  function formatoHora(iso) {
    if (!iso) return "—";
    return new Date(iso).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });
  }

  function formatoFechaHora(iso) {
    if (!iso) return "—";
    return new Date(iso).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" });
  }

  function minutosEntre(inicioIso, finIso) {
    if (!inicioIso || !finIso) return null;
    return Math.round((new Date(finIso) - new Date(inicioIso)) / 60000);
  }

  /* ---------- Demo ---------- */
  function limpiarDatosDemo() {
    localStorage.removeItem(CLAVE_PEDIDOS);
    localStorage.removeItem(CLAVE_MESAS);
    localStorage.removeItem(CLAVE_CONTADOR);
  }

  return {
    productos,
    obtenerProducto,
    obtenerPedidos,
    obtenerPedido,
    crearPedido,
    actualizarEstadoPedido,
    marcarNotificado,
    obtenerMesas,
    actualizarEstadoMesa,
    formatoPesos,
    formatoHora,
    formatoFechaHora,
    minutosEntre,
    limpiarDatosDemo,
    TOTAL_MESAS,
  };
})();
