$ErrorActionPreference = "Stop"

$py = if ($env:BREADTH_PYTHON -and (Test-Path $env:BREADTH_PYTHON)) { $env:BREADTH_PYTHON } else { (Get-Command python -ErrorAction Stop).Source }
$script = Join-Path $PSScriptRoot "nasdaq100_breadth.py"
$outdir = Join-Path $PSScriptRoot "reports"

# 1. Ruleaza analiza
& $py $script --output-dir $outdir
$exit = $LASTEXITCODE

# 2. Citeste cel mai recent JSON
$title = "Nasdaq-100 Breadth"; $line1 = "Rulare finalizata"; $line2 = ""; $line3 = ""
try {
    $json = Get-ChildItem "$outdir\nasdaq100_breadth_*.json" |
            Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if ($json) {
        $d = Get-Content $json.FullName -Raw | ConvertFrom-Json
        $score = $d.composite_score; $zone = $d.zone
        $dir = $d.trend.direction; $delta = $d.trend.delta
        $trMap = @{ improving = "in crestere"; deteriorating = "in scadere"; stable = "stabil" }
        $trRo = $trMap[[string]$dir]; if (-not $trRo) { $trRo = $dir }
        $sign = if ($delta -gt 0) { "+$delta" } else { "$delta" }
        $trTxt = if ($null -ne $delta -and $delta -ne 0) { "$trRo ($sign)" } else { $trRo }
        $title = "Nasdaq-100 Breadth: $score/100 - $zone"
        $line1 = "% peste MM200: $($d.pct_above_200ma)%   |   Expunere: $($d.exposure_guidance)"
        $line2 = "% peste MM50 (momentum): $($d.pct_above_50ma)%"
        $line3 = "Trend: $trTxt   ($($d.constituents_valid)/$($d.constituents_total) valide)"
    }
} catch { $line1 = "Analiza rulata, dar nu am putut citi scorul." }
if ($exit -ne 0) { $title = "Nasdaq-100 Breadth: EROARE ($exit)"; $line1 = "Verifica scriptul"; $line2=""; $line3="" }

# 3. Toast Windows (ToastText04) sau fallback balloon
try {
    [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
    $tpl = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent(
              [Windows.UI.Notifications.ToastTemplateType]::ToastText04)
    $t = $tpl.GetElementsByTagName("text")
    $t.Item(0).AppendChild($tpl.CreateTextNode($title)) | Out-Null
    $t.Item(1).AppendChild($tpl.CreateTextNode($line1)) | Out-Null
    $t.Item(2).AppendChild($tpl.CreateTextNode($line2)) | Out-Null
    $t.Item(3).AppendChild($tpl.CreateTextNode($line3)) | Out-Null
    $toast = [Windows.UI.Notifications.ToastNotification]::new($tpl)
    [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier("Nasdaq-100 Breadth").Show($toast)
} catch {
    Add-Type -AssemblyName System.Windows.Forms
    $n = New-Object System.Windows.Forms.NotifyIcon
    $n.Icon = [System.Drawing.SystemIcons]::Information; $n.Visible = $true
    $body = @($line1,$line2,$line3 | Where-Object { $_ }) -join "`n"
    $n.ShowBalloonTip(10000, $title, $body, [System.Windows.Forms.ToolTipIcon]::Info)
    Start-Sleep -Seconds 11; $n.Dispose()
}
