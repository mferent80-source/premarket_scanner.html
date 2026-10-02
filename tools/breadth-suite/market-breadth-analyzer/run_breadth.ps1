$ErrorActionPreference = "Stop"

$py = if ($env:BREADTH_PYTHON -and (Test-Path $env:BREADTH_PYTHON)) { $env:BREADTH_PYTHON } else { (Get-Command python -ErrorAction Stop).Source }
$script = Join-Path $PSScriptRoot "scripts\market_breadth_analyzer.py"
$outdir = Join-Path $PSScriptRoot "reports"

# 1. Ruleaza analiza
& $py $script `
    --detail-url  "https://tradermonty.github.io/market-breadth-analysis/market_breadth_data.csv" `
    --summary-url "https://tradermonty.github.io/market-breadth-analysis/market_breadth_summary.csv" `
    --output-dir  $outdir
$exit = $LASTEXITCODE

# 2. Citeste cel mai recent raport JSON pentru scor, zona, componenta slaba, trend
$title = "Market Breadth"
$line1 = "Rulare finalizata"
$line2 = ""
$line3 = ""
try {
    $json = Get-ChildItem "$outdir\*.json" -Recurse |
            Where-Object { $_.Name -like "market_breadth_*" } |
            Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if ($json) {
        $data  = Get-Content $json.FullName -Raw | ConvertFrom-Json
        $score = [math]::Round($data.composite.composite_score, 1)
        $zone  = $data.composite.zone
        $exp   = $data.composite.exposure_guidance

        # componenta cea mai slaba
        $wLabel = $data.composite.weakest_health.label
        $wScore = $data.composite.weakest_health.score

        # trend fata de rularile anterioare
        $dir   = $data.trend_summary.direction
        $delta = $data.trend_summary.delta
        $trMap = @{ improving = "in crestere"; deteriorating = "in scadere"; stable = "stabil" }
        $trRo  = $trMap[[string]$dir]; if (-not $trRo) { $trRo = $dir }
        $sign  = if ($delta -gt 0) { "+$delta" } else { "$delta" }
        $trTxt = if ($null -ne $delta -and $delta -ne 0) { "$trRo ($sign fata de ultima)" } else { $trRo }

        $title = "Market Breadth: $score/100 - $zone"
        $line1 = "Expunere recomandata: $exp"
        $line2 = "Cea mai slaba: $wLabel ($wScore)"
        $line3 = "Trend: $trTxt"
    }
} catch {
    $line1 = "Analiza rulata, dar nu am putut citi scorul."
}
if ($exit -ne 0) {
    $title = "Market Breadth: EROARE ($exit)"; $line1 = "Verifica scriptul."; $line2 = ""; $line3 = ""
}

# 3. Notificare toast Windows (ToastText04: titlu + 3 linii) - fara module externe
try {
    [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
    $tpl = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent(
              [Windows.UI.Notifications.ToastTemplateType]::ToastText04)
    $texts = $tpl.GetElementsByTagName("text")
    $texts.Item(0).AppendChild($tpl.CreateTextNode($title)) | Out-Null
    $texts.Item(1).AppendChild($tpl.CreateTextNode($line1)) | Out-Null
    $texts.Item(2).AppendChild($tpl.CreateTextNode($line2)) | Out-Null
    $texts.Item(3).AppendChild($tpl.CreateTextNode($line3)) | Out-Null
    $toast = [Windows.UI.Notifications.ToastNotification]::new($tpl)
    $notifier = [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier(
                    "Market Breadth Analyzer")
    $notifier.Show($toast)
} catch {
    # Fallback: balloon tip din tray daca toast-ul nu e disponibil
    Add-Type -AssemblyName System.Windows.Forms
    $n = New-Object System.Windows.Forms.NotifyIcon
    $n.Icon = [System.Drawing.SystemIcons]::Information
    $n.Visible = $true
    $body = @($line1, $line2, $line3 | Where-Object { $_ }) -join "`n"
    $n.ShowBalloonTip(10000, $title, $body, [System.Windows.Forms.ToolTipIcon]::Info)
    Start-Sleep -Seconds 11
    $n.Dispose()
}
