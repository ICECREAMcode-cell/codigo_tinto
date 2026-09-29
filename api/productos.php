<?php
require_once 'db.php';

$metodo = $_SERVER['REQUEST_METHOD'];

// 1. GET: LISTAR PRODUCTOS (Para index.html, catalogo.html y admin)
if ($metodo === 'GET') {
    $categoria = $_GET['categoria'] ?? 'todos';
    $epoca     = $_GET['epoca'] ?? 'todas';
    $buscar    = $_GET['buscar'] ?? '';

    // Consulta con JOIN a categorías, temporadas y subconsulta para el promedio de estrellas
    $sql = "SELECT p.*, 
                   c.nombre AS categoria_nombre, c.slug AS categoria_slug, 
                   t.nombre AS temporada_nombre,
                   COALESCE(AVG(r.estrellas), 5.0) AS rating_promedio,
                   COUNT(r.id_resena) AS total_resenas
            FROM productos p
            INNER JOIN categorias c ON p.id_categoria = c.id_categoria
            INNER JOIN temporadas t ON p.id_temporada = t.id_temporada
            LEFT JOIN resenas r ON p.id_producto = r.id_producto
            WHERE p.activo = 1";

    $params = [];

    if ($categoria !== 'todos') {
        $sql .= " AND c.slug = :categoria";
        $params[':categoria'] = $categoria;
    }

    if ($epoca !== 'todas') {
        $sql .= " AND t.nombre LIKE :epoca";
        $params[':epoca'] = "%$epoca%";
    }

    if (!empty($buscar)) {
        $sql .= " AND (p.nombre LIKE :buscar OR p.descripcion LIKE :buscar OR p.cepa LIKE :buscar)";
        $params[':buscar'] = "%$buscar%";
    }

    $sql .= " GROUP BY p.id_producto ORDER BY p.id_producto DESC";

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $productos = $stmt->fetchAll();

    echo json_encode(["status" => "ok", "data" => $productos]);
    exit;
}

// 2. POST: SUBIR NUEVO PRODUCTO (Panel Admin con imagen Base64)
if ($metodo === 'POST') {
    $datos = json_decode(file_get_contents("php://input"), true) ?? $_POST;

    $id_cat     = intval($datos['id_categoria'] ?? 0);
    $id_temp    = intval($datos['id_temporada'] ?? 0);
    $nombre     = trim($datos['nombre'] ?? '');
    $desc       = trim($datos['descripcion'] ?? '');
    $cepa       = trim($datos['cepa'] ?? '');
    $graduacion = floatval($datos['graduacion_alcoholica'] ?? 14.0);
    $precio     = floatval($datos['precio'] ?? 0.0);
    $stock      = intval($datos['stock'] ?? 0);
    $imagen_b64 = $datos['imagen_url'] ?? ''; // Cadena Base64 comprimida con Canvas

    if ($id_cat <= 0 || $id_temp <= 0) {
        echo json_encode(["status" => "error", "mensaje" => "La categoría y la temporada son obligatorias."]);
        exit;
    }

    if (empty($nombre) || strlen($nombre) < 3) {
        echo json_encode(["status" => "error", "mensaje" => "El nombre del producto es obligatorio y debe tener al menos 3 caracteres."]);
        exit;
    }

    if ($precio <= 0) {
        echo json_encode(["status" => "error", "mensaje" => "El precio debe ser mayor a 0."]);
        exit;
    }

    if ($stock < 0) {
        echo json_encode(["status" => "error", "mensaje" => "El stock no puede ser menor a 0."]);
        exit;
    }

    if (empty($imagen_b64)) {
        echo json_encode(["status" => "error", "mensaje" => "Debe adjuntar una imagen válida para el producto."]);
        exit;
    }

    $checkDuplicado = $pdo->prepare("SELECT id_producto FROM productos WHERE activo = 1 AND LOWER(nombre) = LOWER(?) LIMIT 1");
    $checkDuplicado->execute([$nombre]);
    if ($checkDuplicado->fetch()) {
        echo json_encode(["status" => "error", "mensaje" => "Ya existe un producto con ese nombre en el catálogo."]);
        exit;
    }

    $sql = "INSERT INTO productos (id_categoria, id_temporada, nombre, descripcion, cepa, graduacion_alcoholica, precio, stock, imagen_url) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)";
    $stmt = $pdo->prepare($sql);
    $stmt->execute([$id_cat, $id_temp, $nombre, $desc, $cepa, $graduacion, $precio, $stock, $imagen_b64]);

    echo json_encode([
        "status" => "ok",
        "id_producto" => $pdo->lastInsertId(),
        "mensaje" => "Producto registrado correctamente en el catálogo."
    ]);
    exit;
}

