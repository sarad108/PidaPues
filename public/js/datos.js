// =========================================
// PidaPues — datos.js
// Cliente de la API REST (Express + MySQL). Reemplaza la versión
// anterior basada en localStorage: ahora todos los datos viven en
// el servidor, así que Cliente, Cocina, Mesero y Administración ven
// siempre la misma información sin importar el dispositivo.
// =========================================

const PidaPuesDatos = (() => {

  const API_BASE = "/api";
  const TOTAL_MESAS = 8;

  let productosCache = [];
  let datosNegocioCache = null;

  /* ---------- Utilidad de peticiones ---------- */
  async function solicitar(ruta, opciones) {
    const encabezadosAuth = window.PidaPuesAuth ? window.PidaPuesAuth.encabezadosAuth() : {};
    const respuesta = await fetch(API_BASE + ruta, {
      headers: { "Content-Type": "application/json", ...encabezadosAuth },
      ...opciones,
    });
    let cuerpo = null;
    try {
      cuerpo = await respuesta.json();
    } catch {
      cuerpo = null;
    }
    if (respuesta.status === 401 && window.PidaPuesAuth) {
      // La sesión expiró o el token no es válido: pedimos el PIN de nuevo.
      window.PidaPuesAuth.cerrarSesion();
      location.reload();
    }
    if (!respuesta.ok) {
      const error = new Error((cuerpo && cuerpo.error) || "Error de comunicación con el servidor.");
      error.status = respuesta.status;
      error.datos = cuerpo;
      throw error;
    }
    return cuerpo;
  }

  /* ---------- Arranque: carga catálogo y datos del negocio ----------
     Todas las pantallas deben esperar `await PidaPuesDatos.listo`
     antes de usar `productos` u `obtenerProducto`, que funcionan de
     forma síncrona a partir de este caché. */
  const listo = (async () => {
    const [productos, negocio] = await Promise.all([
      solicitar("/productos"),
      solicitar("/negocio"),
    ]);
    productosCache = productos;
    datosNegocioCache = negocio;
  })();

  function obtenerProducto(id) {
    return productosCache.find((p) => p.id === Number(id)) || null;
  }

  /* ---------- Pedidos ---------- */
  // rol: "cliente" | "cocina" | "mesero" | "admin" (admin = por defecto, ve todo)
  function obtenerPedidos(rol) {
    const query = rol ? `?rol=${encodeURIComponent(rol)}` : "";
    return solicitar(`/pedidos${query}`);
  }

  function obtenerPedido(id) {
    return solicitar(`/pedidos/${id}`).catch((error) => {
      if (error.status === 404) return null;
      throw error;
    });
  }

  // items: [{ productoId, cantidad, observacion }]
  // Crea el pedido en estado "pendiente_pago": el servidor genera un
  // código de verificación y NO lo marca como pagado todavía, por lo
  // que aún no es visible para cocina.
  function crearPedido({ mesa, items, metodoPago, datosFactura }) {
    return solicitar("/pedidos", {
      method: "POST",
      body: JSON.stringify({ mesa, items, metodoPago, datosFactura }),
    });
  }

  // Verificación segura del pago: el código solo lo valida el servidor.
  function verificarPago(id, codigo) {
    return solicitar(`/pedidos/${id}/verificar-pago`, {
      method: "POST",
      body: JSON.stringify({ codigo }),
    });
  }

  function reenviarCodigoVerificacion(id) {
    return solicitar(`/pedidos/${id}/reenviar-codigo`, { method: "POST" });
  }

  // Cocina: pendiente -> en_preparacion -> listo
  function actualizarEstadoCocina(id, estado) {
    return solicitar(`/pedidos/${id}/cocina`, {
      method: "PATCH",
      body: JSON.stringify({ estado }),
    });
  }

  // Mesero: listo -> entregado (libera la mesa)
  function marcarEntregado(id) {
    return solicitar(`/pedidos/${id}/entregar`, { method: "PATCH" });
  }

  function marcarNotificado(id) {
    return solicitar(`/pedidos/${id}/notificado`, { method: "POST" });
  }

  /* ---------- Mesas ----------
     La liberación automática por 30 min de inactividad corre en el
     servidor (en cada consulta y con un monitor cada minuto), así
     que aquí solo consultamos el estado actual. */
  function obtenerMesas() {
    return solicitar("/mesas");
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
    return solicitar("/demo", { method: "DELETE" });
  }

  return {
    listo,
    get productos() { return productosCache; },
    get datosNegocio() { return datosNegocioCache; },
    obtenerProducto,
    obtenerPedidos,
    obtenerPedido,
    crearPedido,
    verificarPago,
    reenviarCodigoVerificacion,
    actualizarEstadoCocina,
    marcarEntregado,
    marcarNotificado,
    obtenerMesas,
    formatoPesos,
    formatoHora,
    formatoFechaHora,
    minutosEntre,
    limpiarDatosDemo,
    TOTAL_MESAS,
  };
})();
