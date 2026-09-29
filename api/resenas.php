<?php
require_once 'db.php';
session_start();

$metodo = $_SERVER['REQUEST_METHOD'];
$cuentaId = (int)($_SESSION['cuenta_id'] ?? 0);

if ($cuentaId <= 0) {
    http_response_code(401);
    echo json_encode(["status" => "error", "mensaje" => "Debes iniciar sesión para gestionar reseñas."]);
    exit;
}

if ($metodo === 'GET') {
    $stmt = $pdo->prepare(
        "SELECT p.id_pedido, p.fecha_pedido, p.estado, p.total, p.direccion_referencia,
                d.id_producto, d.cantidad, pr.nombre AS producto,
                r.id_resena, r.estrellas, r.comentario, r.fecha_resena
         FROM pedidos p
         INNER JOIN detallepedidos d ON d.id_pedido = p.id_pedido
         INNER JOIN productos pr ON pr.id_producto = d.id_producto
         LEFT JOIN resenas r ON r.id_pedido = p.id_pedido
                             AND r.id_producto = d.id_producto
                             AND r.cuenta_id = p.cuenta_id
         WHERE p.cuenta_id = ?
         ORDER BY p.fecha_pedido DESC, d.id_detalle ASC"
    );
    $stmt->execute([$cuentaId]);

    $pedidos = [];
    foreach ($stmt->fetchAll() as $fila) {
        $idPedido = (int)$fila['id_pedido'];
        if (!isset($pedidos[$idPedido])) {
            $pedidos[$idPedido] = [
                "id_pedido" => $idPedido,
                "fecha_pedido" => $fila['fecha_pedido'],
                "estado" => $fila['estado'],
                "total" => $fila['total'],
                "direccion_referencia" => $fila['direccion_referencia'],
                "productos" => []
            ];
        }

        $pedidos[$idPedido]['productos'][] = [
            "id_producto" => (int)$fila['id_producto'],
            "producto" => $fila['producto'],
            "cantidad" => (int)$fila['cantidad'],
            "resena" => $fila['id_resena'] ? [
                "id_resena" => (int)$fila['id_resena'],
                "estrellas" => (int)$fila['estrellas'],
                "comentario" => $fila['comentario'],
                "fecha_resena" => $fila['fecha_resena']
            ] : null
        ];
    }

    echo json_encode(["status" => "ok", "data" => array_values($pedidos)]);
    exit;
}

if ($metodo === 'POST') {
    $datos = json_decode(file_get_contents('php://input'), true) ?? [];
    $idPedido = (int)($datos['id_pedido'] ?? 0);
    $idProducto = (int)($datos['id_producto'] ?? 0);
    $estrellas = (int)($datos['estrellas'] ?? 0);
    $comentario = trim((string)($datos['comentario'] ?? ''));

    if ($idPedido <= 0 || $idProducto <= 0 || $estrellas < 1 || $estrellas > 5) {
        http_response_code(422);
        echo json_encode(["status" => "error", "mensaje" => "Pedido, producto y una calificación de 1 a 5 son obligatorios."]);
        exit;
    }

    if (strlen($comentario) > 1000) {
        http_response_code(422);
        echo json_encode(["status" => "error", "mensaje" => "El comentario no puede superar los 1000 caracteres."]);
        exit;
    }

    $stmtCompra = $pdo->prepare(
        "SELECT p.id_pedido
         FROM pedidos p
         INNER JOIN detallepedidos d ON d.id_pedido = p.id_pedido
         WHERE p.id_pedido = ? AND p.cuenta_id = ? AND p.estado = 'Entregado' AND d.id_producto = ?
         LIMIT 1"
    );
    $stmtCompra->execute([$idPedido, $cuentaId, $idProducto]);

    if (!$stmtCompra->fetch()) {
        http_response_code(403);
        echo json_encode(["status" => "error", "mensaje" => "Solo puedes reseñar productos de tus pedidos entregados."]);
        exit;
    }

    try {
        $stmt = $pdo->prepare(
            "INSERT INTO resenas (id_producto, cuenta_id, id_pedido, estrellas, comentario)
             VALUES (?, ?, ?, ?, ?)"
        );
        $stmt->execute([$idProducto, $cuentaId, $idPedido, $estrellas, $comentario ?: null]);
        echo json_encode(["status" => "ok", "mensaje" => "Reseña guardada correctamente."]);
    } catch (PDOException $e) {
        if ((int)$e->errorInfo[1] === 1062) {
            http_response_code(409);
            echo json_encode(["status" => "error", "mensaje" => "Ya dejaste una reseña para este producto en ese pedido."]);
        } else {
            http_response_code(500);
            echo json_encode(["status" => "error", "mensaje" => "No se pudo guardar la reseña."]);
        }
    }
    exit;
}

http_response_code(405);
echo json_encode(["status" => "error", "mensaje" => "Método no permitido."]);
?>
