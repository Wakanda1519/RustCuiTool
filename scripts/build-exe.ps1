$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$root = Split-Path -Parent $PSScriptRoot
$exePath = Join-Path $root 'RCT.exe'
$builtExe = Join-Path $root 'src-tauri\target\release\RCT.exe'
$mcpExePath = Join-Path $root 'RCT-MCP.exe'
$mcpManifest = Join-Path $root 'mcp-server\Cargo.toml'
$mcpBuiltExe = Join-Path $root 'mcp-server\target\release\RCT-MCP.exe'

$cargo = (Get-Command cargo -ErrorAction SilentlyContinue).Source
if (-not $cargo) {
    $cargo = Join-Path $env:USERPROFILE '.cargo\bin\cargo.exe'
}
if (-not (Test-Path -LiteralPath $cargo)) { throw 'cargo not found. Install Rust 1.90+ and make sure cargo is on PATH.' }

# Tauri's CLI spawns cargo itself, so make sure the directory is on PATH.
$cargoDir = Split-Path -Parent $cargo
if (($env:PATH -split ';') -notcontains $cargoDir) {
    $env:PATH = "$cargoDir;$env:PATH"
}

Push-Location $root
try {
    if (-not (Test-Path (Join-Path $root 'node_modules'))) {
        Write-Host 'Installing npm dependencies...'
        & npm.cmd ci
        if ($LASTEXITCODE -ne 0) { throw 'npm ci failed.' }
    }

    Write-Host 'Building RCT-MCP.exe...'
    & $cargo build --release --manifest-path $mcpManifest
    if ($LASTEXITCODE -ne 0) { throw 'RCT-MCP build failed.' }
    if (-not (Test-Path -LiteralPath $mcpBuiltExe)) { throw 'Cargo did not produce mcp-server\target\release\RCT-MCP.exe.' }
    Copy-Item -LiteralPath $mcpBuiltExe -Destination $mcpExePath -Force

    Write-Host 'Building RustCuiTool with Tauri...'
    & npx.cmd tauri build --no-bundle
    if ($LASTEXITCODE -ne 0) { throw 'tauri build failed.' }
    if (-not (Test-Path -LiteralPath $builtExe)) { throw 'Tauri did not produce src-tauri\target\release\RCT.exe.' }

    Copy-Item -LiteralPath $builtExe -Destination $exePath -Force
    $sizeMb = [math]::Round((Get-Item -LiteralPath $exePath).Length / 1MB, 1)
    $mcpSizeMb = [math]::Round((Get-Item -LiteralPath $mcpExePath).Length / 1MB, 1)
    Write-Host "Done: $exePath ($sizeMb MB)"
    Write-Host "Done: $mcpExePath ($mcpSizeMb MB)"
}
finally {
    Pop-Location
}
