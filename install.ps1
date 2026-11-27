# Install / uninstall dsh-mindmap into a DSH profile from this checkout.
#
#   pwsh -File install.ps1                 # mount into the desktop profile
#   pwsh -File install.ps1 -Profile web    # mount into another profile
#   pwsh -File install.ps1 -Uninstall      # remove the package and its mount row
#
# The mount uses the SAME package name as the npm package,
# `@zhengxiantai/dsh-mindmap`. That matters: the DSH client module system keys
# the boot graph by package name, and the browser bundle registers its factory
# under `@zhengxiantai/dsh-mindmap`, so an unscoped local mount
# (`node_modules/dsh-mindmap`) loads the Host half but silently drops the
# Client half with "client-modules: no registered factory".
param(
  [string]$Profile = 'desktop',
  [switch]$Uninstall,
  # Copy the checkout over a profile that already installs the npm package as a
  # bundle dependency, without writing a second mount row.
  [switch]$Force
)

$ErrorActionPreference = 'Stop'

$source = $PSScriptRoot
$packageName = '@zhengxiantai/dsh-mindmap'
$relativeTarget = 'node_modules\@zhengxiantai\dsh-mindmap'
$dshHome = if ($env:DSH_HOME) { $env:DSH_HOME } else { Join-Path $HOME '.dsh' }
$profileDir = Join-Path $dshHome "profiles\$Profile"
if (-not (Test-Path -LiteralPath $profileDir)) {
  throw "Profile not found: $profileDir"
}
$patchFile = Join-Path $profileDir 'cordis.patch.yml'
$target = Join-Path $profileDir $relativeTarget
$mountBlock = @"
- insert:
    - id: mindmap
      name: '$packageName'
"@

# Rows written by older versions of this script (unscoped mount name).
$legacyNames = @('dsh-mindmap')

# A profile that lists the package in `dsh.profile.bundles` (or as a dependency)
# already mounts it through the package's own cordis.patch.yml; a second insert
# row would collide with the bundle row, and copying the checkout would desync
# the dependency version from the lockfile.
$bundleMounted = $false
$profileManifest = Join-Path $profileDir 'package.json'
if (Test-Path -LiteralPath $profileManifest) {
  try {
    $profileJson = Get-Content -LiteralPath $profileManifest -Raw | ConvertFrom-Json
    $bundles = @($profileJson.dsh.profile.bundles)
    $deps = @($profileJson.dependencies.PSObject.Properties.Name)
    $bundleMounted = ($bundles -contains $packageName) -or ($deps -contains $packageName)
  } catch {
    $bundleMounted = $false
  }
}
if ($bundleMounted -and -not $Force -and -not $Uninstall) {
  Write-Host "This profile installs $packageName as a bundle dependency." -ForegroundColor Yellow
  Write-Host "Update it with: dsh plugin --profile $Profile add $packageName@<version>"
  Write-Host 'Pass -Force to copy this checkout over the installed files instead.'
  exit 1
}

function Remove-MountRow([string]$name) {
  if (-not (Test-Path -LiteralPath $patchFile)) { return }
  $content = Get-Content -LiteralPath $patchFile -Raw
  $escaped = [regex]::Escape($name)
  $pattern = '(?ms)^[ \t]*-[ \t]*insert:[ \t]*\r?\n(?:[ \t]*-[ \t]*id:[^\r\n]*\r?\n)[ \t]*-?[ \t]*name:[ \t]*[''"]' + $escaped + '[''"][ \t]*\r?\n'
  $next = [regex]::Replace($content, $pattern, '')
  $meaningful = @($next -split "`n" | Where-Object { $_.Trim() -ne '' -and -not $_.TrimStart().StartsWith('#') })
  if ($meaningful.Count -eq 0) { $next = "[]" }
  $utf8 = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($patchFile, ($next.TrimEnd() + "`n"), $utf8)
}

if ($Uninstall) {
  if (Test-Path -LiteralPath $target) {
    Remove-Item -LiteralPath $target -Recurse -Force
    Write-Host "Removed $target"
  }
  Remove-MountRow $packageName
  foreach ($legacy in $legacyNames) {
    $legacyTarget = Join-Path $profileDir ("node_modules\" + $legacy)
    if (Test-Path -LiteralPath $legacyTarget) {
      Remove-Item -LiteralPath $legacyTarget -Recurse -Force
      Write-Host "Removed legacy $legacyTarget"
    }
    Remove-MountRow $legacy
  }
  Write-Host "Unmounted $packageName from $patchFile"
  exit 0
}

New-Item -ItemType Directory -Path (Split-Path $target) -Force | Out-Null
New-Item -ItemType Directory -Path $target -Force | Out-Null
foreach ($item in @('lib', 'package.json', 'cordis.patch.yml', 'README.md', 'docs')) {
  $from = Join-Path $source $item
  if (Test-Path -LiteralPath $from) {
    Copy-Item -LiteralPath $from -Destination $target -Recurse -Force
  }
}
# Keep the checkout's package.json name: the scoped name IS the client module id.
$installedPackage = Join-Path $target 'package.json'
if (Test-Path -LiteralPath $installedPackage) {
  $manifest = Get-Content -LiteralPath $installedPackage -Raw | ConvertFrom-Json
  if ($manifest.name -ne $packageName) {
    $manifest.name = $packageName
    [System.IO.File]::WriteAllText($installedPackage, ($manifest | ConvertTo-Json -Depth 20), (New-Object System.Text.UTF8Encoding($false)))
  }
}
Write-Host "Installed package to $target"

if ($bundleMounted) {
  Write-Host 'No second mount row was written; the bundle patch inserts it.'
  Write-Host 'The profile dependency and its lockfile still name the published version.'
  exit 0
}

# Drop a stale unscoped mount so only one copy of the bundle can load.
$legacyTarget = Join-Path $profileDir 'node_modules\dsh-mindmap'
if (Test-Path -LiteralPath $legacyTarget) {
  Remove-Item -LiteralPath $legacyTarget -Recurse -Force
  Write-Host "Removed legacy $legacyTarget"
  Remove-MountRow 'dsh-mindmap'
}

$lines = if (Test-Path -LiteralPath $patchFile) { @(Get-Content -LiteralPath $patchFile) } else { @() }
$already = $lines | Where-Object { $_ -match [regex]::Escape($packageName) }
if ($already) {
  Write-Host 'Mount row already present; nothing to change.'
  exit 0
}

# A bare `[]` is a valid empty layer but cannot be followed by list items.
# Replace it with the mount block; otherwise append a new list item.
$meaningful = @($lines | Where-Object { $_.Trim() -ne '' -and -not $_.TrimStart().StartsWith('#') })
if ($meaningful.Count -gt 0 -and ($meaningful -join "`n").Trim() -eq '[]') {
  $commentLines = @($lines | Where-Object { $_.Trim() -eq '' -or $_.TrimStart().StartsWith('#') })
  $body = (@($commentLines) + @('', $mountBlock)) -join "`n"
} else {
  $body = (@($lines) + @('', $mountBlock)) -join "`n"
}
$utf8 = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($patchFile, ($body.TrimEnd() + "`n"), $utf8)
Write-Host "Mounted $packageName in $patchFile"

Write-Host ''
Write-Host 'Done. Open the sidebar entry "话题地图" (Topic map).'
Write-Host 'Profiles with HMR reload automatically; otherwise restart DSH.'
