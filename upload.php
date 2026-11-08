<?php
// ============================
//  CORS (Netlify dev + Ferozo prod)
// ============================
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';

$allowedOrigins = [
    'https://fletesenki.com.ar',        // prod Ferozo
    'https://fletes-enki.netlify.app',  // dev Netlify
];

if (in_array($origin, $allowedOrigins, true)) {
    header("Access-Control-Allow-Origin: $origin");
    header("Access-Control-Allow-Credentials: true");
}

header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");

// Preflight
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// Respuestas en JSON
header('Content-Type: application/json; charset=utf-8');

// ============================
//  Config básica
// ============================
// Este archivo está en /public_html/public/upload.php
// La carpeta de subida está en /public_html/public/uploads
$baseDir = __DIR__ . '/uploads'; // /public_html/public/uploads

// URL pública equivalente a esa carpeta:
$baseUrl = 'https://fletesenki.com.ar/public/uploads';

$maxSize    = 5 * 1024 * 1024; // 5 MB
$allowedExt = ['jpg', 'jpeg', 'png', 'webp', 'gif'];

// ============================
//  Helpers
// ============================
function json_error($msg, $code = 400) {
    http_response_code($code);
    echo json_encode(['ok' => false, 'error' => $msg], JSON_UNESCAPED_UNICODE);
    exit;
}

function sanitize_name($name) {
    $name = preg_replace('/[^\w\.\-]/u', '_', $name);
    return trim($name, '._');
}

// ============================
//  Validar input
// ============================
if (empty($_FILES['file']) || $_FILES['file']['error'] !== UPLOAD_ERR_OK) {
    json_error('Archivo no recibido o error en la subida.');
}

$env     = isset($_POST['env']) ? strtolower($_POST['env']) : 'prod';      // dev | prod
$type    = isset($_POST['type']) ? strtolower($_POST['type']) : 'viajes';  // viajes | notas
$fletero = isset($_POST['fletero']) ? sanitize_name($_POST['fletero']) : '';
$fecha   = isset($_POST['fecha']) ? sanitize_name($_POST['fecha']) : date('Y-m-d');

if (!in_array($env, ['dev', 'prod'], true)) {
    json_error('env inválido (usar dev o prod).');
}
if (!in_array($type, ['viajes', 'notas'], true)) {
    json_error('type inválido (usar viajes o notas).');
}

$file = $_FILES['file'];

if ($file['size'] > $maxSize) {
    json_error('El archivo supera el tamaño máximo permitido (5 MB).');
}

// extensión
$ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
if (!in_array($ext, $allowedExt, true)) {
    json_error('Tipo de archivo no permitido. Solo imágenes JPG/PNG/WEBP/GIF.');
}

// ============================
//  Armar ruta destino
// ============================
// Estructura:
// /uploads/{env}/{type}/{fletero}/{fecha}/archivo.ext
// Ej: /uploads/dev/viajes/12345678/2025-11-26/xxxxx.jpg
$subPathParts = [$env, $type];
if ($fletero !== '') $subPathParts[] = $fletero;
if ($fecha !== '')   $subPathParts[] = $fecha;

$subDir     = implode('/', $subPathParts);        // dev/viajes/99999/2025-11-26
$targetDir  = rtrim($baseDir, '/') . '/' . $subDir;

if (!is_dir($targetDir)) {
    if (!mkdir($targetDir, 0755, true)) {
        json_error('No se pudo crear el directorio destino.');
    }
}

// nombre único
$baseName = pathinfo($file['name'], PATHINFO_FILENAME);
$baseName = sanitize_name($baseName);

try {
    $random   = bin2hex(random_bytes(4));
} catch (Exception $e) {
    $random = bin2hex(openssl_random_pseudo_bytes(4));
}

$filename   = time() . '_' . $random . '_' . $baseName . '.' . $ext;
$targetPath = $targetDir . '/' . $filename;

// ============================
//  Mover archivo
// ============================
if (!move_uploaded_file($file['tmp_name'], $targetPath)) {
    json_error('No se pudo guardar el archivo en el servidor.');
}

// ============================
//  URL pública y path lógico
// ============================
// Esto es lo que guardás en Firestore:
//   path: dev/viajes/9999/2025-11-26/archivo.jpg
// Y la URL para mostrar en la web:
//   https://fletesenki.com.ar/public/uploads/dev/viajes/...
$publicPath = $subDir . '/' . $filename;
$url        = rtrim($baseUrl, '/') . '/' . $publicPath;

echo json_encode([
    'ok'   => true,
    'url'  => $url,
    'path' => $publicPath,
], JSON_UNESCAPED_UNICODE);
