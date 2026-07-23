param(
    [switch]$IncludeResearchDownloads
)

$ErrorActionPreference = "Stop"
$root = (Resolve-Path -LiteralPath (Split-Path -Parent $PSScriptRoot)).Path

$targets = @(
    ".ruff_cache",
    ".pytest_cache",
    "apps\dashboard\node_modules",
    "apps\dashboard\.next",
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
    Where-Object { $_.Name -in @("__pycache__", ".pytest_cache", ".ruff_cache") }

foreach ($directory in $generatedDirectories) {
    Remove-WorkspacePath $directory.FullName
}

foreach ($relative in @(
    "apps\mobile\.flutter-plugins-dependencies",
    "apps\mobile\fasalpramaan.iml"
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

Write-Host "Workspace cleanup complete."
