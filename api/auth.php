<?php
require_once 'db.php';
session_start();

$accion = $_GET['accion'] ?? '';
$input  = json_decode(file_get_contents("php://input"), true) ?? $_POST;

// 1. REGISTRO
if ($accion === 'registro') {
    $username  = trim($input['username'] ?? '');
    $correo    = trim($input['correo'] ?? '');
    $password  = trim($input['contrasena'] ?? '');
    $ci        = trim($input['ci'] ?? '');
    $fecha_nac = trim($input['fecha_nacimiento'] ?? '');
    $telefono  = trim($input['telefono'] ?? '');

    if (empty($username) || empty($correo) || empty($password) || empty($ci) || empty($fecha_nac)) {
        echo json_encode(["status" => "error", "mensaje" => "Todos los campos obligatorios deben ser llenados."]);
        exit;
    }

    if (strlen($username) < 3) {
        echo json_encode(["status" => "error", "mensaje" => "El nombre de usuario debe tener al menos 3 caracteres."]);
        exit;
    }

    if (!filter_var($correo, FILTER_VALIDATE_EMAIL)) {
        echo json_encode(["status" => "error", "mensaje" => "El correo electrónico no es válido."]);
        exit;
    }

    if (strlen($password) < 6) {
        echo json_encode(["status" => "error", "mensaje" => "La contraseña debe tener al menos 6 caracteres."]);
        exit;
    }

    if (strlen($ci) < 5) {
        echo json_encode(["status" => "error", "mensaje" => "El CI es obligatorio y debe ser válido."]);
        exit;
    }

    try {
        $nacimiento = new DateTime($fecha_nac);
        $hoy = new DateTime();
        $edad = $hoy->diff($nacimiento)->y;

        if ($edad < 18) {
            echo json_encode(["status" => "error", "mensaje" => "Debes ser mayor de 18 años para registrarte."]);
            exit;
        }
    } catch (Exception $e) {
        echo json_encode(["status" => "error", "mensaje" => "La fecha de nacimiento no es válida."]);
        exit;
    }

    $passHash = password_hash($password, PASSWORD_BCRYPT);

    try {
        $stmt = $pdo->prepare("INSERT INTO cuentas (username, correo, contrasena, ci, fecha_nacimiento, telefono, rol_id, activo) 
                               VALUES (?, ?, ?, ?, ?, ?, 3, 1)");
        $stmt->execute([$username, $correo, $passHash, $ci, $fecha_nac, $telefono]);

        echo json_encode(["status" => "ok", "mensaje" => "Cuenta registrada con éxito."]);
    } catch (\PDOException $e) {
        echo json_encode(["status" => "error", "mensaje" => "El usuario, correo o CI ya se encuentra registrado."]);
    }
    exit;
}

// 2. LOGIN
if ($accion === 'login') {
    $identificador = trim($input['usuario_o_correo'] ?? '');
    $password      = trim($input['contrasena'] ?? '');

    $stmt = $pdo->prepare("SELECT c.*, r.Rol, r.subir_productos, r.gestionar_pedidos, r.gestionar_temporadas, 
                                  r.ajustar_stock, r.eliminar_usuarios, r.eliminar_Admins
                           FROM cuentas c
                           INNER JOIN roles r ON c.rol_id = r.Rol_id
                           WHERE c.username = ? OR c.correo = ?");
    $stmt->execute([$identificador, $identificador]);
    $cuenta = $stmt->fetch();

    if ($cuenta && password_verify($password, $cuenta['contrasena'])) {
        if (isset($cuenta['activo']) && (int)$cuenta['activo'] === 0) {
            echo json_encode(["status" => "error", "mensaje" => "Esta cuenta se encuentra inactiva o dada de baja."]);
            exit;
        }

        $_SESSION['cuenta_id'] = (int)$cuenta['id'];
        unset($cuenta['contrasena']);
        echo json_encode([
            "status" => "ok",
            "mensaje" => "Bienvenido " . $cuenta['username'],
            "usuario" => $cuenta
        ]);
    } else {
        echo json_encode(["status" => "error", "mensaje" => "Credenciales incorrectas."]);
    }
    exit;
}

// 3. CERRAR SESION
if ($accion === 'logout') {
    $_SESSION = [];
    if (ini_get('session.use_cookies')) {
        $parametrosCookie = session_get_cookie_params();
        setcookie(session_name(), '', time() - 42000, $parametrosCookie['path'], $parametrosCookie['domain'], $parametrosCookie['secure'], $parametrosCookie['httponly']);
    }
    session_destroy();
    echo json_encode(["status" => "ok", "mensaje" => "Sesión cerrada."]);
    exit;
}

// 4. LISTAR USUARIOS
if ($accion === 'listar_usuarios') {
    $stmt = $pdo->query("SELECT c.id, c.username, c.correo, c.ci, c.telefono, c.creado_en, c.activo, c.rol_id, r.Rol 
                         FROM cuentas c
                         INNER JOIN roles r ON c.rol_id = r.Rol_id
                         ORDER BY c.id DESC");
    echo json_encode(["status" => "ok", "data" => $stmt->fetchAll()]);
    exit;
}

// 4. CAMBIAR ESTADO (TOGGLE ACTIVAR / DAR DE BAJA) CON VALIDACIÓN ESTRICTA
if ($accion === 'cambiar_estado_usuario') {
    $idObjetivo    = intval($input['id_usuario'] ?? 0);
    $nuevoEstado   = intval($input['activo'] ?? 0);
    $solicitanteId = intval($input['solicitante_id'] ?? 0);

    // Obtener datos del solicitante
    $stmtSol = $pdo->prepare("SELECT c.rol_id, r.Rol FROM cuentas c INNER JOIN roles r ON c.rol_id = r.Rol_id WHERE c.id = ?");
    $stmtSol->execute([$solicitanteId]);
    $solicitante = $stmtSol->fetch();

    if (!$solicitante || ($solicitante['Rol'] !== 'SEO' && $solicitante['Rol'] !== 'Admin')) {
        echo json_encode(["status" => "error", "mensaje" => "No tienes permisos de gestión."]);
        exit;
    }

    // Obtener rol del objetivo
    $stmtObj = $pdo->prepare("SELECT rol_id FROM cuentas WHERE id = ?");
    $stmtObj->execute([$idObjetivo]);
    $objetivo = $stmtObj->fetch();

    if (!$objetivo) {
        echo json_encode(["status" => "error", "mensaje" => "Usuario no encontrado."]);
        exit;
    }

    // Regla de jerarquía: Admin solo puede modificar Clientes (rol_id = 3)
    if ($solicitante['Rol'] === 'Admin' && (int)$objetivo['rol_id'] !== 3) {
        echo json_encode(["status" => "error", "mensaje" => "Acceso denegado: Los administradores solo pueden gestionar clientes."]);
        exit;
    }

    // No auto-suspensión para el SEO
    if ($solicitanteId === $idObjetivo && $nuevoEstado === 0) {
        echo json_encode(["status" => "error", "mensaje" => "No puedes darte de baja a ti mismo."]);
        exit;
    }

    $stmtUpdate = $pdo->prepare("UPDATE cuentas SET activo = ? WHERE id = ?");
    $stmtUpdate->execute([$nuevoEstado, $idObjetivo]);

    echo json_encode(["status" => "ok", "mensaje" => "Estado de la cuenta actualizado exitosamente."]);
    exit;
}

// 5. SOPORTE: HISTORIAL DE PEDIDOS Y RESEÑAS DEL USUARIO
if ($accion === 'historial_soporte') {
    $cuenta_id = intval($_GET['cuenta_id'] ?? 0);

    // Pedidos
    $stmtP = $pdo->prepare("SELECT id_pedido, fecha_pedido, estado, total, direccion_referencia FROM pedidos WHERE cuenta_id = ? ORDER BY id_pedido DESC");
    $stmtP->execute([$cuenta_id]);
    $pedidos = $stmtP->fetchAll();

    // Reseñas
    $stmtR = $pdo->prepare("SELECT r.estrellas, r.comentario, r.fecha_resena, p.nombre AS producto 
                           FROM resenas r 
                           INNER JOIN productos p ON r.id_producto = p.id_producto 
                           WHERE r.cuenta_id = ? ORDER BY r.id_resena DESC");
    $stmtR->execute([$cuenta_id]);
    $resenas = $stmtR->fetchAll();

    echo json_encode([
        "status" => "ok",
        "pedidos" => $pedidos,
        "resenas" => $resenas
    ]);
    exit;
}

// 6. RESTABLECER CONTRASEÑA PROVISIONAL (BUENA PRÁCTICA DE SOPORTE)
if ($accion === 'reset_password_soporte') {
    $idObjetivo = intval($input['id_usuario'] ?? 0);
    $nuevaClave = "Tinto@" . rand(1000, 9999);
    $passHash   = password_hash($nuevaClave, PASSWORD_BCRYPT);

    $stmt = $pdo->prepare("UPDATE cuentas SET contrasena = ? WHERE id = ?");
    $stmt->execute([$passHash, $idObjetivo]);

    echo json_encode([
        "status" => "ok",
        "clave_temporal" => $nuevaClave,
        "mensaje" => "Contraseña restablecida con éxito."
    ]);
    exit;
}
?>