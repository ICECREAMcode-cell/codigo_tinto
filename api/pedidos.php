<?php
require_once 'db.php';
session_start();

$metodo = $_SERVER['REQUEST_METHOD'];

// 1. CREAR PEDIDO + FACTURAR (Checkout GPS)
if ($metodo === 'POST') {
    if (empty($_SESSION['cuenta_id'])) {
        http_response_code(401);
        echo json_encode(["status" => "error", "mensaje" => "Debes iniciar sesión para realizar una compra."]);
        exit;
    }

    $data = json_decode(file_get_contents("php://input"), true);

    if (empty($data['items']) || empty($data['cuenta_id'])) {
        echo json_encode(["status" => "error", "mensaje" => "El pedido debe incluir cliente y productos."]);
        exit;
    }

    try {
        $pdo->beginTransaction();

        $cuenta_id     = (int)$_SESSION['cuenta_id'];
        $metodo_pago   = intval($data['metodo_pago_id'] ?? 1);
        $latitud       = $data['latitud'] ?? -21.5355;
        $longitud      = $data['longitud'] ?? -64.7296;
        $direccion_ref = trim($data['direccion_referencia'] ?? 'Ubicación seleccionada vía GPS');
        $tiempo_est    = intval($data['tiempo_estimado_min'] ?? 35);
        $total         = floatval($data['total'] ?? 0.0);
        $items         = $data['items']; // Array [{id_producto, cantidad, precio_unitario}]

        if ($cuenta_id <= 0) {
            throw new Exception("El cliente es obligatorio para confirmar el pedido.");
        }

        $stmtCuenta = $pdo->prepare("SELECT activo FROM cuentas WHERE id = ? LIMIT 1");
        $stmtCuenta->execute([$cuenta_id]);
        $cuenta = $stmtCuenta->fetch();
        if (!$cuenta || (int)$cuenta['activo'] !== 1) {
            throw new Exception("La cuenta no está habilitada para realizar compras.");
        }

        if ($metodo_pago <= 0) {
            throw new Exception("Debe seleccionar un método de pago válido.");
        }

        $total_calculado = 0.0;
        $stmtProducto = $pdo->prepare("SELECT id_producto, nombre, stock, activo FROM productos WHERE id_producto = ? LIMIT 1");

        foreach ($items as $item) {
            if (!isset($item['id_producto'], $item['cantidad'])) {
                throw new Exception("Cada producto del pedido debe incluir id_producto y cantidad.");
            }

            $id_prod  = intval($item['id_producto']);
            $cant     = intval($item['cantidad']);
            $precio_u = floatval($item['precio_unitario'] ?? 0);

            if ($id_prod <= 0) {
                throw new Exception("Identificador de producto inválido.");
            }

            if ($cant <= 0) {
                throw new Exception("La cantidad debe ser mayor a 0 para cada producto.");
            }

            if ($precio_u < 0) {
                throw new Exception("El precio unitario no puede ser negativo.");
            }

            $stmtProducto->execute([$id_prod]);
            $producto = $stmtProducto->fetch();

            if (!$producto || (int)$producto['activo'] !== 1) {
                throw new Exception("El producto ID: $id_prod no existe o está inactivo.");
            }

            if ($cant > (int)$producto['stock']) {
                throw new Exception("Stock insuficiente para el producto: " . $producto['nombre'] . ". Disponible: " . $producto['stock']);
            }

            $subtotal = $cant * $precio_u;
            $total_calculado += $subtotal;
        }

        if ($total <= 0 || abs($total - $total_calculado) > 0.01) {
            throw new Exception("El total del pedido no coincide con el monto calculado.");
        }

        // A. Insertar Pedido
        $stmtPed = $pdo->prepare("INSERT INTO pedidos (cuenta_id, metodo_pago_id, latitud, longitud, direccion_referencia, tiempo_estimado_min, total, estado) 
                                  VALUES (?, ?, ?, ?, ?, ?, ?, 'Pendiente')");
        $stmtPed->execute([$cuenta_id, $metodo_pago, $latitud, $longitud, $direccion_ref, $tiempo_est, $total]);
        $id_pedido = $pdo->lastInsertId();

        // B. Insertar Detalle y Actualizar Inventario
        $stmtDetalle = $pdo->prepare("INSERT INTO detallepedidos (id_pedido, id_producto, cantidad, precio_unitario, subtotal) VALUES (?, ?, ?, ?, ?)");
        $stmtStock   = $pdo->prepare("UPDATE productos SET stock = stock - ? WHERE id_producto = ? AND stock >= ?");

        foreach ($items as $item) {
            $id_prod  = intval($item['id_producto']);
            $cant     = intval($item['cantidad']);
            $precio_u = floatval($item['precio_unitario']);
            $subtotal = $cant * $precio_u;

            $stmtDetalle->execute([$id_pedido, $id_prod, $cant, $precio_u, $subtotal]);

            $stmtStock->execute([$cant, $id_prod, $cant]);
            if ($stmtStock->rowCount() === 0) {
                throw new Exception("Stock insuficiente para el producto ID: $id_prod");
            }
        }

        // C. Generar Factura Digital Automática
        $nro_factura  = "CT-" . date("Y") . "-" . str_pad($id_pedido, 5, "0", STR_PAD_LEFT);
        $nit_ci       = trim($data['nit_ci'] ?? '8492014');
        $razon_social = trim($data['razon_social'] ?? 'Consumidor Final');

        $stmtFac = $pdo->prepare("INSERT INTO facturas (id_pedido, nro_factura, nit_ci, razon_social, monto_total, estado_pago) 
                                  VALUES (?, ?, ?, ?, ?, 'PAGADO')");
        $stmtFac->execute([$id_pedido, $nro_factura, $nit_ci, $razon_social, $total]);

        $pdo->commit();

        echo json_encode([
            "status" => "ok",
            "id_pedido" => $id_pedido,
            "nro_factura" => $nro_factura,
            "mensaje" => "Pedido y Factura generados exitosamente."
        ]);
    } catch (\Exception $e) {
        $pdo->rollBack();
        echo json_encode(["status" => "error", "mensaje" => $e->getMessage()]);
    }
    exit;
}

// 2. GET: LISTAR PEDIDOS (Tanto para el Administrador como para "Mis Pedidos" del Cliente)
if ($metodo === 'GET') {
    $cuenta_id = $_GET['cuenta_id'] ?? null;
    $estado    = $_GET['estado'] ?? 'todos';

    $sql = "SELECT p.*, c.username, c.telefono, m.nombre AS metodo_pago, f.nro_factura, f.estado_pago
            FROM pedidos p
            INNER JOIN cuentas c ON p.cuenta_id = c.id
            INNER JOIN metodospago m ON p.metodo_pago_id = m.id_metodo
            LEFT JOIN facturas f ON p.id_pedido = f.id_pedido
            WHERE 1=1";

    $params = [];
    if ($cuenta_id) {
        $sql .= " AND p.cuenta_id = :cuenta_id";
        $params[':cuenta_id'] = $cuenta_id;
    }

    if ($estado !== 'todos') {
        $sql .= " AND p.estado = :estado";
        $params[':estado'] = $estado;
    }

    $sql .= " ORDER BY p.fecha_pedido DESC";
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $pedidos = $stmt->fetchAll();

    echo json_encode(["status" => "ok", "data" => $pedidos]);
    exit;
}

// 3. PUT: ACTUALIZAR ESTADO DEL PEDIDO (Exclusivo Admin: Despachar / Entregar)
if ($metodo === 'PUT') {
    $datos = json_decode(file_get_contents("php://input"), true);
    $id_pedido   = intval($datos['id_pedido'] ?? 0);
    $nuevoEstado = $datos['estado'] ?? '';

    if (!$id_pedido || !in_array($nuevoEstado, ['Pendiente', 'En camino', 'Entregado', 'Cancelado'])) {
        echo json_encode(["status" => "error", "mensaje" => "Datos de estado inválidos."]);
        exit;
    }

    $stmt = $pdo->prepare("UPDATE pedidos SET estado = ? WHERE id_pedido = ?");
    $stmt->execute([$nuevoEstado, $id_pedido]);

    echo json_encode(["status" => "ok", "mensaje" => "Estado de pedido actualizado a: $nuevoEstado"]);
    exit;
}
?>