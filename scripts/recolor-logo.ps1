# Färbt die Original-Logos aus Dropbox in die Farben eines Designs um. Die Originale bleiben unverändert.
# Aufruf: .\scripts\recolor-logo.ps1 -Src <Ordner mit Logo-Normal.png und Logo-Rund.png> -Out <Zielordner> -Suffix Blau-Pink
#         Optional: -Dark -Main -Mid -Accent als Hex-Farben.
param(
  [Parameter(Mandatory)] [string] $Src,
  [Parameter(Mandatory)] [string] $Out,
  [string] $Suffix = "Blau-Pink",
  [string] $Dark = "#024A6E",    # schwärzeste Stellen (Reifen)
  [string] $Main = "#0593C6",    # Anthrazit im Original: Schrift, Ring, Roller
  [string] $Mid = "#2AA5D2",     # Grau im Original
  [string] $Accent = "#D83995"   # Rot im Original
)

Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @"
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
public static class Recolor {
  static double[] Hex(string h) { var c = ColorTranslator.FromHtml(h); return new double[] { c.R, c.G, c.B }; }
  static double Mix(double a, double b, double t) { return a + (b - a) * t; }
  static double Clamp(double v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  /// Rot-Anteil wird zur Akzentfarbe, alles Neutrale läuft über eine Verlaufskurve in die Hauptfarbe.
  public static Bitmap Run(string path, string dark, string main, string mid, string accent) {
    double[] D = Hex(dark), M = Hex(main), I = Hex(mid), A = Hex(accent), W = { 255, 255, 255 };
    using (var src = new Bitmap(path)) {
      var bmp = new Bitmap(src.Width, src.Height, PixelFormat.Format32bppArgb);
      using (var g = Graphics.FromImage(bmp)) g.DrawImage(src, 0, 0, src.Width, src.Height);
      var data = bmp.LockBits(new Rectangle(0, 0, bmp.Width, bmp.Height), ImageLockMode.ReadWrite, PixelFormat.Format32bppArgb);
      int n = Math.Abs(data.Stride) * bmp.Height;
      var px = new byte[n];
      Marshal.Copy(data.Scan0, px, 0, n);
      for (int i = 0; i < n; i += 4) {
        double b = px[i], gr = px[i + 1], r = px[i + 2];
        double other = Math.Max(gr, b);
        double a = Clamp((r - other - 12) / 110.0);          // Rot-Anteil, auch an weichen Kanten
        double baseV = a < .98 ? Clamp((other - a * 28) / (1 - a) / 255.0) : 0.2;
        double[] c1, c2; double t;
        if (baseV < .22) { c1 = D; c2 = M; t = baseV / .22; }
        else if (baseV < .5) { c1 = M; c2 = I; t = (baseV - .22) / .28; }
        else { c1 = I; c2 = W; t = (baseV - .5) / .5; }
        if (baseV > .975) { c1 = W; c2 = W; t = 0; }          // Hintergrund sauber weiß
        for (int k = 0; k < 3; k++) {
          double v = Mix(Mix(c1[k], c2[k], t), A[k], a);
          px[i + 2 - k] = (byte)Math.Round(v);                // BGRA
        }
      }
      Marshal.Copy(px, 0, data.Scan0, n);
      bmp.UnlockBits(data);
      return bmp;
    }
  }
  /// Rechteck um alles, was nicht weiß ist, plus Rand.
  public static Rectangle Bounds(Bitmap bmp, int pad) {
    int x0 = bmp.Width, y0 = bmp.Height, x1 = 0, y1 = 0;
    var data = bmp.LockBits(new Rectangle(0, 0, bmp.Width, bmp.Height), ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
    int n = Math.Abs(data.Stride) * bmp.Height;
    var px = new byte[n];
    Marshal.Copy(data.Scan0, px, 0, n);
    bmp.UnlockBits(data);
    for (int y = 0; y < bmp.Height; y++) for (int x = 0; x < bmp.Width; x++) {
      int i = y * data.Stride + x * 4;
      if (px[i] < 225 || px[i + 1] < 225 || px[i + 2] < 225) {
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
    x0 = Math.Max(0, x0 - pad); y0 = Math.Max(0, y0 - pad);
    x1 = Math.Min(bmp.Width - 1, x1 + pad); y1 = Math.Min(bmp.Height - 1, y1 + pad);
    return new Rectangle(x0, y0, x1 - x0 + 1, y1 - y0 + 1);
  }
  public static Bitmap Scale(Bitmap src, Rectangle r, int width) {
    int h = (int)Math.Round(r.Height * (double)width / r.Width);
    // Ohne Alpha-Kanal: pdfkit bleibt bei PNGs mit Transparenz hängen, die Rechnung würde nie fertig.
    var o = new Bitmap(width, h, PixelFormat.Format24bppRgb);
    using (var g = Graphics.FromImage(o)) {
      g.Clear(Color.White);
      g.InterpolationMode = System.Drawing.Drawing2D.InterpolationMode.HighQualityBicubic;
      g.PixelOffsetMode = System.Drawing.Drawing2D.PixelOffsetMode.HighQuality;
      g.DrawImage(src, new Rectangle(0, 0, width, h), r, GraphicsUnit.Pixel);
    }
    return o;
  }
  /// Rundes Logo: alles außerhalb des Kreises wird durchsichtig.
  public static Bitmap Circle(Bitmap src, Rectangle r) {
    var o = new Bitmap(r.Width, r.Height, PixelFormat.Format32bppArgb);
    using (var g = Graphics.FromImage(o)) {
      g.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;
      using (var brush = new TextureBrush(src, r)) g.FillEllipse(brush, 0, 0, r.Width - 1, r.Height - 1);
    }
    return o;
  }
}
"@

New-Item -ItemType Directory -Force $Out | Out-Null
$normal = [Recolor]::Run((Join-Path $Src "Logo-Normal.png"), $Dark, $Main, $Mid, $Accent)
$round = [Recolor]::Run((Join-Path $Src "Logo-Rund.png"), $Dark, $Main, $Mid, $Accent)

$normal.Save((Join-Path $Out "Logo-Normal-$Suffix.png"), [System.Drawing.Imaging.ImageFormat]::Png)
$c = [Recolor]::Circle($round, [Recolor]::Bounds($round, 0))
$c.Save((Join-Path $Out "Logo-Rund-$Suffix.png"), [System.Drawing.Imaging.ImageFormat]::Png)

# Zugeschnittene Fassung für die PDFs: scharf genug für den Druck, aber klein für den Offline-Speicher der App.
$crop = [Recolor]::Scale($normal, [Recolor]::Bounds($normal, 6), 700)
$crop.Save((Join-Path $Out "form-logo.png"), [System.Drawing.Imaging.ImageFormat]::Png)
"form-logo: $($crop.Width)x$($crop.Height), $((Get-Item (Join-Path $Out 'form-logo.png')).Length) Bytes"
