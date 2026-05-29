<#
.SYNOPSIS
  Deploy exported .mcstructure files into Minecraft Bedrock (Windows).

.DESCRIPTION
  Auto-detects the data layout:
    - New Minecraft Launcher:  %APPDATA%\Minecraft Bedrock\Users\<id>\games\com.mojang
      (worlds are per signed-in account; packs live under Users\Shared).
    - Microsoft Store / UWP app: ...\MINECRAFTUWP...\LocalState\games\com.mojang
      (worlds and packs both under one com.mojang).

  Targets:
    -Pack   Stage structures in a behaviour pack (development_behavior_packs).
            Enable it on a world, then load via structure block / command.
    (world) Copy structures into a world's own structures\ folder (no pack needed).

.EXAMPLES
  powershell -ExecutionPolicy Bypass -File scripts\deploy-bedrock.ps1 -List
  powershell -ExecutionPolicy Bypass -File scripts\deploy-bedrock.ps1 -Pack -Clean
  powershell -ExecutionPolicy Bypass -File scripts\deploy-bedrock.ps1 -World "My World" -Clean
#>

param(
  [string]$File,
  [string]$Namespace = "mystructure",
  [string]$World,
  [switch]$List,
  [switch]$Pack,
  [switch]$Clean,
  [string]$PackName = "StructureComposer"
)

$ErrorActionPreference = "Stop"

# ---- resolve data layout ------------------------------------------------
$launcher = Join-Path $env:APPDATA "Minecraft Bedrock"
$uwp = Join-Path $env:LOCALAPPDATA "Packages\MICROSOFT.MINECRAFTUWP_8wekyb3d8bbwe\LocalState\games\com.mojang"

if (Test-Path (Join-Path $launcher "Users")) {
  $mode = "launcher"
  $devPacksDir = Join-Path $launcher "Users\Shared\games\com.mojang\development_behavior_packs"
} elseif (Test-Path $uwp) {
  $mode = "uwp"
  $devPacksDir = Join-Path $uwp "development_behavior_packs"
} else {
  $mode = "none"
}

function Get-AllWorlds {
  if ($mode -eq "launcher") {
    Get-ChildItem (Join-Path $launcher "Users") -Directory -ErrorAction SilentlyContinue | ForEach-Object {
      $w = Join-Path $_.FullName "games\com.mojang\minecraftWorlds"
      if (Test-Path $w) { Get-ChildItem $w -Directory -ErrorAction SilentlyContinue }
    }
  } elseif ($mode -eq "uwp") {
    $w = Join-Path $uwp "minecraftWorlds"
    if (Test-Path $w) { Get-ChildItem $w -Directory -ErrorAction SilentlyContinue }
  }
}

function World-Name([System.IO.DirectoryInfo]$d) {
  $nf = Join-Path $d.FullName "levelname.txt"
  if (Test-Path $nf) { return (Get-Content $nf -TotalCount 1) }
  return "(unnamed)"
}

$repoOut = Join-Path $PSScriptRoot "..\out"
$repoManifest = Join-Path $PSScriptRoot "..\pack\manifest.json"

function Get-SourceFiles {
  if ($File) {
    if (-not (Test-Path $File)) { throw "File not found: $File" }
    return @((Resolve-Path $File).Path)
  }
  if (-not (Test-Path $repoOut)) { throw "No -File and .\out missing. Run: npm run build:library" }
  $files = Get-ChildItem $repoOut -Filter *.mcstructure | Select-Object -ExpandProperty FullName
  if (-not $files) { throw "No .mcstructure in .\out. Run: npm run build:library" }
  return $files
}

function Copy-Structures([string]$structuresRoot, [string[]]$files) {
  $nsDir = Join-Path $structuresRoot $Namespace
  if ($Clean -and (Test-Path $nsDir)) { Remove-Item $nsDir -Recurse -Force; Write-Host "  (cleaned $nsDir)" }
  New-Item -ItemType Directory -Force -Path $nsDir | Out-Null
  $names = @()
  foreach ($f in $files) {
    $leaf = [System.IO.Path]::GetFileNameWithoutExtension($f)
    Copy-Item $f (Join-Path $nsDir ($leaf + ".mcstructure")) -Force
    $names += "$Namespace`:$leaf"
    Write-Host "  + $(Join-Path $nsDir ($leaf + '.mcstructure'))"
  }
  return $names
}

# ---- list ---------------------------------------------------------------
if ($List) {
  Write-Host "mode: $mode"
  if ($mode -eq "none") {
    Write-Host "  No Minecraft data found. Launch the game once and create a world." -ForegroundColor Yellow
    return
  }
  Write-Host "packs: $devPacksDir"
  $i = 0
  Get-AllWorlds | ForEach-Object { $i++; Write-Host ("  [{0}] {1}  ->  {2}" -f $i, (World-Name $_), $_.Name) }
  if ($i -eq 0) { Write-Host "  No worlds yet." }
  return
}

if ($mode -eq "none") { throw "No Minecraft data folder found. Launch the game and create a world first." }

# ---- behaviour pack -----------------------------------------------------
if ($Pack) {
  $packDir = Join-Path $devPacksDir $PackName
  New-Item -ItemType Directory -Force -Path $packDir | Out-Null
  $manifestPath = Join-Path $packDir "manifest.json"

  if (Test-Path $repoManifest) {
    Copy-Item $repoManifest $manifestPath -Force      # tracked manifest = stable UUIDs
    Write-Host "Manifest (from repo): $manifestPath"
  } elseif (-not (Test-Path $manifestPath)) {
    $manifest = [ordered]@{
      format_version = 2
      header = [ordered]@{ name = "Structure Composer"; description = "Exported structures";
        uuid = [guid]::NewGuid().ToString(); version = @(1, 0, 0); min_engine_version = @(1, 20, 0) }
      modules = @([ordered]@{ type = "data"; uuid = [guid]::NewGuid().ToString(); version = @(1, 0, 0) })
    }
    [System.IO.File]::WriteAllText($manifestPath, ($manifest | ConvertTo-Json -Depth 6), (New-Object System.Text.UTF8Encoding $false))
    Write-Host "Manifest (generated): $manifestPath"
  }

  Write-Host "Staging into pack '$PackName':"
  $names = Copy-Structures (Join-Path $packDir "structures") (Get-SourceFiles)
  Write-Host "`nDONE. Enable 'Structure Composer' on a world, then:" -ForegroundColor Green
  foreach ($n in $names) { Write-Host "  /structure load $n ~ ~ ~" }
  return
}

# ---- world copy ---------------------------------------------------------
$worlds = @(Get-AllWorlds)
if ($worlds.Count -eq 0) { throw "No worlds found. Create one in-game, or use -Pack." }

$target = $null
if (-not $World) {
  if ($worlds.Count -eq 1) { $target = $worlds[0] }
  else { Write-Host "Multiple worlds - pick with -World <index|name>:"; & $PSCommandPath -List; return }
} elseif ($World -match '^\d+$') {
  $target = $worlds[[int]$World - 1]
} else {
  $target = $worlds | Where-Object { (World-Name $_) -like "*$World*" } | Select-Object -First 1
}
if (-not $target) { throw "Could not resolve world '$World'. Run -List." }

Write-Host "Deploying into world: $(World-Name $target) ($($target.Name))"
$names = Copy-Structures (Join-Path $target.FullName "structures") (Get-SourceFiles)
Write-Host "`nDONE. In that world, load with a structure block (Load) or:" -ForegroundColor Green
foreach ($n in $names) { Write-Host "  /structure load $n ~ ~ ~" }
