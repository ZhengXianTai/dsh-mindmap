# Install / uninstall dsh-mindmap into a DSH profile.
#
#   pwsh -File install.ps1                 # mount into the desktop profile
#   pwsh -File install.ps1 -Profile web    # mount into another profile
#   pwsh -File install.ps1 -Uninstall      # remove the package and its mount row
#
# The package is copied to <profile>/node_modules/@zhengxiantai/dsh-mindmap and a single
# loader row is appended to <profile>/cordis.patch.yml. A profile with HMR
# enabled re-composes the tree automatically; otherwise restart DSH.
param(
  [string]$Profile = 'desktop',
  [switch]$Uninstall
)

$ErrorActionPreference = 'Stop'

$source = $PSScriptRoot
$packageName = '@zhengxiantai/dsh-mindmap'
$dshHome = if ($env:DSH_HOME) { $env:DSH_HOME } else { Join-Path $HOME '.dsh' }
$profileDir = Join-Path $dshHome "profiles\$Profile"
if (-not (Test-Path -LiteralPath $profileDir)) {
  throw "Profile not found: $profileDir"
}
$patchFile = Join-Path $profileDir 'cordis.patch.yml'
$target = Join-Path $profileDir 'node_modules\@zhengxiantai\dsh-mindmap'
$mountBlock = @"
- insert:
    - id: mindmap
      name: '$packageName'
"@

if ($Uninstall) {
  if (Test-Path -LiteralPath $target) {
    Remove-Item -LiteralPath $target -Recurse -Force
    Write-Host "Removed $target"
  }
  if (Test-Path -LiteralPath $patchFile) {
    $content = Get-Content -LiteralPath $patchFile -Raw
    $escaped = [regex]::Escape($packageName)
    $pattern = '(?ms)^[ \t]*-[ \t]*insert:[ \t]*\r?\n[ \t]*-[ \t]*id:[ \t]*mindmap[ \t]*\r?\n[ \t]*name:[ \t]*[''"]' + $escaped + '[''"][ \t]*\r?\n'
    $next = [regex]::Replace($content, $pattern, '')
    $meaningful = @($next -split "`n" | Where-Object { $_.Trim() -ne '' -and -not $_.TrimStart().StartsWith('#') })
    if ($meaningful.Count -eq 0) { $next = "[]" }
    $utf8 = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($patchFile, ($next.TrimEnd() + "`n"), $utf8)
    Write-Host "Unmounted $packageName from $patchFile"
  }
  exit 0
}

New-Item -ItemType Directory -Path (Split-Path $target) -Force | Out-Null
New-Item -ItemType Directory -Path $target -Force | Out-Null
foreach ($item in @('lib', 'package.json', 'cordis.patch.yml', 'README.md')) {
  $from = Join-Path $source $item
  if (Test-Path -LiteralPath $from) {
    Copy-Item -LiteralPath $from -Destination $target -Recurse -Force
  }
}
Write-Host "Installed package to $target"

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
Write-Host "Mounted dsh-mindmap in $patchFile"

Write-Host ''
Write-Host 'Done. Open the sidebar entry "话题地图" (Topic map).'
Write-Host 'Profiles with HMR reload automatically; otherwise restart DSH.'
