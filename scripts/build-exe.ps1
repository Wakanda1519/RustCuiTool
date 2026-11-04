$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$root = Split-Path -Parent $PSScriptRoot
$outDir = Join-Path $root 'out'
$hostDir = Join-Path $root 'desktop-host'
$stageDir = Join-Path $hostDir '.stage'
$buildDir = Join-Path $root 'build'
$zipPath = Join-Path $buildDir 'app.zip'
$publishDir = Join-Path $buildDir 'publish'
$exePath = Join-Path $root 'RCT.exe'

Push-Location $root
try {
    if (-not (Test-Path (Join-Path $root 'node_modules'))) {
        Write-Host 'Installing npm dependencies...'
        & npm.cmd ci
        if ($LASTEXITCODE -ne 0) { throw 'npm ci failed.' }
    }

    Write-Host 'Building static export...'
    $env:NEXT_PUBLIC_BASE_PATH = $null
    & npm.cmd run build
    if ($LASTEXITCODE -ne 0) { throw 'next build failed.' }
    if (-not (Test-Path (Join-Path $outDir 'index.html'))) { throw 'Static export did not produce out/index.html.' }

    Write-Host 'Packing static export...'
    if (Test-Path $stageDir) { Remove-Item -LiteralPath $stageDir -Recurse -Force }
    New-Item -ItemType Directory -Path $stageDir | Out-Null
    Get-ChildItem -LiteralPath $outDir -Force | ForEach-Object {
        Copy-Item -LiteralPath $_.FullName -Destination $stageDir -Recurse -Force
    }
    Set-Content -LiteralPath (Join-Path $stageDir 'build.txt') -Value ([DateTime]::UtcNow.ToString('o')) -Encoding ASCII

    if (-not (Test-Path $buildDir)) { New-Item -ItemType Directory -Path $buildDir | Out-Null }
    if (Test-Path $zipPath) { Remove-Item -LiteralPath $zipPath -Force }
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    [System.IO.Compression.ZipFile]::CreateFromDirectory(
        $stageDir,
        $zipPath,
        [System.IO.Compression.CompressionLevel]::Optimal,
        $false)

    Write-Host 'Publishing single-file RCT.exe...'
    $env:DOTNET_CLI_TELEMETRY_OPTOUT = '1'
    $env:DOTNET_NOLOGO = '1'
    if (Test-Path $publishDir) { Remove-Item -LiteralPath $publishDir -Recurse -Force }
    & dotnet publish (Join-Path $hostDir 'RctHost.csproj') -c Release -o $publishDir --nologo
    if ($LASTEXITCODE -ne 0) { throw 'dotnet publish failed.' }

    $builtExe = Join-Path $publishDir 'RCT.exe'
    if (-not (Test-Path $builtExe)) { throw 'dotnet publish did not produce RCT.exe.' }

    Copy-Item -LiteralPath $builtExe -Destination $exePath -Force
    $sizeMb = [math]::Round((Get-Item -LiteralPath $exePath).Length / 1MB, 1)
    Write-Host "Done: $exePath ($sizeMb MB)"
}
finally {
    if (Test-Path $stageDir) { Remove-Item -LiteralPath $stageDir -Recurse -Force -ErrorAction SilentlyContinue }
    Pop-Location
}
