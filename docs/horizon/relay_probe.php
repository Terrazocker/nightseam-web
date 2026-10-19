<?php
/*
 * Phase 0 hosting probe for the pairing relay (HORIZON_PAIRING_PLAN.md).
 * THROWAWAY: upload by hand to httpdocs/astro/relay_probe.php, run
 * `python scripts/relay_probe.py https://nightseam.de/astro/relay_probe.php`
 * once per PHP handler ("served by nginx", then "served by Apache"), then
 * delete it from the server. It is not part of any publication: the
 * publication tools refuse every PHP file except web/relay.php.
 *
 * GET  writes, reads and deletes a file in nightseam-relay/ (a sibling of
 *      the document root) and reports the PHP setup.
 * POST echoes the length and SHA-256 of a binary body (up to 64 KB), so the
 *      client can see whether Imunify or the web server changed or blocked it.
 */
declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

$out = ['php' => PHP_VERSION, 'sapi' => PHP_SAPI,
        'server' => (string)($_SERVER['SERVER_SOFTWARE'] ?? ''),
        'open_basedir' => (string)ini_get('open_basedir'),
        'post_max_size' => (string)ini_get('post_max_size'),
        // The relay's per-address limits need the visitor's address here, not
        // nginx's or a proxy's (a private or loopback address would make the
        // limit one shared by everybody).
        'remote_addr_is_public' => filter_var((string)($_SERVER['REMOTE_ADDR'] ?? ''), FILTER_VALIDATE_IP,
            FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE) !== false,
        'user' => function_exists('posix_geteuid') && function_exists('posix_getpwuid')
            ? (posix_getpwuid(posix_geteuid())['name'] ?? '?') : get_current_user()];

$root = realpath((string)($_SERVER['DOCUMENT_ROOT'] ?? ''));
$dir = $root === false ? false : realpath(dirname($root) . DIRECTORY_SEPARATOR . 'nightseam-relay');
$out['data_folder_found'] = $dir !== false && is_dir($dir);
$out['data_folder_outside_document_root'] = $dir !== false && $root !== false
    && strncmp($dir . DIRECTORY_SEPARATOR, rtrim($root, '/\\') . DIRECTORY_SEPARATOR, strlen(rtrim($root, '/\\')) + 1) !== 0;

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'POST') {
    $body = (string)stream_get_contents(fopen('php://input', 'rb'), 65537);
    $out['body_bytes'] = strlen($body);
    $out['body_sha256'] = hash('sha256', $body);
    $out['content_type'] = (string)($_SERVER['CONTENT_TYPE'] ?? '');
} elseif ($out['data_folder_found']) {
    $path = $dir . DIRECTORY_SEPARATOR . 'probe-' . bin2hex(random_bytes(6)) . '.tmp';
    $data = random_bytes(4096);
    $out['write'] = file_put_contents($path, $data) === strlen($data);
    $out['rename'] = $out['write'] && rename($path, $path . '.box');
    $out['read_back'] = $out['rename'] && file_get_contents($path . '.box') === $data;
    $out['lock'] = ($h = fopen($dir . DIRECTORY_SEPARATOR . 'probe.lock', 'c')) !== false && flock($h, LOCK_EX);
    $out['delete'] = @unlink($path . '.box') && @unlink($dir . DIRECTORY_SEPARATOR . 'probe.lock');
}
echo json_encode($out, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES), "\n";
