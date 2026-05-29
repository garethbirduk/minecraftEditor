<#
.SYNOPSIS
  Build a portable, importable .mcpack from pack/manifest.json + out/*.mcstructure.

.DESCRIPTION
  Produces dist\StructureComposer.mcpack - a ZIP (manifest.json + structures/ at
  the root) with forward-slash entry names (ZIP-spec compliant; Compress-Archive
  uses backslashes, which some devices reject). Double-click the .mcpack on any
  Bedrock device to import it; structures then load via /structure load.

  Doesn't require Minecraft to be installed - builds straight from repo + out.
  Run `npm run build:library` first (or use `npm run mcpack`).
#>
param(
  [string]$Namespace = "mystructure",
  [string]$OutName = "StructureComposer"
)
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$repo = Resolve-Path (Join-Path $PSScriptRoot "..")
$manifest = Join-Path $repo "pack\manifest.json"
$structures = Join-Path $repo "out"
if (-not (Test-Path $manifest)) { throw "Missing pack\manifest.json" }
$files = @(Get-ChildItem $structures -Filter *.mcstructure -ErrorAction SilentlyContinue)
if ($files.Count -eq 0) { throw "No .mcstructure in out. Run: npm run build:library" }

$distDir = Join-Path $repo "dist"
New-Item -ItemType Directory -Force -Path $distDir | Out-Null
$mcpack = Join-Path $distDir "$OutName.mcpack"
Remove-Item $mcpack -Force -ErrorAction SilentlyContinue

$fs = [System.IO.File]::Open($mcpack, 'Create')
$zip = New-Object System.IO.Compression.ZipArchive($fs, [System.IO.Compression.ZipArchiveMode]::Create)
function Add-Entry([string]$srcFile, [string]$entryName) {
  $entry = $zip.CreateEntry($entryName, [System.IO.Compression.CompressionLevel]::Optimal)
  $es = $entry.Open()
  $bytes = [System.IO.File]::ReadAllBytes($srcFile)
  $es.Write($bytes, 0, $bytes.Length)
  $es.Close()
  Write-Host "  + $entryName"
}
Add-Entry $manifest "manifest.json"
foreach ($f in $files) {
  $entryName = "structures/" + $Namespace + "/" + $f.Name
  Add-Entry $f.FullName $entryName
}
$zip.Dispose()
$fs.Close()

$size = (Get-Item $mcpack).Length
Write-Host ""
Write-Host "Built $mcpack ($size bytes)"
Write-Host "Import on any Bedrock device, then: /structure load ${Namespace}:<id> ~ ~ ~"
