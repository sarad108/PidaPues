// =========================================
// PidaPues — resena.js
// Formulario OPCIONAL de reseña (1 a 5 estrellas + comentario).
// Se muestra debajo de la factura, una vez el pago está verificado:
//   · en pago.html (paso 3)
//   · en el modal "Ver factura" del menú
// Nunca se muestra en el carrito ni bloquea el flujo del pedido.
// =========================================

const PidaPuesResena = (() => {

  const MAX_COMENTARIO = 300;
  const ETIQUETAS = ["", "Muy mala", "Mejorable", "Bien", "Muy buena", "¡Excelente!"];
  const claveGuardada = (id) => `pidapues_resena_${id}`;

  function yaReseno(id) {
    try { return localStorage.getItem(claveGuardada(id)) === "1"; } catch { return false; }
  }

  function marcarReseno(id) {
    try { localStorage.setItem(claveGuardada(id), "1"); } catch { /* sin almacenamiento */ }
  }

  function montar(contenedor, pedidoId) {
    if (!contenedor || pedidoId == null) return;
    if (yaReseno(pedidoId)) return mostrarGracias(contenedor, "Ya dejaste tu reseña de este pedido. ¡Gracias!");
    mostrarFormulario(contenedor, pedidoId);
  }

  /* ---------- Estado: invitación plegada ("Ahora no") ---------- */
  function mostrarInvitacion(contenedor, pedidoId) {
    contenedor.innerHTML = `
      <div class="resena resena-plegada">
        <button type="button" class="btn-resena-abrir">⭐ Dejar una reseña (opcional)</button>
      </div>`;
    contenedor.querySelector(".btn-resena-abrir").addEventListener("click", () => mostrarFormulario(contenedor, pedidoId));
  }

  /* ---------- Estado: agradecimiento ---------- */
  function mostrarGracias(contenedor, mensaje) {
    contenedor.innerHTML = `
      <div class="resena resena-gracias" role="status">
        <span class="resena-gracias-icono">🧡</span>
        <p>${PidaPuesFactura.escaparHtml(mensaje)}</p>
      </div>`;
  }

  /* ---------- Estado: formulario ---------- */
  function mostrarFormulario(contenedor, pedidoId) {
    const uid = `resena-${pedidoId}-${Math.random().toString(36).slice(2, 7)}`;
    contenedor.innerHTML = `
      <section class="resena" aria-labelledby="${uid}-titulo">
        <h3 class="resena-titulo" id="${uid}-titulo">¿Cómo estuvo tu experiencia?</h3>
        <p class="resena-sub">Es opcional, pero nos ayuda a mejorar.</p>

        <div class="resena-estrellas" role="radiogroup" aria-label="Calificación de 1 a 5 estrellas">
          ${[1, 2, 3, 4, 5].map((n) => `
            <button type="button" class="resena-estrella" role="radio" aria-checked="false"
                    aria-label="${n} ${n === 1 ? "estrella" : "estrellas"}" data-valor="${n}" tabindex="${n === 1 ? 0 : -1}">★</button>
          `).join("")}
        </div>
        <p class="resena-etiqueta" aria-live="polite">&nbsp;</p>

        <label class="resena-label" for="${uid}-texto">Cuéntanos más (opcional)</label>
        <textarea class="resena-texto" id="${uid}-texto" rows="3" maxlength="${MAX_COMENTARIO}"
                  placeholder="¿Qué fue lo que más te gustó?"></textarea>
        <p class="resena-contador"><span class="resena-contador-n">0</span>/${MAX_COMENTARIO}</p>

        <p class="resena-error" role="alert" hidden></p>

        <div class="resena-acciones">
          <button type="button" class="btn-resena-enviar" disabled>Enviar reseña</button>
          <button type="button" class="btn-resena-omitir">Ahora no</button>
        </div>
      </section>`;

    const estrellas = [...contenedor.querySelectorAll(".resena-estrella")];
    const etiqueta = contenedor.querySelector(".resena-etiqueta");
    const texto = contenedor.querySelector(".resena-texto");
    const contador = contenedor.querySelector(".resena-contador-n");
    const error = contenedor.querySelector(".resena-error");
    const btnEnviar = contenedor.querySelector(".btn-resena-enviar");
    const btnOmitir = contenedor.querySelector(".btn-resena-omitir");
    let valor = 0;

    function elegir(n) {
      valor = n;
      estrellas.forEach((el, i) => {
        const marcada = i + 1 === n;
        el.classList.toggle("activa", i + 1 <= n);
        el.setAttribute("aria-checked", marcada ? "true" : "false");
        el.tabIndex = marcada || (n === 0 && i === 0) ? 0 : -1;
      });
      etiqueta.textContent = ETIQUETAS[n] || "";
      btnEnviar.disabled = n === 0;
      error.hidden = true;
    }

    estrellas.forEach((el, i) => {
      el.addEventListener("click", () => elegir(i + 1));
      el.addEventListener("keydown", (e) => {
        let destino = null;
        if (e.key === "ArrowRight" || e.key === "ArrowUp") destino = Math.min(5, (valor || 0) + 1);
        if (e.key === "ArrowLeft" || e.key === "ArrowDown") destino = Math.max(1, (valor || 2) - 1);
        if (destino) {
          e.preventDefault();
          elegir(destino);
          estrellas[destino - 1].focus();
        }
      });
    });

    texto.addEventListener("input", () => { contador.textContent = texto.value.length; });

    btnOmitir.addEventListener("click", () => mostrarInvitacion(contenedor, pedidoId));

    btnEnviar.addEventListener("click", async () => {
      if (valor === 0) return;
      btnEnviar.disabled = true;
      btnOmitir.disabled = true;
      btnEnviar.textContent = "Enviando…";
      error.hidden = true;
      try {
        const comentario = texto.value.trim();
        await PidaPuesDatos.enviarResena(pedidoId, valor, comentario);
        marcarReseno(pedidoId);
        mostrarGracias(contenedor, comentario
          ? "¡Gracias por tu reseña! Tu comentario aparecerá en nuestro inicio."
          : "¡Gracias por tu calificación!");
      } catch (err) {
        if (err.datos && err.datos.yaExiste) {
          marcarReseno(pedidoId);
          return mostrarGracias(contenedor, "Este pedido ya tiene una reseña. ¡Gracias!");
        }
        error.textContent = err.message || "No pudimos enviar tu reseña. Intenta de nuevo.";
        error.hidden = false;
        btnEnviar.disabled = false;
        btnOmitir.disabled = false;
        btnEnviar.textContent = "Enviar reseña";
      }
    });
  }

  return { montar };
})();
