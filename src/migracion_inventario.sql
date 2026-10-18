-- =====================================================================
-- PidaPues — MIGRACIÓN: inventario y reportes (NO borra tus datos)
-- ---------------------------------------------------------------------
-- Úsala si ya tienes la base funcionando con pedidos y NO quieres volver
-- a ejecutar schema.sql completo (que borra todo). Es seguro correrla
-- varias veces.
-- =====================================================================
USE pidapues;

CREATE TABLE IF NOT EXISTS inventario (
  id_producto    INT NOT NULL,
  stock_actual   INT NOT NULL DEFAULT 0,
  stock_minimo   INT NOT NULL DEFAULT 10 COMMENT 'Debajo de este valor el reporte marca "bajo mínimo"',
  actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id_producto),
  CONSTRAINT chk_inventario_stock CHECK (stock_actual >= 0 AND stock_minimo >= 0),
  CONSTRAINT fk_inventario_producto FOREIGN KEY (id_producto) REFERENCES producto(id_producto)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Existencias y stock mínimo de cada producto';

-- Existencias iniciales solo para los productos que aún no tienen fila.
INSERT INTO inventario (id_producto, stock_actual, stock_minimo)
SELECT pr.id_producto, 50, 10
FROM producto pr
LEFT JOIN inventario i ON i.id_producto = pr.id_producto
WHERE i.id_producto IS NULL;

CREATE OR REPLACE VIEW vista_productos_menu AS
SELECT
  pr.id_producto,
  c.nombre_categoria,
  pr.nombre_producto,
  pr.descripcion,
  pr.precio_unidad,
  pr.url_imagen,
  i.stock_actual
FROM producto pr
JOIN categoria c        ON c.id_categoria = pr.id_categoria
LEFT JOIN inventario i  ON i.id_producto = pr.id_producto
WHERE pr.disponible = 1
ORDER BY pr.id_producto;

-- =====================================================================
-- VISTAS DE REPORTES (panel de administración: ventas e inventario)
-- =====================================================================

-- Un renglón por pago aprobado (ventas por día y por método de pago).
CREATE OR REPLACE VIEW vista_reporte_pagos AS
SELECT
  pg.id_pedido,
  DATE(pg.fecha_hora) AS fecha,
  pg.metodo_pago,
  pg.valor_total
FROM pago pg
WHERE pg.estado_pago = 'aprobado';

-- Un renglón por producto vendido en pedidos con pago aprobado.
CREATE OR REPLACE VIEW vista_reporte_ventas_producto AS
SELECT
  DATE(pg.fecha_hora) AS fecha,
  d.id_pedido,
  d.id_producto,
  pr.nombre_producto,
  c.nombre_categoria,
  d.cantidad,
  d.subtotal
FROM detalle_pedido d
JOIN pago pg      ON pg.id_pedido = d.id_pedido AND pg.estado_pago = 'aprobado'
JOIN producto pr  ON pr.id_producto = d.id_producto
JOIN categoria c  ON c.id_categoria = pr.id_categoria;

-- Existencias por producto y si están por debajo del mínimo.
CREATE OR REPLACE VIEW vista_reporte_inventario AS
SELECT
  pr.id_producto,
  pr.nombre_producto,
  c.nombre_categoria,
  pr.disponible,
  IFNULL(i.stock_actual, 0) AS stock_actual,
  IFNULL(i.stock_minimo, 0) AS stock_minimo,
  IF(IFNULL(i.stock_actual, 0) <= IFNULL(i.stock_minimo, 0), 1, 0) AS bajo_minimo
FROM producto pr
JOIN categoria c        ON c.id_categoria = pr.id_categoria
LEFT JOIN inventario i  ON i.id_producto = pr.id_producto
ORDER BY pr.id_producto;
