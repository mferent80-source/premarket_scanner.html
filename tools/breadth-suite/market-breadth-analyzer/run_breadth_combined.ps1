param([switch]$AlertOnly, [switch]$NoHtml, [switch]$OnlyOnChange)
$ErrorActionPreference = "Stop"

# --- Cai portabile: se rezolva din locatia scriptului ---
$base   = $PSScriptRoot
$uproot = Join-Path (Split-Path $base -Parent) "uptrend-analyzer"

# --- Gaseste Python: env var, apoi locatii uzuale, apoi PATH ---
function Find-Python {
    if ($env:BREADTH_PYTHON -and (Test-Path $env:BREADTH_PYTHON)) { return $env:BREADTH_PYTHON }
    $cands = @(
        "$env:LOCALAPPDATA\Programs\Python\Python312\python.exe",
        "$env:LOCALAPPDATA\Programs\Python\Python311\python.exe",
        "$env:LOCALAPPDATA\Programs\Python\Python313\python.exe"
    )
    foreach ($c in $cands) { if (Test-Path $c) { return $c } }
    # Instalari Microsoft Store / pythoncore (executabilul real, nu stub-ul din WindowsApps)
    $core = Get-ChildItem "$env:LOCALAPPDATA\Python" -Directory -Filter "pythoncore-*" -ErrorAction SilentlyContinue |
            Sort-Object Name -Descending
    foreach ($d in $core) {
        $c = Join-Path $d.FullName "python.exe"; if (Test-Path $c) { return $c }
    }
    $g = Get-Command python -ErrorAction SilentlyContinue
    if ($g -and $g.Source -notlike "*WindowsApps*") { return $g.Source }
    throw "Python nu a fost gasit. Seteaza `$env:BREADTH_PYTHON sau instaleaza Python 3.12."
}
$py = Find-Python

# ---------- 1. Ruleaza cele 4 surse ----------
& $py "$base\scripts\market_breadth_analyzer.py" `
    --detail-url  "https://tradermonty.github.io/market-breadth-analysis/market_breadth_data.csv" `
    --summary-url "https://tradermonty.github.io/market-breadth-analysis/market_breadth_summary.csv" `
    --output-dir  "$base\reports" | Out-Null
& $py "$uproot\scripts\uptrend_analyzer.py" --output-dir "$uproot\reports" | Out-Null
& $py "$base\nasdaq100\nasdaq100_breadth.py" --output-dir "$base\nasdaq100\reports" | Out-Null
& $py "$base\russell2000\russell2000_breadth.py" --output-dir "$base\russell2000\reports" | Out-Null

# ---------- 1b. Idei pe sectoare in crestere (top 5 RS/trend per sector) ----------
& $py "$base\sector_ideas.py" --output "$base\dashboard\sector_ideas.json" | Out-Null

# ---------- 1c. Backtest semnale (edge istoric atasat in dashboard) ----------
& $py "$base\backtest_breadth.py" --json "$base\dashboard\backtest.json" --md "$base\dashboard\backtest.md" | Out-Null

# ---------- 1d. Strat confirmare risc (VIX + credit + equal-weight) ----------
& $py "$base\confirmation.py" --output "$base\dashboard\confirmation.json" | Out-Null

# ---------- 1e. Poarta disciplina (circuit breaker peste trader-memory-core) ----------
& $py "$base\discipline_bridge.py" --out-dir "$base\dashboard" | Out-Null

# ---------- 1f. Pachet actionabil pe teze (stop ATR + sizing + earnings) ----------
& $py "$base\actionable.py" --output "$base\dashboard\actionable.json" | Out-Null

# ---------- 1g. Market timing O'Neil (distribution days + follow-through) ----------
& $py "$base\market_timing.py" --output "$base\dashboard\market_timing.json" | Out-Null

# ---------- 1h. Auto-validare verdict (proxy istoric + tracking live) ----------
& $py "$base\validate_verdict.py" --output "$base\dashboard\validate.json" --history "$base\dashboard\dashboard_history.json" | Out-Null

# ---------- 1i. Intermarket / macro (VIX term + dolar + credit + marfuri) ----------
& $py "$base\intermarket.py" --output "$base\dashboard\intermarket.json" | Out-Null

# ---------- 1j. Risc de portofoliu (sizing pe regim + corelatie + vol targeting) ----------
& $py "$base\portfolio_risk.py" --output "$base\dashboard\portfolio_risk.json" | Out-Null

# ---------- 1k. Backtest screening idei - SAPTAMANAL (concluzia nu se schimba zilnic;
# ancorele mobile ar face "edge-ul" sa tremure zi de zi si ar irosi ~120 fetch-uri 2y) ----------
$biJson = "$base\dashboard\backtest_ideas.json"
$biStale = (-not (Test-Path $biJson)) -or ((Get-Date) - (Get-Item $biJson).LastWriteTime).TotalDays -gt 6
if ($biStale) {
    & $py "$base\backtest_ideas.py" --output $biJson | Out-Null
}

# ---------- 1l. Backtest semnal rotatie sectoriala - SAPTAMANAL (12 fetch-uri 10y;
# concluzia nu se schimba zilnic) ----------
$brJson = "$base\dashboard\backtest_rotation.json"
$brStale = (-not (Test-Path $brJson)) -or ((Get-Date) - (Get-Item $brJson).LastWriteTime).TotalDays -gt 6
if ($brStale) {
    & $py "$base\backtest_rotation.py" --output $brJson | Out-Null
}

# ---------- 1m. Backtest rotatie la nivel de actiune - LUNAR (cel mai scump:
# ~500 fetch-uri 5y; concluzia "liderii rezista?" se schimba foarte rar) ----------
$bsJson = "$base\dashboard\backtest_rotation_stocks.json"
$bsStale = (-not (Test-Path $bsJson)) -or ((Get-Date) - (Get-Item $bsJson).LastWriteTime).TotalDays -gt 27
if ($bsStale) {
    & $py "$base\backtest_rotation_stocks.py" --output $bsJson | Out-Null
}

# ---------- 1n. Backtest screen Early buy - LUNAR (refoloseste cache-ul 5y de la 1m) ----------
$ebJson = "$base\dashboard\backtest_earlybuy.json"
$ebStale = (-not (Test-Path $ebJson)) -or ((Get-Date) - (Get-Item $ebJson).LastWriteTime).TotalDays -gt 27
if ($ebStale) {
    & $py "$base\backtest_earlybuy.py" --output $ebJson | Out-Null
}

# ---------- 1o. Auto-validare setup-uri A+ - ZILNIC (ieftin: doar tickerele A+ istorice) ----------
& $py "$base\validate_aplus.py" --history "$base\dashboard\dashboard_history.json" `
    --output "$base\dashboard\validate_aplus.json" | Out-Null

