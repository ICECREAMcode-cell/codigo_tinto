<?php
// 1. Mostrar errores en pantalla para saber qué pasa exactamente
ini_set('display_errors', 1);
ini_set('display_startup_errors', 1);
error_reporting(E_ALL);

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');
header('Content-Type: application/json; charset=UTF-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// 2. Datos de conexión
$host    = 'sql105.byethost8.com';
$db      = 'b8_43003744_codigo_tinto_db';
$user    = 'b8_43003744';
$pass    = 'Carlos123';
$charset = 'utf8mb4';

// Quitamos el ;port=3306 explícito que a veces rompe la resolución en Byethost
$dsn = "mysql:host=$host;dbname=$db;charset=$charset";
$options = [
    PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    PDO::ATTR_EMULATE_PREPARES   => false,
];

try {
    $pdo = new PDO($dsn, $user, $pass, $options);
} catch (\PDOException $e) {
    http_response_code(500);
    echo json_encode([
        "status" => "error",
        "mensaje" => "Error PDO: " . $e->getMessage()
    ]);
    exit;
}
?>