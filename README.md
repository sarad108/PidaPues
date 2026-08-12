# PidaPues — backend con MySQL

Este proyecto tiene dos partes:

- **`public/`** — el frontend (HTML/CSS/JS), servido como archivos estáticos.
- **`server.js` + `src/`** — la API en Node.js/Express que lee y escribe en MySQL.

Todos los datos (pedidos, mesas, facturas) ahora viven en la base de datos, no en el
navegador — así que Cliente, Cocina, Mesero y Administración ven siempre la misma
información, desde cualquier dispositivo.

## 1. Requisitos

- Node.js 18 o superior
- MySQL 8 (o MariaDB reciente) corriendo en tu máquina o en un servicio como Railway/Render

## 2. Crear la base de datos

Con tu cliente de MySQL (línea de comandos, MySQL Workbench, phpMyAdmin, etc.), ejecuta
el archivo `src/schema.sql`. Por ejemplo, desde la terminal:

```bash
mysql -u root -p < src/schema.sql
```

Esto crea la base `pidapues`, sus tablas, y carga los productos del menú, las 8 mesas
y los datos legales del negocio (razón social, NIT, cuenta bancaria, etc. — puedes
editarlos directamente en la tabla `negocio` o en `src/schema.sql` antes de importar).

## 3. Configurar las variables de entorno

Copia `.env.example` como `.env` y ajusta los datos de conexión:

```bash
cp .env.example .env
```

```
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=tu_password
DB_NAME=pidapues
PORT=3000
```

## 4. Instalar dependencias y correr el servidor

```bash
npm install
npm start
```

Abre **http://localhost:3000** — ahí verás `index.html`. Desde ahí, el acceso del
personal (footer) lleva a Cocina, Mesero y Administración; el botón "Ver Menú" lleva
al menú del cliente.

Para desarrollo con reinicio automático: `npm run dev`.

## 5. Desplegar en un servicio como Railway o Render

1. Sube este proyecto a un repositorio (GitHub, GitLab, etc.).
2. Crea un servicio de MySQL en la misma plataforma (o usa uno externo, como PlanetScale).
3. Crea un servicio "Web" apuntando a este repo, con `npm install` como build command
   y `npm start` como start command.
4. Configura las variables de entorno (`DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`,
   `DB_NAME`) con los datos que te dé la plataforma para tu base de datos.
5. Ejecuta `src/schema.sql` contra esa base de datos (la mayoría de plataformas
   permiten correr un script SQL desde su panel, o puedes conectarte con `mysql -h ...`).

## 6. Flujo de la aplicación

- **Cliente** (`/menu.html`): arma su pedido, elige mesa y va a pagar.
- **Pago** (`/pago.html`): el pedido se crea en el servidor como *"pendiente de pago"*
  (todavía no llega a cocina). En ese momento la mesa pasa a estado **"pago"** (nadie
  más puede iniciar un pedido en ella hasta que se libere). El servidor genera un
  código de verificación de 6 dígitos (simulando una notificación bancaria/SMS — no
  hay una pasarela de pago real conectada). Solo cuando el cliente ingresa el código
  correcto, el servidor marca el pedido como pagado, pasa la mesa a **"ocupada"**,
  genera la factura y **recién ahí** queda visible para cocina. Hay límite de 3
  intentos antes de bloquear el código y pedir uno nuevo.
- **Cocina** (`/cocina.html`): ve solo pedidos con pago verificado, y los avanza
  `pendiente → en_preparación → listo`.
- **Mesero** (`/mesero.html`): ve los pedidos que cocina marcó "listo" y los marca
  como "entregado" al llevarlos a la mesa — esto libera la mesa.
- **Administración** (`/admin.html`): reportes de ventas, ticket promedio, estado de
  mesas, historial completo e histórico de tiempos de servicio.
- Las mesas tienen 3 estados (RF011): **libre** → **pago** (pedido creado, pago sin
  verificar) → **ocupada** (pago verificado). Se liberan automáticamente si pasan 30
  minutos sin ninguna interacción, sin importar en cuál de los 3 estados estén (lo
  revisa el propio servidor cada minuto, sin depender de que haya una pantalla
  abierta).

## 7. Acceso por PIN (Cocina / Mesero / Admin)

Cada módulo de personal pide un PIN antes de mostrar cualquier dato:

- Los PINs se configuran en `.env` (`PIN_COCINA`, `PIN_MESERO`, `PIN_ADMIN`).
  **Cámbialos por unos propios** antes de usar el sistema en producción — los
  del `.env.example` son solo de ejemplo.
- El PIN de Admin también abre Cocina y Mesero (útil si el encargado necesita
  resolver algo en cualquier pantalla).
- La sesión se guarda en el navegador (`sessionStorage`) y dura 12 horas o
  hasta que se cierre la pestaña — lo que ocurra primero. Cada turno vuelve a
  pedir el PIN.
- La protección no es solo "de pantalla": el servidor también exige el token
  correcto en cada petición a la API, así que aunque alguien abra
  `/cocina.html` directamente sin el PIN, no puede ver ni modificar pedidos.
- Tras **3 intentos fallidos consecutivos** de PIN en un mismo módulo, el acceso
  se bloquea por 5 minutos. Cada intento (correcto o incorrecto) queda registrado
  con fecha y hora en la tabla `intentos_acceso`.
- El menú del cliente (`/menu.html`, `/pago.html`) sigue siendo público, como
  debe ser, ya que ahí no hay información sensible del negocio.
- Esto es un PIN compartido por módulo (no usuarios individuales). Si más
  adelante necesitas saber *qué persona* hizo cada acción (por ejemplo, qué
  mesero entregó cada pedido), se puede evolucionar a cuentas individuales.

## 8. ¿No aparece información / pantallas en blanco?

Casi siempre es porque el servidor no logró conectarse a MySQL. Al hacer
`npm start` fíjate en la consola:

- Si ves `✅ Conexión a MySQL correcta` → todo bien, el problema sería otro
  (revisa la consola del navegador con F12).
- Si ves `❌ No se pudo conectar a MySQL` → sigue estos pasos en orden:
  1. Verifica que el servicio de MySQL esté corriendo.
  2. Confirma que exista el archivo `.env` en la raíz del proyecto (se crea
     automáticamente al hacer `npm install`, copiando `.env.example`; si no,
     cópialo tú mismo con `cp .env.example .env`).
  3. Abre `.env` y pon tu usuario/contraseña reales de MySQL.
  4. Asegúrate de haber ejecutado el script de la base de datos:
     `mysql -u root -p < src/schema.sql`
  5. Vuelve a correr `npm start`.

## 9. Nota sobre el pago

Este es un **prototipo**: el "banco" que verifica el código es simulado (el propio
servidor genera el código y te lo muestra en pantalla, ya que no hay una pasarela de
pago real conectada). Para producción, reemplazarías la creación/verificación del
pago en `src/routes/api.js` por la integración con una pasarela real (Wompi, PayU,
Stripe, etc.), manteniendo la misma idea: el pedido no debe quedar visible para
cocina hasta que la pasarela confirme el pago del lado del servidor.
