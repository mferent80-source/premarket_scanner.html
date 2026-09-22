# Curata regulile de permisiune cu wildcard la mijloc din settings.local.json
# Backup: settings.local.json.bak

$p = "$env:USERPROFILE\.claude\settings.local.json"

if (-not (Test-Path $p)) {
    Write-Host "NU EXISTA: $p" -ForegroundColor Red
    exit 1
}

Copy-Item $p "$p.bak" -Force
Write-Host "Backup: $p.bak" -ForegroundColor DarkGray

$j = Get-Content $p -Raw | ConvertFrom-Json
$keep = @()
$drop = @()

foreach ($r in $j.permissions.allow) {
    $i = $r.IndexOf('(')
    $k = $r.LastIndexOf(')')
    $inner = $r
    if ($i -ge 0 -and $k -gt $i) { $inner = $r.Substring($i + 1, $k - $i - 1) }

    $risky = $inner.Contains('*') -and (-not $inner.EndsWith('*'))
    if ($risky) { $drop += $r } else { $keep += $r }
}

$j.permissions.allow = $keep
$out = $j | ConvertTo-Json -Depth 20
[System.IO.File]::WriteAllText($p, $out, (New-Object System.Text.UTF8Encoding($false)))

Write-Host ""
Write-Host "Sterse: $($drop.Count)    Ramase: $($keep.Count)" -ForegroundColor Green
Write-Host ""
foreach ($d in $drop) { Write-Host " - $d" -ForegroundColor DarkGray }
Write-Host ""
Write-Host "Gata. Reporneste Claude Code complet." -ForegroundColor Cyan
