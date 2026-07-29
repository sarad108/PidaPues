// =========================================
// PidaPues — bienvenida.js
// Controla el botón de entrada al menú
// =========================================

document.addEventListener("DOMContentLoaded", () => {
  const btnIngresar = document.getElementById("btnIngresar");

  if (!btnIngresar) return;

  btnIngresar.addEventListener("click", () => {
    // Pequeña transición de salida antes de navegar
    document.body.classList.add("saliendo");

    setTimeout(() => {
      window.location.href = "menu.html";
    }, 400);
  });
});
