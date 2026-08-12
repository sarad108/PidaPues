// =========================================
// PidaPues — pago.js
// Módulo de pago independiente. El pedido se crea en el servidor
// como "pendiente_pago" (NO llega a cocina) y solo pasa a pagado
// cuando el cliente confirma un código de un solo uso que el propio
// servidor generó y valida — nunca se confía en el navegador.
// =========================================

document.addEventListener("DOMContentLoaded", async () => {

  await PidaPuesDatos.listo;

  const CLAVE_PEDIDO_PENDIENTE = "pidapues_pedido_pendiente";
  const CLAVE_PEDIDO_ACTIVO = "pidapues_pedido_activo";

  let metodoSeleccionado = null;
  let pedidoPendiente = null;   // { mesa, items } — viene del menú
  let pedidoId = null;          // id asignado por el servidor al crear el pedido
  let pedidoVerificado = null;  // pedido completo, ya pagado (con factura)

  /* ---------- Referencias DOM ---------- */
  const pasosPago = document.getElementById("pasosPago");
  const avisoSinPedido = document.getElementById("avisoSinPedido");
  const tarjetaPago = document.getElementById("tarjetaPago");

  const resumenMesa = document.getElementById("resumenMesa");
  const resumenItems = document.getElementById("resumenItems");
  const resumenTotal = document.getElementById("resumenTotal");

  const bloqueMetodo = document.getElementById("bloqueMetodo");
  const opcionesPago = document.getElementById("opcionesPago");
  const campoNombreCliente = document.getElementById("campoNombreCliente");
  const errorPago = document.getElementById("errorPago");

  const bloqueDetallePago = document.getElementById("bloqueDetallePago");
  const detalleEfectivo = document.getElementById("detalleEfectivo");
  const detalleTarjeta = document.getElementById("detalleTarjeta");
  const detalleQr = document.getElementById("detalleQr");
  const cuentaReceptoraTarjeta = document.getElementById("cuentaReceptoraTarjeta");
  const cuentaReceptoraQr = document.getElementById("cuentaReceptoraQr");
  const qrCaja = document.getElementById("qrCaja");
  const qrMonto = document.getElementById("qrMonto");
  const btnContinuarVerificacion = document.getElementById("btnContinuarVerificacion");

  const bloqueVerificacion = document.getElementById("bloqueVerificacion");
  const panelBanco = document.getElementById("panelBanco");
  const codigoDemo = document.getElementById("codigoDemo");
  const campoCodigo = document.getElementById("campoCodigo");
  const intentosRestantesEl = document.getElementById("intentosRestantes");
  const errorVerificacion = document.getElementById("errorVerificacion");
  const btnVerificarCodigo = document.getElementById("btnVerificarCodigo");
  const btnReenviarCodigo = document.getElementById("btnReenviarCodigo");
  const pagoVerificando = document.getElementById("pagoVerificando");

  const bloqueVerificado = document.getElementById("bloqueVerificado");
  const facturaContenedor = document.getElementById("facturaContenedor");
  const btnEnviarCocina = document.getElementById("btnEnviarCocina");

  /* ---------- 1. Cargar el pedido pendiente de pago (viene del menú) ---------- */
  function cargarPedidoPendiente() {
    try {
      const guardado = localStorage.getItem(CLAVE_PEDIDO_PENDIENTE);
      return guardado ? JSON.parse(guardado) : null;
    } catch {
      return null;
    }
  }

  function totalPedidoPendiente() {
    return pedidoPendiente.items.reduce((suma, i) => {
      const producto = PidaPuesDatos.obtenerProducto(i.productoId);
      return suma + (producto ? producto.precio * i.cantidad : 0);
    }, 0);
  }

  function renderizarResumen() {
    resumenMesa.textContent = pedidoPendiente.mesa;
    resumenItems.innerHTML = pedidoPendiente.items.map((i) => {
      const producto = PidaPuesDatos.obtenerProducto(i.productoId);
      if (!producto) return "";
      return `<li><span>${i.cantidad}× ${producto.nombre}</span><span>${PidaPuesDatos.formatoPesos(producto.precio * i.cantidad)}</span></li>`;
    }).join("");
    const total = totalPedidoPendiente();
    resumenTotal.textContent = PidaPuesDatos.formatoPesos(total);
    qrMonto.textContent = PidaPuesDatos.formatoPesos(total);
  }

  function irAPaso(numero) {
    pasosPago.querySelectorAll(".paso-pago").forEach((li) => {
      const n = Number(li.dataset.paso);
      li.classList.toggle("activo", n === numero);
      li.classList.toggle("completado", n < numero);
    });
  }

  /* ---------- 2. Selección de método de pago ---------- */
  function mostrarError(mensaje) {
    errorPago.textContent = mensaje;
    errorPago.hidden = false;
  }

  function ocultarError() {
    errorPago.hidden = true;
  }

  function renderizarCuentaReceptora(contenedor) {
    const n = PidaPuesDatos.datosNegocio;
    contenedor.innerHTML = `
      <p class="cuenta-receptora-titulo">Datos para transferir</p>
      <p><b>Beneficiario:</b> ${n.titularCuenta}</p>
      <p><b>NIT:</b> ${n.nit}</p>
      <p><b>Banco:</b> ${n.banco}</p>
      <p><b>${n.tipoCuenta}:</b> ${n.numeroCuenta}</p>
    `;
  }

  // Genera un patrón visual tipo código QR (SVG). Es un QR simulado
  // para la demo: no codifica ninguna URL ni pasarela de pago real.
  function generarQrFalso(semilla) {
    const celdas = 21;
    const tam = 220;
    const paso = tam / celdas;
    let s = semilla;
    function azar() {
      s = (s * 9301 + 49297) % 233280;
      return s / 233280;
    }

    let cuadros = "";
    for (let f = 0; f < celdas; f++) {
      for (let c = 0; c < celdas; c++) {
        const enOjo =
          (f < 7 && c < 7) ||
          (f < 7 && c >= celdas - 7) ||
          (f >= celdas - 7 && c < 7);
        if (enOjo) continue;
        if (azar() > 0.55) {
          cuadros += `<rect x="${c * paso}" y="${f * paso}" width="${paso}" height="${paso}" />`;
        }
      }
    }

    function ojo(x, y) {
      return `
        <rect x="${x}" y="${y}" width="${7 * paso}" height="${7 * paso}" class="qr-ojo-externo" />
        <rect x="${x + paso}" y="${y + paso}" width="${5 * paso}" height="${5 * paso}" fill="#fff" />
        <rect x="${x + 2 * paso}" y="${y + 2 * paso}" width="${3 * paso}" height="${3 * paso}" class="qr-ojo-interno" />
      `;
    }

    return `
      <svg viewBox="0 0 ${tam} ${tam}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Código QR de pago simulado">
        <rect width="${tam}" height="${tam}" fill="#fff" />
        <g fill="#2B2118">${cuadros}</g>
        ${ojo(0, 0)}
        ${ojo(tam - 7 * paso, 0)}
        ${ojo(0, tam - 7 * paso)}
      </svg>
    `;
  }

  function mostrarDetalleMetodo(metodo) {
    bloqueDetallePago.hidden = false;
    detalleEfectivo.hidden = metodo !== "efectivo";
    detalleTarjeta.hidden = metodo !== "tarjeta";
    detalleQr.hidden = metodo !== "qr";

    if (metodo === "tarjeta") renderizarCuentaReceptora(cuentaReceptoraTarjeta);
    if (metodo === "qr") {
      renderizarCuentaReceptora(cuentaReceptoraQr);
      qrCaja.innerHTML = generarQrFalso(Date.now() % 100000);
    }
  }

  opcionesPago.addEventListener("click", (e) => {
    const boton = e.target.closest(".opcion-pago");
    if (!boton) return;
    metodoSeleccionado = boton.dataset.pago;
    opcionesPago.querySelectorAll(".opcion-pago").forEach((b) => b.classList.remove("activa"));
    boton.classList.add("activa");
    ocultarError();
    mostrarDetalleMetodo(metodoSeleccionado);
  });

  /* ---------- 3. Paso 1 -> 2: crear el pedido (pendiente_pago) ---------- */
  async function continuarAVerificacion() {
    if (!metodoSeleccionado) {
      mostrarError("Selecciona un método de pago para continuar.");
      return;
    }
    ocultarError();
    btnContinuarVerificacion.disabled = true;
    btnContinuarVerificacion.textContent = "Generando código seguro…";

    try {
      const nombreCliente = campoNombreCliente.value.trim();
      const { pedido, codigoVerificacionDemo } = await PidaPuesDatos.crearPedido({
        mesa: pedidoPendiente.mesa,
        items: pedidoPendiente.items,
        metodoPago: metodoSeleccionado,
        datosFactura: { nombreCliente },
      });

      pedidoId = pedido.id;
      mostrarCodigoDemo(codigoVerificacionDemo);

      bloqueMetodo.hidden = true;
      bloqueVerificacion.hidden = false;
      irAPaso(2);
      campoCodigo.value = "";
      campoCodigo.focus();
    } catch (error) {
      mostrarError(error.message || "No se pudo iniciar el pago. Intenta de nuevo.");
    } finally {
      btnContinuarVerificacion.disabled = false;
      btnContinuarVerificacion.textContent = "Continuar a verificación segura →";
    }
  }

  function mostrarCodigoDemo(codigo) {
    codigoDemo.textContent = codigo ? codigo.split("").join(" ") : "— — — — — —";
    intentosRestantesEl.textContent = "3";
    errorVerificacion.hidden = true;
    btnReenviarCodigo.hidden = true;
    btnVerificarCodigo.hidden = false;
    btnVerificarCodigo.disabled = false;
  }

  /* ---------- 4. Paso 2: verificar el código contra el servidor ---------- */
  async function verificarCodigo() {
    const codigo = campoCodigo.value.trim();
    if (codigo.length !== 6) {
      errorVerificacion.textContent = "Ingresa el código completo de 6 dígitos.";
      errorVerificacion.hidden = false;
      return;
    }
    errorVerificacion.hidden = true;
    btnVerificarCodigo.hidden = true;
    pagoVerificando.hidden = false;

    try {
      pedidoVerificado = await PidaPuesDatos.verificarPago(pedidoId, codigo);
      pagoVerificando.hidden = true;

      try {
        localStorage.removeItem(CLAVE_PEDIDO_PENDIENTE);
        localStorage.setItem(CLAVE_PEDIDO_ACTIVO, String(pedidoVerificado.id));
      } catch { /* almacenamiento no disponible */ }

      bloqueVerificacion.hidden = true;
      bloqueVerificado.hidden = false;
      irAPaso(3);
      facturaContenedor.innerHTML = PidaPuesFactura.renderizarHTML(pedidoVerificado);
    } catch (error) {
      pagoVerificando.hidden = true;
      btnVerificarCodigo.hidden = false;

      const datos = error.datos || {};
      errorVerificacion.textContent = datos.error || error.message || "Código incorrecto.";
      errorVerificacion.hidden = false;

      if (typeof datos.intentosRestantes === "number") {
        intentosRestantesEl.textContent = datos.intentosRestantes;
      }
      if (datos.bloqueado) {
        btnVerificarCodigo.hidden = true;
        btnReenviarCodigo.hidden = false;
      }
    }
  }

  async function reenviarCodigo() {
    btnReenviarCodigo.disabled = true;
    try {
      const { codigoVerificacionDemo } = await PidaPuesDatos.reenviarCodigoVerificacion(pedidoId);
      mostrarCodigoDemo(codigoVerificacionDemo);
      campoCodigo.value = "";
    } catch (error) {
      errorVerificacion.textContent = error.message || "No se pudo generar un nuevo código.";
      errorVerificacion.hidden = false;
    } finally {
      btnReenviarCodigo.disabled = false;
    }
  }

  btnContinuarVerificacion.addEventListener("click", continuarAVerificacion);
  btnVerificarCodigo.addEventListener("click", verificarCodigo);
  btnReenviarCodigo.addEventListener("click", reenviarCodigo);
  campoCodigo.addEventListener("input", () => {
    campoCodigo.value = campoCodigo.value.replace(/\D/g, "").slice(0, 6);
  });
  campoCodigo.addEventListener("keydown", (e) => {
    if (e.key === "Enter") verificarCodigo();
  });

  btnEnviarCocina.addEventListener("click", () => {
    window.location.href = "menu.html";
  });

  /* ---------- 5. Arranque ---------- */
  pedidoPendiente = cargarPedidoPendiente();

  if (!pedidoPendiente || !pedidoPendiente.items || pedidoPendiente.items.length === 0) {
    avisoSinPedido.hidden = false;
    tarjetaPago.hidden = true;
  } else {
    avisoSinPedido.hidden = true;
    tarjetaPago.hidden = false;
    renderizarResumen();
  }
});
