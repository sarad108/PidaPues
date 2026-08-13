-- =====================================================================
-- PidaPues — esquema de base de datos (MySQL 8.0+)
-- ---------------------------------------------------------------------
-- Mismos nombres de tablas y columnas que usa el código de la app
-- (src/routes/api.js hace bastante `SELECT *`), pero con:
--   - motor/charset explícitos en cada tabla
--   - claves foráneas entre productos, pedidos, pedido_items y mesas
--   - índices para las consultas más frecuentes (cocina, mesero, admin)
--   - CHECK constraints para proteger la integridad de los datos
--   - comentarios (COMMENT) documentando cada tabla/columna
--   - vistas de solo lectura por módulo (trazabilidad con el ERS/RF)
-- ---------------------------------------------------------------------
-- MATRIZ DE TRAZABILIDAD (Proyecto Pedagógico Integrador — Requisitos)
-- ---------------------------------------------------------------------
--  Requisito                                     Módulo          Tabla(s) / Vista
--  RF001 Registro de pedidos                      Cliente         pedidos, pedido_items, productos
--  RF002 Organización de pedidos                  Mesero          pedidos (mesa, estado, fecha_registro)
--  RF003 Visualización de órdenes en cocina        Cocina          vista_cocina_pedidos
--  RF004 Actualización de estado de pedidos        Cocina          pedidos.estado, fecha_inicio_preparacion, fecha_listo
--  RF005 Visualización de pedidos por cliente      Cliente         pedidos, pedido_items
--  RF006 Registro de pago del pedido               Cliente         pedidos.pagado/codigo_verificacion/metodo_pago
--  RF007 Notificación de pago a cocina             Cocina          pedidos.notificado_cocina
--  RF008 Generación de reportes de ventas          Administrador   vista_admin_historial
--  RF009 Consulta de tiempos de servicio           Administrador   vista_admin_tiempos_servicio
--  RF010 Registro histórico de transacciones       Administrador   vista_admin_historial
--  RF011 Gestión de mesas                          Anfitrión       mesas (libre/pago/ocupada), vista_admin_mesas
--  NF004 Seguridad / control de acceso             Todos           src/auth.js + tabla intentos_acceso
-- =====================================================================

CREATE DATABASE IF NOT EXISTS pidapues
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE pidapues;

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- Se eliminan las tablas (si existen) antes de recrearlas, para que este
-- script se pueda ejecutar varias veces sin errores de "ya existe" ni de
-- claves foráneas duplicadas. El orden respeta las dependencias.
DROP TABLE IF EXISTS pedido_items;
DROP TABLE IF EXISTS pedidos;
DROP TABLE IF EXISTS mesas;
DROP TABLE IF EXISTS productos;
DROP TABLE IF EXISTS negocio;
DROP TABLE IF EXISTS intentos_acceso;

