# Erzeugt App-Icons und das Logo für die Übersicht aus dem runden Logo (durchsichtig außerhalb des Kreises).
# Aufruf im Projektordner: .\scripts\make-icons.ps1 [-Logo <Pfad>]
param([string] $Logo = "$env:USERPROFILE\Dropbox\Logos\Logo-Rund-Blau-Pink.png")

Add-Type -AssemblyName System.Drawing

function Draw($src, [int] $size, [double] $ratio, [bool] $white, [string] $file) {
  # iOS zeigt Durchsichtiges bei Icons schwarz an, deshalb bekommen Icons einen weißen Hintergrund.
  $fmt = if ($white) { [System.Drawing.Imaging.PixelFormat]::Format24bppRgb } else { [System.Drawing.Imaging.PixelFormat]::Format32bppArgb }
  $bmp = New-Object System.Drawing.Bitmap($size, $size, $fmt)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  if ($white) { $g.Clear([System.Drawing.Color]::White) }
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $scale = $size * $ratio / [Math]::Max($src.Width, $src.Height)
  $w = [int][Math]::Round($src.Width * $scale); $h = [int][Math]::Round($src.Height * $scale)
  $g.DrawImage($src, [int](($size - $w) / 2), [int](($size - $h) / 2), $w, $h)
  $g.Dispose()
  $bmp.Save((Join-Path "public" $file), [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
}

$src = [System.Drawing.Image]::FromFile($Logo)
Draw $src 180 .92 $true "apple-touch-icon.png"
Draw $src 192 .92 $true "icon-192.png"
Draw $src 512 .92 $true "icon-512.png"
Draw $src 512 .78 $true "icon-maskable-512.png"   # Android schneidet den Rand ab, deshalb kleiner
Draw $src 240 1 $false "logo-rund.png"
$src.Dispose()
Get-ChildItem public -Filter *.png | Select-Object Name, Length
