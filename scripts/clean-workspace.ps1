param(
    [switch]$IncludeResearchDownloads
)

$ErrorActionPreference = "Stop"
$root = (Resolve-Path -LiteralPath (Split-Path -Parent $PSScriptRoot)).Path

$targets = @(
    ".ruff_cache",
    ".pytest_cache",
    ".mypy_cache",
    ".turbo",
    "apps\dashboard\node_modules",
    "apps\dashboard\.next",
    "apps\dashboard\.turbo",
    "apps\mobile\.dart_tool",
    "apps\mobile\build",
    "apps\mobile\.idea",
    "services\ai\.research-venv",
    "services\ai\research\.venv"
)
if ($IncludeResearchDownloads) {
    $targets += "services\ai\research\data"
    $targets += "services\ai\research\runs"
}

function Remove-WorkspacePath([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path)) {
        return
    }
    $resolved = (Resolve-Path -LiteralPath $Path).Path
    $prefix = $root + [IO.Path]::DirectorySeparatorChar
    if (-not $resolved.StartsWith(
        $prefix,
        [StringComparison]::OrdinalIgnoreCase
    )) {
        throw "Refusing to remove a path outside the workspace: $resolved"
    }
    Write-Host "Removing $resolved"
    Remove-Item -LiteralPath $resolved -Recurse -Force
}

foreach ($relative in $targets) {
    Remove-WorkspacePath (Join-Path $root $relative)
}

$generatedDirectories = Get-ChildItem `
    -LiteralPath $root `
    -Directory `
    -Recurse `
    -Force `
    -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -in @("__pycache__", ".pytest_cache", ".ruff_cache", ".mypy_cache", ".turbo") }

foreach ($directory in $generatedDirectories) {
    Remove-WorkspacePath $directory.FullName
}

foreach ($relative in @(
    "apps\mobile\.flutter-plugins-dependencies",
    "apps\mobile\fasalpramaan.iml",
    "readmeforgemini.pdf",
    "evidence_eval_spec.txt",
    "pdf_extracted.txt",
    "pdf_text.txt"
)) {
    $path = Join-Path $root $relative
    if (Test-Path -LiteralPath $path) {
        $resolved = (Resolve-Path -LiteralPath $path).Path
        $prefix = $root + [IO.Path]::DirectorySeparatorChar
        if (-not $resolved.StartsWith(
            $prefix,
            [StringComparison]::OrdinalIgnoreCase
        )) {
            throw "Refusing to remove a path outside the workspace: $resolved"
        }
        Write-Host "Removing $resolved"
        Remove-Item -LiteralPath $resolved -Force
    }
}

$tempFiles = Get-ChildItem `
    -LiteralPath $root `
    -File `
    -Recurse `
    -Force `
    -ErrorAction SilentlyContinue |
    Where-Object { $_.Extension -in @(".pyc", ".pyo") -or $_.Name -like ".coverage*" }

foreach ($file in $tempFiles) {
    Remove-Item -LiteralPath $file.FullName -Force
}

Write-Host "Workspace cleanup complete."

