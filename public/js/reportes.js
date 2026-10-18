// =========================================
// PidaPues — reportes.js
// Reportes de ventas e inventario del panel de administración:
// gráficos (Chart.js), descarga en PDF con gráficos (jsPDF) y CSV
// (se abre en Excel). Los datos vienen de /api/reportes/* (vistas
// vista_reporte_* de la base de datos).
// =========================================

window.PidaPuesReportes = (() => {

  const COLORES = ["#FF6B2C", "#F4A259", "#5B8E7D", "#BC4B51", "#8CB369", "#6C5B7B", "#355C7D", "#F7B801"];
  const ETIQUETA_METODO = { efectivo: "Efectivo", tarjeta: "Tarjeta", qr: "Código QR" };

  let ventas = null;
  let inventario = null;
  const graficos = {};
  let iniciado = false;

  const $ = (id) => document.getElementById(id);

  function fechaLocal(fecha) {
    const m = String(fecha.getMonth() + 1).padStart(2, "0");
    const d = String(fecha.getDate()).padStart(2, "0");
    return `${fecha.getFullYear()}-${m}-${d}`;
  }

  function pesos(valor) {
    return "$" + Number(valor || 0).toLocaleString("es-CO");
  }

  function escaparHtml(texto) {
    const div = document.createElement("div");
    div.textContent = texto == null ? "" : String(texto);
    return div.innerHTML;
  }

  function mostrarMensaje(texto, esError) {
    const el = $("reportesMensaje");
    el.textContent = texto || "";
    el.hidden = !texto;
    el.classList.toggle("error", !!esError);
  }

  /* ---------- Gráficos ---------- */
  function hayChart() {
    return typeof window.Chart !== "undefined";
  }

  function dibujar(idCanvas, config) {
    if (graficos[idCanvas]) graficos[idCanvas].destroy();
    graficos[idCanvas] = new window.Chart($(idCanvas), config);
  }

  function registrarFondoBlanco() {
    // Sin esto, al exportar a PDF el fondo transparente del canvas sale negro.
    window.Chart.register({
      id: "fondoBlanco",
      beforeDraw(chart) {
        const { ctx } = chart;
        ctx.save();
        ctx.globalCompositeOperation = "destination-over";
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, chart.width, chart.height);
        ctx.restore();
      },
    });
  }

  function dibujarVentas() {
    if (!hayChart() || !ventas) return;

    dibujar("graficoVentasDia", {
      type: "bar",
      data: {
        labels: ventas.porDia.map((d) => d.fecha),
        datasets: [{ label: "Ventas ($)", data: ventas.porDia.map((d) => d.total), backgroundColor: COLORES[0], borderRadius: 6 }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, title: { display: true, text: "Ventas por día" } },
        scales: { y: { beginAtZero: true, ticks: { callback: (v) => pesos(v) } } },
      },
    });

    dibujar("graficoMetodoPago", {
      type: "doughnut",
      data: {
        labels: ventas.porMetodo.map((m) => ETIQUETA_METODO[m.metodo] || m.metodo),
        datasets: [{ data: ventas.porMetodo.map((m) => m.total), backgroundColor: COLORES }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { title: { display: true, text: "Ventas por método de pago" }, legend: { position: "bottom" } },
      },
    });

    const top = ventas.porProducto.slice(0, 8);
    dibujar("graficoTopProductos", {
      type: "bar",
      data: {
        labels: top.map((p) => p.nombre),
        datasets: [{ label: "Unidades vendidas", data: top.map((p) => p.unidades), backgroundColor: COLORES[2], borderRadius: 6 }],
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, title: { display: true, text: "Productos más vendidos (unidades)" } },
        scales: { x: { beginAtZero: true, ticks: { precision: 0 } } },
      },
    });
  }

  function dibujarInventario() {
    if (!hayChart() || !inventario) return;
    dibujar("graficoInventario", {
      type: "bar",
      data: {
        labels: inventario.productos.map((p) => p.nombre),
        datasets: [
          {
            label: "Stock actual",
            data: inventario.productos.map((p) => p.stockActual),
            backgroundColor: inventario.productos.map((p) => (p.bajoMinimo ? COLORES[3] : COLORES[4])),
            borderRadius: 6,
          },
          { label: "Stock mínimo", data: inventario.productos.map((p) => p.stockMinimo), backgroundColor: COLORES[7], borderRadius: 6 },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { title: { display: true, text: "Inventario: stock actual vs. mínimo" }, legend: { position: "bottom" } },
        scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
      },
    });
  }

  /* ---------- Resumen y tablas ---------- */
  function renderizarResumenVentas() {
    const r = ventas.resumen;
    $("reportesResumen").innerHTML = [
      ["Ventas del período", pesos(r.totalVentas), true],
      ["Pedidos pagados", r.pedidosPagados, false],
      ["Ticket promedio", pesos(r.ticketPromedio), false],
      ["Productos distintos vendidos", ventas.porProducto.length, false],
    ].map(([etiqueta, valor, acento]) => `
      <div class="tarjeta-resumen">
        <div class="tarjeta-resumen-etiqueta">${etiqueta}</div>
        <div class="tarjeta-resumen-valor ${acento ? "acento" : ""}">${valor}</div>
      </div>`).join("");
  }

  function renderizarTablaProductos() {
    const cuerpo = document.querySelector("#tablaProductosVendidos tbody");
    $("productosVendidosVacio").hidden = ventas.porProducto.length !== 0;
    cuerpo.innerHTML = ventas.porProducto.map((p) => `
      <tr>
        <td>${escaparHtml(p.nombre)}</td>
        <td>${escaparHtml(p.categoria)}</td>
        <td>${p.unidades}</td>
        <td>${pesos(p.ingresos)}</td>
      </tr>`).join("");
  }

  function renderizarTablaInventario() {
    const cuerpo = document.querySelector("#tablaInventario tbody");
    cuerpo.innerHTML = inventario.productos.map((p) => `
      <tr data-id="${p.id}">
        <td>${escaparHtml(p.nombre)}</td>
        <td>${escaparHtml(p.categoria)}</td>
        <td><input type="number" min="0" max="100000" class="input-inventario" data-campo="stockActual" value="${p.stockActual}" /></td>
        <td><input type="number" min="0" max="100000" class="input-inventario" data-campo="stockMinimo" value="${p.stockMinimo}" /></td>
        <td>${p.unidadesVendidas}</td>
        <td><span class="pill-stock ${p.bajoMinimo ? "bajo" : "ok"}">${p.stockActual <= 0 ? "Agotado" : p.bajoMinimo ? "Bajo mínimo" : "OK"}</span></td>
        <td><button class="btn-guardar-stock" data-id="${p.id}">Guardar</button></td>
      </tr>`).join("");

    cuerpo.querySelectorAll(".btn-guardar-stock").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const fila = btn.closest("tr");
        const stockActual = Number(fila.querySelector('[data-campo="stockActual"]').value);
        const stockMinimo = Number(fila.querySelector('[data-campo="stockMinimo"]').value);
        btn.disabled = true;
        try {
          await PidaPuesDatos.actualizarInventario(Number(btn.dataset.id), { stockActual, stockMinimo });
          mostrarMensaje("Existencias guardadas.", false);
          await cargar();
        } catch (error) {
          mostrarMensaje(error.message || "No se pudo guardar el inventario.", true);
        }
        btn.disabled = false;
      });
    });
  }

  /* ---------- Carga ---------- */
  async function cargar() {
    const desde = $("reporteDesde").value;
    const hasta = $("reporteHasta").value;
    try {
      [ventas, inventario] = await Promise.all([
        PidaPuesDatos.obtenerReporteVentas(desde, hasta),
        PidaPuesDatos.obtenerReporteInventario(desde, hasta),
      ]);
    } catch (error) {
      mostrarMensaje(error.message || "No se pudieron cargar los reportes.", true);
      return;
    }
    if (!hayChart()) {
      mostrarMensaje("Faltan las librerías de gráficos: detén el servidor, ejecuta `npm install` y vuelve a iniciarlo.", true);
    }
    renderizarResumenVentas();
    renderizarTablaProductos();
    renderizarTablaInventario();
    dibujarVentas();
    dibujarInventario();
    $("btnPdf").disabled = !hayChart() || typeof window.jspdf === "undefined";
  }

  /* ---------- Descargas ---------- */
  function descargar(nombreArchivo, blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nombreArchivo;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // CSV con ";" como separador y BOM, para que Excel en español lo abra bien.
  function celdaCsv(valor) {
    const t = String(valor == null ? "" : valor);
    return /[;"\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  }
  function filaCsv(celdas) {
    return celdas.map(celdaCsv).join(";");
  }

  function descargarCsvVentas() {
    if (!ventas) return;
    const lineas = [
      filaCsv(["REPORTE DE VENTAS", `${ventas.desde} a ${ventas.hasta}`]),
      "",
      filaCsv(["VENTAS POR DIA"]),
      filaCsv(["Fecha", "Pedidos", "Total (COP)"]),
      ...ventas.porDia.map((d) => filaCsv([d.fecha, d.pedidos, d.total])),
      "",
      filaCsv(["VENTAS POR METODO DE PAGO"]),
      filaCsv(["Metodo", "Pedidos", "Total (COP)"]),
      ...ventas.porMetodo.map((m) => filaCsv([ETIQUETA_METODO[m.metodo] || m.metodo, m.pedidos, m.total])),
      "",
      filaCsv(["PRODUCTOS VENDIDOS"]),
      filaCsv(["Producto", "Categoria", "Unidades", "Ingresos (COP)"]),
      ...ventas.porProducto.map((p) => filaCsv([p.nombre, p.categoria, p.unidades, p.ingresos])),
    ];
    descargar(`ventas_${ventas.desde}_a_${ventas.hasta}.csv`, new Blob(["\ufeff" + lineas.join("\r\n")], { type: "text/csv;charset=utf-8" }));
  }

  function descargarCsvInventario() {
    if (!inventario) return;
    const lineas = [
      filaCsv(["REPORTE DE INVENTARIO", `unidades vendidas del ${inventario.desde} al ${inventario.hasta}`]),
      "",
      filaCsv(["Producto", "Categoria", "Stock actual", "Stock minimo", "Unidades vendidas", "Estado"]),
      ...inventario.productos.map((p) => filaCsv([
        p.nombre, p.categoria, p.stockActual, p.stockMinimo, p.unidadesVendidas,
        p.stockActual <= 0 ? "Agotado" : p.bajoMinimo ? "Bajo minimo" : "OK",
      ])),
    ];
    descargar(`inventario_${fechaLocal(new Date())}.csv`, new Blob(["\ufeff" + lineas.join("\r\n")], { type: "text/csv;charset=utf-8" }));
  }

  function descargarPdf() {
    if (!ventas || !inventario || typeof window.jspdf === "undefined" || !hayChart()) return;
    const doc = new window.jspdf.jsPDF({ unit: "mm", format: "a4" });
    const ancho = 210;
    const margen = 14;
    const util = ancho - margen * 2;
    let y = 16;

    const nuevaPaginaSiHaceFalta = (alto) => {
      if (y + alto > 285) {
        doc.addPage();
        y = 16;
      }
    };
    const titulo = (texto) => {
      nuevaPaginaSiHaceFalta(12);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.text(texto, margen, y);
      y += 7;
    };
    const imagenGrafico = (idCanvas, alto) => {
      const canvas = $(idCanvas);
      if (!canvas || !graficos[idCanvas]) return;
      nuevaPaginaSiHaceFalta(alto + 4);
      doc.addImage(canvas.toDataURL("image/png"), "PNG", margen, y, util, alto);
      y += alto + 6;
    };
    const fila = (celdas, anchos, negrita) => {
      nuevaPaginaSiHaceFalta(7);
      doc.setFont("helvetica", negrita ? "bold" : "normal");
      doc.setFontSize(9);
      let x = margen;
      celdas.forEach((c, i) => {
        const texto = String(c);
        doc.text(texto.length > 34 ? texto.slice(0, 33) + "." : texto, x, y);
        x += anchos[i];
      });
      y += 5.5;
    };

    // Encabezado
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text("PidaPues - Reporte de ventas e inventario", margen, y);
    y += 8;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Periodo: ${ventas.desde} a ${ventas.hasta}`, margen, y);
    y += 5;
    doc.text(`Generado: ${new Date().toLocaleString("es-CO")}`, margen, y);
    y += 9;

    // Resumen
    titulo("Resumen de ventas");
    const r = ventas.resumen;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    [`Ventas del periodo: ${pesos(r.totalVentas)}`,
     `Pedidos pagados: ${r.pedidosPagados}`,
     `Ticket promedio: ${pesos(r.ticketPromedio)}`].forEach((t) => { doc.text(t, margen, y); y += 5.5; });
    y += 3;

    // Ventas
    imagenGrafico("graficoVentasDia", 70);
    imagenGrafico("graficoMetodoPago", 70);
    imagenGrafico("graficoTopProductos", 70);

    titulo("Productos vendidos");
    fila(["Producto", "Categoria", "Unidades", "Ingresos"], [70, 40, 28, 40], true);
    ventas.porProducto.forEach((p) => fila([p.nombre, p.categoria, p.unidades, pesos(p.ingresos)], [70, 40, 28, 40], false));
    y += 5;

    // Inventario
    titulo("Inventario");
    imagenGrafico("graficoInventario", 75);
    fila(["Producto", "Stock", "Minimo", "Vendidas", "Estado"], [66, 24, 24, 28, 40], true);
    inventario.productos.forEach((p) => fila(
      [p.nombre, p.stockActual, p.stockMinimo, p.unidadesVendidas, p.stockActual <= 0 ? "Agotado" : p.bajoMinimo ? "Bajo minimo" : "OK"],
      [66, 24, 24, 28, 40], false
    ));

    doc.save(`reporte_pidapues_${ventas.desde}_a_${ventas.hasta}.pdf`);
  }

  /* ---------- Arranque ---------- */
  function iniciar() {
    if (iniciado) return;
    iniciado = true;

    if (hayChart()) registrarFondoBlanco();

    const hoy = new Date();
    const hace30 = new Date();
    hace30.setDate(hoy.getDate() - 29);
    $("reporteDesde").value = fechaLocal(hace30);
    $("reporteHasta").value = fechaLocal(hoy);

    $("btnActualizarReportes").addEventListener("click", cargar);
    $("btnPdf").addEventListener("click", descargarPdf);
    $("btnCsvVentas").addEventListener("click", descargarCsvVentas);
    $("btnCsvInventario").addEventListener("click", descargarCsvInventario);

    cargar();
  }

  return { iniciar };
})();
