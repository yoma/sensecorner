# Genereert PWA-icon-PNG's (Windows, System.Drawing).
# Volgt designbrief rimpel: cream + effen sage-ringen + chocolade kern + S.
# Run: powershell -ExecutionPolicy Bypass -File scripts/generate-icons.ps1

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$projectRoot = Split-Path $PSScriptRoot -Parent
$iconsDir = Join-Path $projectRoot 'pwa\icons'
if (-not (Test-Path $iconsDir)) { New-Item -ItemType Directory -Path $iconsDir -Force | Out-Null }
$iconsDir = (Resolve-Path $iconsDir).Path

# Proporties mic-rimpel (designbrief): 150 / 134 / 118 / 76 op schaal outer=400 @1024
$RippleOuter = 400.0
$RippleMid = 357.33
$RippleInner = 314.67
$RippleCore = 202.67
$MonoCx = 493.0
$MonoCy = 528.0
$MonoFit = 0.74

function New-ChocColor { param([int]$A = 255) [System.Drawing.Color]::FromArgb($A, 0x3D, 0x2F, 0x1F) }
function New-CreamColor { param([int]$A = 255) [System.Drawing.Color]::FromArgb($A, 0xF2, 0xE8, 0xD5) }
function New-SageLicht { param([int]$A = 255) [System.Drawing.Color]::FromArgb($A, 0xC8, 0xD4, 0xB5) }
function New-SageMedium { param([int]$A = 255) [System.Drawing.Color]::FromArgb($A, 0xA5, 0xB8, 0x94) }
function New-SageDonker { param([int]$A = 255) [System.Drawing.Color]::FromArgb($A, 0x6B, 0x8E, 0x6F) }

function Add-MonogramPath {
  param([System.Drawing.Drawing2D.GraphicsPath]$gp)
  $gp.StartFigure()
  $gp.AddBezier(668, 292, 520, 248, 368, 268, 318, 360)
  $gp.AddBezier(318, 360, 278, 432, 318, 508, 430, 536)
  $gp.AddLine(430, 536, 548, 568)
  $gp.AddBezier(548, 568, 648, 594, 698, 648, 678, 728)
  $gp.AddBezier(678, 728, 648, 838, 518, 878, 358, 852)
  $gp.AddBezier(358, 852, 278, 838, 238, 808, 218, 768)
  $gp.AddLine(218, 768, 308, 728)
  $gp.AddBezier(308, 728, 328, 768, 388, 788, 468, 798)
  $gp.AddBezier(468, 798, 568, 812, 648, 778, 668, 708)
  $gp.AddBezier(668, 708, 688, 638, 628, 588, 528, 562)
  $gp.AddLine(528, 562, 408, 528)
  $gp.AddBezier(408, 528, 298, 498, 248, 428, 268, 348)
  $gp.AddBezier(268, 348, 308, 228, 468, 178, 638, 228)
  $gp.AddBezier(638, 228, 708, 248, 748, 268, 768, 292)
  $gp.CloseFigure()
}

function Draw-IconCore {
  param(
    [int]$Size,
    [bool]$Maskable = $false
  )

  $bmp = New-Object System.Drawing.Bitmap $Size, $Size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  $g.Clear([System.Drawing.Color]::Transparent)

  $designScale = $Size / 1024.0
  $ringScale = if ($Maskable) { 0.88 } else { 1.0 }
  $monoFit = if ($Maskable) { 0.65 } else { $MonoFit }

  $rx = if ($Maskable) { 0 } else { [int]($Size * 225 / 1024) }
  if ($rx -gt 0) {
    $clip = New-Object System.Drawing.Drawing2D.GraphicsPath
    $rect = New-Object System.Drawing.RectangleF 0, 0, $Size, $Size
    $clip.AddArc($rect.X, $rect.Y, $rx * 2, $rx * 2, 180, 90)
    $clip.AddArc($rect.Right - $rx * 2, $rect.Y, $rx * 2, $rx * 2, 270, 90)
    $clip.AddArc($rect.Right - $rx * 2, $rect.Bottom - $rx * 2, $rx * 2, $rx * 2, 0, 90)
    $clip.AddArc($rect.X, $rect.Bottom - $rx * 2, $rx * 2, $rx * 2, 90, 90)
    $clip.CloseFigure()
    $g.SetClip($clip)
    $clip.Dispose()
  }

  $g.Clear((New-CreamColor))

  $cx = $Size / 2.0
  $cy = $Size / 2.0
  $s = $designScale * $ringScale

  function Fill-Ring($radius, $color) {
    $r = $radius * $s
    $brush = New-Object System.Drawing.SolidBrush $color
    $g.FillEllipse($brush, $cx - $r, $cy - $r, $r * 2, $r * 2)
    $brush.Dispose()
  }

  Fill-Ring $RippleOuter (New-SageLicht)
  Fill-Ring $RippleMid (New-SageMedium)
  Fill-Ring $RippleInner (New-SageDonker)
  Fill-Ring $RippleCore (New-ChocColor)

  $mono = New-Object System.Drawing.Drawing2D.GraphicsPath
  Add-MonogramPath -gp $mono
  $mtx = New-Object System.Drawing.Drawing2D.Matrix
  [void]$mtx.Translate($cx, $cy)
  [void]$mtx.Scale($monoFit * $s, $monoFit * $s)
  [void]$mtx.Translate(-$MonoCx, -$MonoCy)
  $mono.Transform($mtx)
  $mtx.Dispose()
  $cream = New-Object System.Drawing.SolidBrush (New-CreamColor)
  $g.FillPath($cream, $mono)
  $cream.Dispose()
  $mono.Dispose()

  $g.Dispose()
  return $bmp
}

function Draw-Icon {
  param(
    [int]$Size,
    [string]$OutPath,
    [bool]$Maskable = $false
  )

  $super = [Math]::Max($Size * 4, 512)
  $hi = Draw-IconCore -Size $super -Maskable $Maskable
  $out = New-Object System.Drawing.Bitmap $Size, $Size
  $g = [System.Drawing.Graphics]::FromImage($out)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  $g.DrawImage($hi, 0, 0, $Size, $Size)
  $g.Dispose()
  $hi.Dispose()
  $out.Save($OutPath, [System.Drawing.Imaging.ImageFormat]::Png)
  $out.Dispose()
  Write-Host "  ok $(Split-Path $OutPath -Leaf) (${Size}x${Size})"
}

Write-Host "Icons naar: $iconsDir"
Write-Host 'Standaard:'
Draw-Icon -Size 180 -OutPath (Join-Path $iconsDir 'apple-touch-icon.png')
Draw-Icon -Size 192 -OutPath (Join-Path $iconsDir 'icon-192.png')
Draw-Icon -Size 512 -OutPath (Join-Path $iconsDir 'icon-512.png')
Draw-Icon -Size 32 -OutPath (Join-Path $iconsDir 'favicon-32.png')
Draw-Icon -Size 16 -OutPath (Join-Path $iconsDir 'favicon-16.png')
Write-Host 'Maskable:'
Draw-Icon -Size 192 -OutPath (Join-Path $iconsDir 'icon-maskable-192.png') -Maskable $true
Draw-Icon -Size 512 -OutPath (Join-Path $iconsDir 'icon-maskable-512.png') -Maskable $true
Write-Host 'Klaar. Upload pwa/icons/ naar GitHub.'