# ---------- 2. Agregatorul (verdict, divergenta, alerte, idei, HTML, retentie) ----------
& $py "$base\breadth_dashboard.py" --output-dir "$base\dashboard" | Out-Null

# ---------- 3. Citeste payload-ul notificarii ----------
$payload = Get-Content "$base\dashboard\notification_payload.json" -Raw | ConvertFrom-Json
$title = $payload.title
$lines = @($payload.lines)
$isAlert = ($payload.alert_level -eq "ALERT")
$htmlPath = $payload.html_path

# #1: in mod AlertOnly, sari notificarea cand nu e alerta
if ($AlertOnly -and -not $isAlert) {
    Write-Output "Fara alerta (INFO) - notificare suprimata (-AlertOnly)."
    return
}

# -OnlyOnChange: notifica doar daca stance-ul master s-a schimbat fata de ziua precedenta
if ($OnlyOnChange) {
    try {
        $h = Get-Content "$base\dashboard\dashboard_history.json" -Raw | ConvertFrom-Json
        if ($h.Count -ge 2 -and $h[-1].master_stance -eq $h[-2].master_stance -and -not $isAlert) {
            Write-Output "Stance neschimbat ($($h[-1].master_stance)) - notificare si email suprimate (-OnlyOnChange)."
            return
        }
    } catch {}
}

# ---------- 3b. Email digest - DUPA gate-uri, ca sa respecte aceleasi reguli de suprimare ----------
& $py "$base\email_digest.py" | Out-Null

# ---------- 4. Notificare unica, persistenta (AppID inregistrat) ----------
function Esc($s) { return ([string]$s -replace '&','&amp;' -replace '<','&lt;' -replace '>','&gt;') }
$appId = "MarketBreadth.Monitor"
try {
    [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
    $textNodes = ($lines | ForEach-Object { "<text>$(Esc $_)</text>" }) -join ""
    # buton care deschide dashboard-ul HTML + buton de inchidere; ramane pe ecran (reminder)
    $actions = "<action activationType='protocol' arguments='file:///$([uri]::EscapeUriString($htmlPath.Replace('\','/')))' content='Deschide dashboard'/><action activationType='system' arguments='dismiss' content='Inchide'/>"
    $xmlStr = "<toast scenario='reminder'><visual><binding template='ToastGeneric'><text>$(Esc $title)</text>$textNodes</binding></visual><actions>$actions</actions></toast>"
    $xml = [Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom, ContentType = WindowsRuntime]::new()
    $xml.LoadXml($xmlStr)
    $toast = [Windows.UI.Notifications.ToastNotification]::new($xml)
    [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($appId).Show($toast)
} catch {
    Add-Type -AssemblyName System.Windows.Forms
    $n = New-Object System.Windows.Forms.NotifyIcon
    $n.Icon = [System.Drawing.SystemIcons]::Information; $n.Visible = $true
    $ic = if ($isAlert) { [System.Windows.Forms.ToolTipIcon]::Warning } else { [System.Windows.Forms.ToolTipIcon]::Info }
    $n.ShowBalloonTip(15000, $title, ($lines -join "`n"), $ic)
    Start-Sleep -Seconds 13; $n.Dispose()
}

# ---------- 5. Deschide dashboard-ul HTML doar la ALERTA (sau niciodata cu -NoHtml) ----------
if ($isAlert -and -not $NoHtml -and $htmlPath -and (Test-Path $htmlPath)) {
    Start-Process $htmlPath
}

Write-Output $title
$lines | ForEach-Object { Write-Output $_ }