// 3. PUT: ACTUALIZAR PRODUCTO (Dashboard Admin)
if ($metodo === 'PUT') {
    $datos = json_decode(file_get_contents("php://input"), true);
    $id_producto = intval($_GET['id'] ?? $datos['id_producto'] ?? 0);

    if ($id_producto <= 0) {
        echo json_encode(["status" => "error", "mensaje" => "ID del producto no válido."]);
        exit;
    }

    $id_cat     = intval($datos['id_categoria'] ?? 0);
    $id_temp    = intval($datos['id_temporada'] ?? 0);
    $nombre     = trim($datos['nombre'] ?? '');
    $desc       = trim($datos['descripcion'] ?? '');
    $cepa       = trim($datos['cepa'] ?? '');
    $graduacion = floatval($datos['graduacion_alcoholica'] ?? 14.0);
    $precio     = floatval($datos['precio'] ?? 0.0);
    $stock      = intval($datos['stock'] ?? 0);
    $imagen_b64 = $datos['imagen_url'] ?? '';

    if ($id_cat <= 0 || $id_temp <= 0) {
        echo json_encode(["status" => "error", "mensaje" => "La categoría y la temporada son obligatorias."]);
        exit;
    }

    if (empty($nombre) || strlen($nombre) < 3) {
        echo json_encode(["status" => "error", "mensaje" => "El nombre del producto es obligatorio y debe tener al menos 3 caracteres."]);
        exit;
    }

    if ($precio <= 0) {
        echo json_encode(["status" => "error", "mensaje" => "El precio debe ser mayor a 0."]);
        exit;
    }

    if ($stock < 0) {
        echo json_encode(["status" => "error", "mensaje" => "El stock no puede ser menor a 0."]);
        exit;
    }

    if (empty($imagen_b64)) {
        echo json_encode(["status" => "error", "mensaje" => "Debe conservar o cargar una imagen válida para el producto."]);
        exit;
    }

    $checkDuplicado = $pdo->prepare("SELECT id_producto FROM productos WHERE activo = 1 AND id_producto != ? AND LOWER(nombre) = LOWER(?) LIMIT 1");
    $checkDuplicado->execute([$id_producto, $nombre]);
    if ($checkDuplicado->fetch()) {
        echo json_encode(["status" => "error", "mensaje" => "Ya existe otro producto con ese nombre en el catálogo."]);
        exit;
    }

    $stmt = $pdo->prepare("UPDATE productos SET id_categoria = ?, id_temporada = ?, nombre = ?, descripcion = ?, cepa = ?, graduacion_alcoholica = ?, precio = ?, stock = ?, imagen_url = ? WHERE id_producto = ?");
    $stmt->execute([$id_cat, $id_temp, $nombre, $desc, $cepa, $graduacion, $precio, $stock, $imagen_b64, $id_producto]);

    echo json_encode(["status" => "ok", "mensaje" => "Producto actualizado correctamente."]);
    exit;
}

// 4. DELETE: DAR DE BAJA
if ($metodo === 'DELETE') {
    $id_producto = $_GET['id'] ?? null;
    if (!$id_producto) {
        echo json_encode(["status" => "error", "mensaje" => "ID no proporcionado."]);
        exit;
    }
    // Baja lógica (activo = 0) para no romper históricos de pedidos pasados
    $stmt = $pdo->prepare("UPDATE productos SET activo = 0 WHERE id_producto = ?");
    $stmt->execute([$id_producto]);

    echo json_encode(["status" => "ok", "mensaje" => "Producto dado de baja."]);
    exit;
}
?>