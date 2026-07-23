param(
    [string]$OutputDirectory = "dist"
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

$model = Join-Path $Root "services\ai\models\crop_health_dinov2_v14\model.onnx"
if (-not (Test-Path -LiteralPath $model)) {
    throw "Required v14 ONNX model is missing: $model"
}
$expected = "f53536a738078c6d355ecb4633393c31e2b3fc8ef2ea77a9b29f86aa67b0fe7f"
$actual = (Get-FileHash -LiteralPath $model -Algorithm SHA256).Hash.ToLowerInvariant()
if ($actual -ne $expected) {
    throw "The v14 ONNX checksum does not match the release contract."
}

$output = Join-Path $Root $OutputDirectory
New-Item -ItemType Directory -Force -Path $output | Out-Null
$archive = Join-Path $output "FasalPramaan-MVP-portable.zip"
$checksum = "$archive.sha256"

$staging = Join-Path ([System.IO.Path]::GetTempPath()) (
    "fasalpramaan-portable-" + [Guid]::NewGuid().ToString("N")
)
New-Item -ItemType Directory -Force -Path $staging | Out-Null

$excludedDirectories = @(
    ".git", ".agents", ".codex", ".ruff_cache", "dist", # .agents/.codex = local tool caches only
    "node_modules", ".next", ".dart_tool", ".idea", "build",
    "__pycache__", ".pytest_cache", ".research-venv", ".venv",
    (Join-Path $Root "apps\dashboard\node_modules"),
    (Join-Path $Root "apps\dashboard\.next"),
    (Join-Path $Root "apps\mobile\.dart_tool"),
    (Join-Path $Root "apps\mobile\.idea"),
    (Join-Path $Root "apps\mobile\build"),
    (Join-Path $Root "services\ai\.research-venv"),
    (Join-Path $Root "services\ai\research\.venv"),
    (Join-Path $Root "services\ai\research\data"),
    (Join-Path $Root "services\ai\research\runs")
)
$excludedFiles = @(
    ".env", "*.pyc", "*.pyo", "*.log", "*.tmp", "*.iml",
    ".flutter-plugins-dependencies"
)

$robocopyArgs = @($Root, $staging, "/E", "/NFL", "/NDL", "/NJH", "/NJS", "/NP")
foreach ($directory in $excludedDirectories) {
    $robocopyArgs += "/XD"
    if ([System.IO.Path]::IsPathRooted($directory)) {
        $robocopyArgs += $directory
    } else {
        $robocopyArgs += $directory
    }
}
foreach ($file in $excludedFiles) {
    $robocopyArgs += "/XF"
    $robocopyArgs += $file
}

try {
    & robocopy @robocopyArgs | Out-Null
    if ($LASTEXITCODE -gt 7) {
        throw "Portable staging failed with robocopy exit code $LASTEXITCODE"
    }
    if (Test-Path -LiteralPath $archive) {
        Remove-Item -LiteralPath $archive -Force
    }
    & tar.exe -a -cf $archive -C $staging .
    if ($LASTEXITCODE -ne 0) {
        throw "Portable archive creation failed."
    }
    $archiveHash = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
    Set-Content -LiteralPath $checksum -Value "$archiveHash  FasalPramaan-MVP-portable.zip"
} finally {
    if (Test-Path -LiteralPath $staging) {
        Remove-Item -LiteralPath $staging -Recurse -Force
    }
}

Write-Host "Portable bundle: $archive"
Write-Host "SHA-256 file:    $checksum"
