# Compress bundled showroom GLBs (run from Crimzo-frontend/)
# Usage: powershell -File scripts/compress-glb-models.ps1

$ErrorActionPreference = 'Stop'
$root = Join-Path $PSScriptRoot '..' | Resolve-Path
$modelDir = Join-Path $root 'assets/models/golf_gti'
$origDir = Join-Path $modelDir '_originals'
$tmpDir = Join-Path $modelDir '_compress_tmp'

New-Item -ItemType Directory -Force -Path $origDir, $tmpDir | Out-Null

foreach ($name in @('scene-v1.glb', 'scene-v2.glb', 'scene-v3.glb')) {
  $src = Join-Path $modelDir $name
  if (-not (Test-Path $src)) { continue }
  $backup = Join-Path $origDir $name
  if (-not (Test-Path $backup)) { Copy-Item $src $backup -Force }
}

$v3Args = @('--texture-compress', 'webp', '--texture-size', '512', '--simplify-ratio', '0.2')
$stdArgs = @('--texture-compress', 'webp', '--texture-size', '1024')

npx --yes @gltf-transform/cli optimize (Join-Path $origDir 'scene-v1.glb') (Join-Path $tmpDir 'scene-v1.glb') @stdArgs
npx --yes @gltf-transform/cli optimize (Join-Path $origDir 'scene-v2.glb') (Join-Path $tmpDir 'scene-v2.glb') @stdArgs
npx --yes @gltf-transform/cli optimize (Join-Path $origDir 'scene-v3.glb') (Join-Path $tmpDir 'scene-v3.glb') @v3Args

foreach ($name in @('scene-v1.glb', 'scene-v2.glb', 'scene-v3.glb')) {
  Copy-Item (Join-Path $tmpDir $name) (Join-Path $modelDir $name) -Force
}

Get-ChildItem $modelDir -Filter 'scene-v*.glb' | Select-Object Name, @{ N = 'MB'; E = { [math]::Round($_.Length / 1MB, 2) } }