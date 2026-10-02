<#
Setup portabil pentru Market Breadth Dashboard pe un PC nou.
Ruleaza o singura data:  powershell -ExecutionPolicy Bypass -File setup.ps1
Face: gaseste Python, instaleaza dependinte, inregistreaza AppID notificari,
creeaza task-ul zilnic, shortcut-uri desktop + Start Menu, config initial.
#>
param([double]$AccountSize = 0, [string]$Time = "10:00")
$ErrorActionPreference = "Stop"
$base = $PSScriptRoot
Write-Host "== Setup Market Breadth Dashboard ==" -ForegroundColor Cyan
Write-Host "Baza: $base"

# 1. Python
function Find-Python {
    if ($env:BREADTH_PYTHON -and (Test-Path $env:BREADTH_PYTHON)) { return $env:BREADTH_PYTHON }
    foreach ($v in "Python312","Python311","Python313","Python314") {
        $c = "$env:LOCALAPPDATA\Programs\Python\$v\python.exe"; if (Test-Path $c) { return $c }
    }
    # Instalari Microsoft Store / pythoncore (executabilul real, nu stub-ul din WindowsApps)
    $core = Get-ChildItem "$env:LOCALAPPDATA\Python" -Directory -Filter "pythoncore-*" -ErrorAction SilentlyContinue |
            Sort-Object Name -Descending
    foreach ($d in $core) {
        $c = Join-Path $d.FullName "python.exe"; if (Test-Path $c) { return $c }
    }
    $g = Get-Command python -ErrorAction SilentlyContinue
    if ($g -and $g.Source -notlike "*WindowsApps*") { return $g.Source }
    return $null
}
$py = Find-Python
if (-not $py) {
    Write-Host "Python 3.12 nu a fost gasit. Instaleaza de la python.org (bifeaza 'Add to PATH'), apoi reruleaza." -ForegroundColor Red
    return
}
Write-Host "Python: $py" -ForegroundColor Green

# 2. Dependinte
Write-Host "Instalez dependinte (requests, pyyaml, tzdata, jsonschema)..."
& $py -m pip install -r "$base\requirements.txt" --quiet
Write-Host "Dependinte OK" -ForegroundColor Green

# 3. AppID pentru notificari persistente
$key = "HKCU:\Software\Classes\AppUserModelId\MarketBreadth.Monitor"
if (-not (Test-Path $key)) { New-Item -Path $key -Force | Out-Null }
Set-ItemProperty $key -Name DisplayName -Value "Market Breadth" -Type String
Set-ItemProperty $key -Name ShowInSettings -Value 1 -Type DWord
Write-Host "AppID notificari inregistrat" -ForegroundColor Green

# 4. State dir + config (nu suprascrie configul existent)
$stateDir = Join-Path $base "_trader_state\theses"
New-Item -ItemType Directory -Force $stateDir | Out-Null
$cfgPath = Join-Path $base "dashboard\discipline_config.json"
New-Item -ItemType Directory -Force (Split-Path $cfgPath) | Out-Null
if (-not (Test-Path $cfgPath)) {
    $acct = if ($AccountSize -gt 0) { $AccountSize } else { $null }
    $cfg = @{ account_size = $acct; state_dir = $stateDir } | ConvertTo-Json
    [IO.File]::WriteAllText($cfgPath, $cfg)  # fara BOM
    Write-Host "Config creat: $cfgPath (account_size=$acct)" -ForegroundColor Green
} else {
    Write-Host "Config existent pastrat: $cfgPath" -ForegroundColor Yellow
}

# 5. Task zilnic L-V
$wrapper = Join-Path $base "run_breadth_combined.ps1"
$env:BREADTH_PYTHON = $py
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$wrapper`""
$trigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday,Tuesday,Wednesday,Thursday,Friday -At $Time
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -WakeToRun -ExecutionTimeLimit (New-TimeSpan -Minutes 25)
Register-ScheduledTask -TaskName "MarketBreadthCombined" -Action $action -Trigger $trigger -Settings $settings -Description "Market breadth zilnic (L-V) cu notificare" -Force | Out-Null
Write-Host "Task 'MarketBreadthCombined' creat (L-V, $Time)" -ForegroundColor Green

# 6. Shortcut-uri
$html = Join-Path $base "dashboard\breadth_dashboard.html"
$ws = New-Object -ComObject WScript.Shell
foreach ($dir in @([Environment]::GetFolderPath("Desktop"),
                   (Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs"))) {
    $lnk = Join-Path $dir "Market Breadth Dashboard.lnk"
    $sc = $ws.CreateShortcut($lnk); $sc.TargetPath = $html
    $sc.Description = "Dashboard market breadth"; $sc.Save()
}
Write-Host "Shortcut-uri create (desktop + Start Menu)" -ForegroundColor Green

# 7. Setare BREADTH_PYTHON permanent (ca task-ul sa gaseasca Python)
[Environment]::SetEnvironmentVariable("BREADTH_PYTHON", $py, "User")

Write-Host "`n== GATA ==" -ForegroundColor Cyan
Write-Host "Rulez prima data acum (poate dura 3-5 min)..."
& powershell -NoProfile -ExecutionPolicy Bypass -File $wrapper
Write-Host "`nDeschide dashboard-ul din shortcut sau ruleaza: Start-ScheduledTask -TaskName MarketBreadthCombined" -ForegroundColor Green
if ($AccountSize -le 0) {
    Write-Host "NOTA: seteaza account_size in $cfgPath ca sizing-ul sa fie al tau." -ForegroundColor Yellow
}