-- ---------------------------------------------------------------------
-- Datos legales del negocio (para la factura)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS negocio (
  id              TINYINT UNSIGNED NOT NULL DEFAULT 1,
  razon_social    VARCHAR(120) NOT NULL,
  nit             VARCHAR(40)  NOT NULL,
  direccion       VARCHAR(160) NOT NULL,
  regimen         VARCHAR(80)  NOT NULL,
  banco           VARCHAR(80)  NOT NULL,
  tipo_cuenta     VARCHAR(40)  NOT NULL,
  numero_cuenta   VARCHAR(60)  NOT NULL,
  titular_cuenta  VARCHAR(120) NOT NULL,
  PRIMARY KEY (id),
  CONSTRAINT chk_negocio_id_unico CHECK (id = 1)   -- tabla de fila única (singleton)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Datos fiscales del restaurante usados para imprimir la factura';

-- ---------------------------------------------------------------------
-- Productos del menú
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS productos (
  id            INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  categoria     ENUM('comida','bebida','postre') NOT NULL,
  nombre        VARCHAR(120)  NOT NULL,
  descripcion   VARCHAR(255)  NOT NULL,
  precio        INT UNSIGNED  NOT NULL COMMENT 'Precio en COP, sin centavos',
  emoji         VARCHAR(10)   NOT NULL,
  imagen_url    VARCHAR(500)  NULL COMMENT 'Ruta o URL de la foto del producto',
  disponible    TINYINT(1)    NOT NULL DEFAULT 1 COMMENT '1 = visible en el menú, 0 = oculto (baja lógica)',
  creado_en     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  CONSTRAINT chk_productos_precio CHECK (precio >= 0),

  INDEX idx_productos_categoria_disponible (categoria, disponible)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Catálogo de productos del menú';

-- ---------------------------------------------------------------------
-- Mesas
-- ---------------------------------------------------------------------
-- estado de la mesa (RF011):
--   libre   -> disponible para un nuevo pedido
--   pago    -> hay un pedido creado en esa mesa que todavía no verifica el
--              pago (nadie más puede tomar la mesa mientras tanto)
--   ocupada -> el pago quedó verificado y el pedido está en curso
CREATE TABLE IF NOT EXISTS mesas (
  numero              INT UNSIGNED PRIMARY KEY,
  estado               ENUM('libre','pago','ocupada') NOT NULL DEFAULT 'libre',
  pedido_id            INT UNSIGNED NULL COMMENT 'Pedido activo asociado a la mesa (si no está libre)',
  ultima_interaccion   DATETIME NULL,

  INDEX idx_mesas_pedido_id (pedido_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Mesas físicas del restaurante y el pedido que tienen activo';

-- ---------------------------------------------------------------------
-- Pedidos
-- ---------------------------------------------------------------------
-- estado del pedido:
--   pendiente_pago  -> se creó pero el pago aún no se ha verificado (NO es visible en cocina)
--   pendiente       -> pago verificado, en cola de cocina
--   en_preparacion  -> cocina lo está preparando
--   listo           -> cocina terminó; el mesero debe entregarlo en la mesa
--   entregado       -> el mesero lo entregó; la mesa se libera
CREATE TABLE IF NOT EXISTS pedidos (
  id                            INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  mesa                          INT UNSIGNED NOT NULL,
  total                         INT UNSIGNED NOT NULL COMMENT 'Calculado en el servidor, nunca confiado del cliente',
  estado                        ENUM('pendiente_pago','pendiente','en_preparacion','listo','entregado')
                                 NOT NULL DEFAULT 'pendiente_pago',
  metodo_pago                   ENUM('efectivo','tarjeta','qr') NOT NULL,

  -- Verificación segura del pago (RF006/RF007)
  pagado                        TINYINT(1) NOT NULL DEFAULT 0,
  codigo_verificacion           VARCHAR(10) NOT NULL,
  intentos_verificacion         INT UNSIGNED NOT NULL DEFAULT 0,
  bloqueado                     TINYINT(1) NOT NULL DEFAULT 0,

  notificado_cocina             TINYINT(1) NOT NULL DEFAULT 0,

  -- Factura electrónica (datos legales, copiados del cliente/negocio al momento del pago)
  factura_numero                VARCHAR(20)  NULL,
  factura_cliente                VARCHAR(120) NULL,
  factura_razon_social           VARCHAR(120) NULL,
  factura_nit                    VARCHAR(40)  NULL,
  factura_direccion              VARCHAR(160) NULL,
  factura_regimen                VARCHAR(80)  NULL,
  factura_banco                  VARCHAR(80)  NULL,
  factura_tipo_cuenta             VARCHAR(40)  NULL,
  factura_numero_cuenta           VARCHAR(60)  NULL,
  factura_titular_cuenta          VARCHAR(120) NULL,

  fecha_registro                 DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fecha_pago                     DATETIME NULL,
  fecha_inicio_preparacion       DATETIME NULL,
  fecha_listo                    DATETIME NULL,
  fecha_entregado                 DATETIME NULL,

  CONSTRAINT chk_pedidos_total CHECK (total >= 0),
  CONSTRAINT chk_pedidos_intentos CHECK (intentos_verificacion >= 0),

  CONSTRAINT fk_pedidos_mesa FOREIGN KEY (mesa) REFERENCES mesas(numero)
    ON UPDATE CASCADE ON DELETE RESTRICT,

  INDEX idx_pedidos_mesa (mesa),
  INDEX idx_pedidos_pagado_estado (pagado, estado),
  INDEX idx_pedidos_fecha_registro (fecha_registro)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Pedidos realizados por mesa, con su ciclo de vida y datos de pago/factura';

-- Ahora que `pedidos` ya existe, cerramos la referencia circular con `mesas`.
ALTER TABLE mesas
  ADD CONSTRAINT fk_mesas_pedido FOREIGN KEY (pedido_id) REFERENCES pedidos(id)
    ON UPDATE CASCADE ON DELETE SET NULL;

-- ---------------------------------------------------------------------
-- Ítems de cada pedido
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pedido_items (
  id            INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  pedido_id     INT UNSIGNED NOT NULL,
  producto_id   INT UNSIGNED NOT NULL,
  cantidad      INT UNSIGNED NOT NULL,
  observacion   VARCHAR(160) NULL,

  CONSTRAINT chk_pedido_items_cantidad CHECK (cantidad > 0),

  CONSTRAINT fk_pedido_items_pedido FOREIGN KEY (pedido_id) REFERENCES pedidos(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_pedido_items_producto FOREIGN KEY (producto_id) REFERENCES productos(id)
    ON DELETE RESTRICT ON UPDATE CASCADE,

  INDEX idx_pedido_items_pedido (pedido_id),
  INDEX idx_pedido_items_producto (producto_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Detalle de productos y cantidades dentro de cada pedido';

-- ---------------------------------------------------------------------
-- Intentos de acceso por PIN (NF004 — seguridad / control de acceso)
-- ---------------------------------------------------------------------
-- Registra cada intento de login (exitoso o fallido) por módulo, con
-- fecha y hora, para poder auditar accesos y sustentar el bloqueo tras
-- 3 intentos fallidos consecutivos que aplica src/auth.js en memoria.
CREATE TABLE IF NOT EXISTS intentos_acceso (
  id            INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  rol           ENUM('cocina','mesero','admin') NOT NULL,
  exito         TINYINT(1) NOT NULL,
  bloqueado     TINYINT(1) NOT NULL DEFAULT 0 COMMENT '1 si este intento activó el bloqueo temporal',
  ip            VARCHAR(64) NULL,
  fecha_hora    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_intentos_acceso_rol_fecha (rol, fecha_hora)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Bitácora de intentos de acceso por PIN (fecha/hora de cada intento, NF004)';

SET FOREIGN_KEY_CHECKS = 1;

-- =====================================================================
-- Datos semilla
-- =====================================================================

INSERT INTO negocio (id, razon_social, nit, direccion, regimen, banco, tipo_cuenta, numero_cuenta, titular_cuenta)
VALUES (1, 'PidaPues S.A.S.', '900.123.456-7', 'Cra. 45 #26-85, Medellín, Antioquia', 'Responsable de IVA',
        'Bancolombia', 'Cuenta de Ahorros', '123-456789-01', 'PidaPues S.A.S.')
ON DUPLICATE KEY UPDATE razon_social = razon_social;

INSERT INTO productos (id, categoria, nombre, descripcion, precio, emoji, imagen_url) VALUES
  (1, 'comida', 'Hamburguesa Clasica',
     'Carne de res a la parrilla, queso cheddar derretido, lechuga fresca, tomate y nuestra salsa especial de la casa, todo en pan brioche tostado.',
     18000, '🍔', 'img/productos/hamburguesa.jpg'),
  (2, 'comida', 'Pizza Pepperoni',
     'Masa artesanal horneada en piedra, salsa de tomate casera, doble mozzarella y abundante pepperoni crocante.',
     25000, '🍕', 'img/productos/pizza.jpg'),
  (3, 'comida', 'Salchipapa',
     'Papa a la francesa crocante, trozos de salchicha, mezcla de nuestras 3 salsas de la casa y queso fundido por encima.',
     20000, '🍟', 'img/productos/salchipapa.jpg'),
  (4, 'comida', 'Perro Caliente',
     'Salchicha jugosa, papas hilo crocantes, salsas de la casa (rosada, mostaza y BBQ) y queso rallado al gusto.',
     15000, '🌭', 'img/productos/perro.jpg'),
  (5, 'comida', 'Alitas BBQ',
     '8 alitas de pollo horneadas y bañadas en salsa BBQ ahumada, acompañadas de papas a la francesa.',
     22000, '🍗', 'img/productos/alitas.jpg'),
  (6, 'bebida', 'Gaseosa 400ml',
     'A elegir entre Cola, Manzana o Uva, bien fría y lista para acompañar tu pedido.',
     5000, '🥤', 'img/productos/gaseosa.jpg'),
  (7, 'bebida', 'Limonada Natural',
     'Limonada fresca preparada al momento con limones naturales, endulzada al gusto.',
     6000, '🍋', 'img/productos/limonada.jpg'),
  (8, 'postre', 'Brownie con Helado',
     'Brownie tibio de chocolate, crocante por fuera y suave por dentro, servido con una bola de helado de vainilla.',
     12000, '🍫', 'img/productos/brownie.jpg')
ON DUPLICATE KEY UPDATE nombre = VALUES(nombre), descripcion = VALUES(descripcion), imagen_url = VALUES(imagen_url);

INSERT INTO mesas (numero, estado)
SELECT n, 'libre' FROM (
  SELECT 1 AS n UNION SELECT 2 UNION SELECT 3 UNION SELECT 4
  UNION SELECT 5 UNION SELECT 6 UNION SELECT 7 UNION SELECT 8
) AS numeros
ON DUPLICATE KEY UPDATE estado = estado;

-- =====================================================================
-- Vistas por módulo (solo lectura)
-- ---------------------------------------------------------------------
-- No las usa el backend actual (api.js sigue consultando las tablas
-- directamente), así que agregarlas es 100% seguro: no rompen nada.
-- Sirven para el sustento del ERS/PPI (evidencian que cada módulo del
-- sistema tiene su propia consulta/"tabla" de trabajo) y para que
-- puedas verificar los datos a mano desde un cliente MySQL mientras
-- pruebas el flujo completo (menú -> pago -> cocina -> mesero -> admin).
-- =====================================================================

DROP VIEW IF EXISTS vista_cocina_pedidos;
DROP VIEW IF EXISTS vista_mesero_pedidos;
DROP VIEW IF EXISTS vista_admin_mesas;
DROP VIEW IF EXISTS vista_admin_historial;
DROP VIEW IF EXISTS vista_admin_tiempos_servicio;

-- RF003/RF004/RF007 — lo que ve Cocina: solo pedidos con pago verificado,
-- en cola o en preparación (ni "pendiente_pago" ni "entregado").
CREATE VIEW vista_cocina_pedidos AS
SELECT
  p.id, p.mesa, p.estado, p.total, p.notificado_cocina,
  p.fecha_registro, p.fecha_inicio_preparacion, p.fecha_listo,
  pi.producto_id, pr.nombre AS producto_nombre, pi.cantidad, pi.observacion
FROM pedidos p
JOIN pedido_items pi ON pi.pedido_id = p.id
JOIN productos pr    ON pr.id = pi.producto_id
WHERE p.pagado = 1 AND p.estado IN ('pendiente','en_preparacion','listo')
ORDER BY p.fecha_registro ASC;

-- RF002/RF011 — lo que ve el Mesero: pedidos listos para entregar en mesa.
CREATE VIEW vista_mesero_pedidos AS
SELECT
  p.id, p.mesa, p.estado, p.total,
  p.fecha_listo, m.ultima_interaccion,
  pi.producto_id, pr.nombre AS producto_nombre, pi.cantidad, pi.observacion
FROM pedidos p
JOIN mesas m          ON m.numero = p.mesa
JOIN pedido_items pi  ON pi.pedido_id = p.id
JOIN productos pr     ON pr.id = pi.producto_id
WHERE p.pagado = 1 AND p.estado = 'listo'
ORDER BY p.fecha_listo ASC;

-- RF011 — estado de ocupación de mesas para Anfitrión/Admin.
CREATE VIEW vista_admin_mesas AS
SELECT numero, estado, pedido_id, ultima_interaccion
FROM mesas
ORDER BY numero;

-- RF008/RF010 — reportes de ventas e historial de transacciones para
-- Director General / Contador (un renglón por pedido, con su total).
CREATE VIEW vista_admin_historial AS
SELECT
  p.id, p.mesa, p.total, p.estado, p.metodo_pago, p.pagado,
  p.factura_numero, p.factura_cliente,
  p.fecha_registro, p.fecha_pago
FROM pedidos p
ORDER BY p.fecha_registro DESC;

-- RF009 — tiempos de servicio (registro -> inicio -> listo -> entregado)
-- para Director General, con la duración total en minutos.
CREATE VIEW vista_admin_tiempos_servicio AS
SELECT
  p.id, p.mesa,
  p.fecha_registro, p.fecha_inicio_preparacion, p.fecha_listo, p.fecha_entregado,
  TIMESTAMPDIFF(MINUTE, p.fecha_registro, p.fecha_entregado) AS minutos_totales
FROM pedidos p
WHERE p.pagado = 1
ORDER BY p.fecha_registro DESC;

-- ---------------------------------------------------------------------
-- Nota sobre NF004 (Seguridad / control de acceso)
-- ---------------------------------------------------------------------
-- El ERS pide autenticación por rol, bloqueo tras 3 intentos fallidos
-- consecutivos y registro de fecha/hora de cada intento. La
-- implementación actual (src/auth.js + tabla `intentos_acceso`) usa un
-- PIN compartido por rol en vez de usuarios/contraseña individuales
-- (más simple para el prototipo), pero SÍ cumple el resto al pie de la
-- letra: cada intento (éxito o fallo) queda registrado con fecha y
-- hora en `intentos_acceso`, y el rol se bloquea temporalmente tras 3
-- fallos consecutivos. Si el proyecto necesita usuarios individuales
-- (para saber qué persona hizo cada acción), el siguiente paso sería
-- agregar una tabla `empleados` (cedula, nombre_completo, usuario,
-- contrasena_hash, rol) y adaptar auth.js para validar contra ella en
-- vez del PIN, reutilizando la misma tabla `intentos_acceso` para el
-- registro/bloqueo.