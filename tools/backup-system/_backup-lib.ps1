# _backup-lib.ps1 — funcții pentru sistemul de backup. Dot-source din _backup.ps1 și din teste.
Set-StrictMode -Version Latest

# Tipare secrete. `sk-ant-*`/`ghp_*` prind cheile reale Anthropic/GitHub; am scos `sk-*`/`pk-*`
# bare (false-positives pe fișiere legitime de cod, iar backup-ul e local deci riscul de leak e mic).
$script:SecretPatterns = @('*.key','*.pem','.env','*token*','*secret*','*apikey*','*api*key*','sk-ant-*','sk-proj-*','ghp_*','gho_*','github_pat_*',
  # numele romanesti din PAZNIC-CRYPTO (06.10.2026): jeton.txt, .parola-panou, chei-pionex.json
  '*jeton*','*parola*','chei-*','chei_*','.dev.vars*')

function Test-IsSecret {
  param([Parameter(Mandatory)][string]$Name)
  foreach($p in $script:SecretPatterns){ if($Name -like $p){ return $true } }
  return $false
}

function Get-Sha256Hex {
  param([Parameter(Mandatory)][string]$Path)
  # Un fisier blocat de alt program NU are voie sa rupa tot backup-ul.
  #
  # Pe 06.08.2026 serverul de gestiune a inceput sa tina deschise baza si
  # jurnalele lui. Get-FileHash a esuat pe ele, a intors $null, iar `.Hash` pe
  # $null arunca "The property 'Hash' cannot be found". Rezultatul: backup-ul
  # proiectului depozit-gestiune a picat de 157 de ori la rand, timp de 10
  # zile, si a scris esecul DOAR in log - unde nu se uita nimeni.
  #
  # Acum fisierul blocat intra in amprenta cu marimea si data lui. Se pierde
  # precizia pe acel fisier, dar se salveaza restul proiectului - iar un
  # backup partial e infinit mai bun decat niciunul.
  try {
    $h = Get-FileHash -LiteralPath $Path -Algorithm SHA256 -ErrorAction Stop
    return $h.Hash
  } catch {
    try {
      $fi = Get-Item -LiteralPath $Path -Force -ErrorAction Stop
      return ("BLOCAT:{0}:{1}" -f $fi.Length, $fi.LastWriteTimeUtc.Ticks)
    } catch {
      return "INACCESIBIL"
    }
  }
}

function Get-ItemExcludes {
  # ($exclude pe foldere, $excludeFiles pe nume de fisier) - ambele optionale in watchlist
  param([Parameter(Mandatory)]$Item)
  $ex = @(); $exf = @()
  if(($Item.PSObject.Properties.Name -contains 'exclude') -and $Item.exclude){ $ex = @($Item.exclude) }
  if(($Item.PSObject.Properties.Name -contains 'excludeFiles') -and $Item.excludeFiles){ $exf = @($Item.excludeFiles) }
  return @{ Folders = $ex; Files = $exf }
}

function Get-IncludedFiles {
  param([Parameter(Mandatory)][string]$Root,[string[]]$Exclude=@(),[string[]]$ExcludeFiles=@())
  $rootFull = (Resolve-Path -LiteralPath $Root).Path.TrimEnd('\')
  $result = New-Object System.Collections.Generic.List[System.IO.FileInfo]
  $stack = New-Object System.Collections.Stack
  $stack.Push($rootFull)
  while($stack.Count -gt 0){
    $dir = [string]$stack.Pop()
    $entries = Get-ChildItem -LiteralPath $dir -Force -ErrorAction SilentlyContinue
    foreach($e in $entries){
      if($e.PSIsContainer){
        $childRel = $e.FullName.Substring($rootFull.Length).TrimStart('\')
        # Orice folder cu "secret" in nume (secret, secrete, Secrets) sta afara,
        # chiar daca lista nu-l numeste: 06.10.2026 cheia Firebase din
        # `data\secrete` a trecut de excluderea `data\secret` si a urcat in Drive.
        $excluded = ($e.Name -like '*secret*')
        foreach($ex in $Exclude){ if($e.Name -ieq $ex -or $childRel -ieq $ex){ $excluded=$true; break } }
        if(-not $excluded){ $stack.Push($e.FullName) }
      } else {
        $skip = Test-IsSecret $e.Name
        if(-not $skip){ foreach($p in $ExcludeFiles){ if($e.Name -like $p){ $skip = $true; break } } }
        if(-not $skip){ $result.Add($e) }
      }
    }
  }
  # FĂRĂ operatorul virgulă: `,$arr` dublu-ambalează (1-elem care conține array-ul), iar `@()` din
  # apelanți nu-l desface → cu multe fișiere calea relativă devine array → eroare. ToArray() simplu
  # se desfășoară corect, iar apelanții folosesc deja `@(...)` pentru normalizare.
  return $result.ToArray()
}

function Get-FolderHash {
  param([Parameter(Mandatory)][string]$Root,[string[]]$Exclude=@(),[string[]]$ExcludeFiles=@())
  $rootFull = (Resolve-Path -LiteralPath $Root).Path.TrimEnd('\')
  $files = @(Get-IncludedFiles -Root $rootFull -Exclude $Exclude -ExcludeFiles $ExcludeFiles) | Sort-Object FullName
  $sb = New-Object System.Text.StringBuilder
  foreach($f in $files){
    $rel = $f.FullName.Substring($rootFull.Length).TrimStart('\')
    [void]$sb.AppendLine($rel + ':' + (Get-Sha256Hex $f.FullName))
  }
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($sb.ToString())
  $sha = [System.Security.Cryptography.SHA256]::Create()
  $hash = $sha.ComputeHash($bytes)
  return (($hash | ForEach-Object { $_.ToString('x2') }) -join '')
}

function New-Snapshot {
  param([Parameter(Mandatory)]$Item,[Parameter(Mandatory)][string]$Root,[Parameter(Mandatory)][string]$Stamp)
  $catDir = Join-Path $Root $Item.category
  New-Item -ItemType Directory -Force -Path $catDir | Out-Null
  if($Item.type -eq 'file'){
    $ext = [System.IO.Path]::GetExtension($Item.path)
    $dest = Join-Path $catDir ("{0}_{1}{2}" -f $Item.name,$Stamp,$ext)
    Copy-Item -LiteralPath $Item.path -Destination $dest -Force
    return $dest
  }
  $x = Get-ItemExcludes -Item $Item
  $files = @(Get-IncludedFiles -Root $Item.path -Exclude $x.Folders -ExcludeFiles $x.Files)
  if($files.Count -eq 0){ return $null }
  $rootFull = (Resolve-Path -LiteralPath $Item.path).Path.TrimEnd('\')
  $stage = Join-Path ([System.IO.Path]::GetTempPath()) ('bkp_' + [System.Guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Force -Path $stage | Out-Null
  try{
    foreach($f in $files){
      $rel = $f.FullName.Substring($rootFull.Length).TrimStart('\')
      $target = Join-Path $stage $rel
      New-Item -ItemType Directory -Force -Path (Split-Path $target -Parent) | Out-Null
      Copy-Item -LiteralPath $f.FullName -Destination $target -Force
    }
    $dest = Join-Path $catDir ("{0}_{1}.zip" -f $Item.name,$Stamp)
    if(Test-Path $dest){ Remove-Item -LiteralPath $dest -Force }
    Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $dest -Force
    return $dest
  } finally {
    Remove-Item -LiteralPath $stage -Recurse -Force -ErrorAction SilentlyContinue
  }
}

function Invoke-Rotation {
  param([Parameter(Mandatory)][string]$CategoryDir,[Parameter(Mandatory)][string]$Name,[int]$Keep=3)
  if(-not (Test-Path -LiteralPath $CategoryDir)){ return 0 }
  # Ancorat pe stamp-ul exact (yyyy-MM-dd_HHmmss) ca să NU prindem un alt item al cărui name
  # are prefixul ăsta urmat de `_` (ex. name='scan' vs 'scan_v2') — altfel rotația ar șterge greșit.
  $rx = '^' + [regex]::Escape($Name) + '_\d{4}-\d{2}-\d{2}_\d{6}(\.|$)'
  $snaps = @(Get-ChildItem -LiteralPath $CategoryDir -File -ErrorAction SilentlyContinue | Where-Object { $_.Name -match $rx } | Sort-Object Name -Descending)
  $deleted = 0
  if($snaps.Count -gt $Keep){
    foreach($old in $snaps[$Keep..($snaps.Count-1)]){ Remove-Item -LiteralPath $old.FullName -Force; $deleted++ }
  }
  return $deleted
}

function Get-ItemHash {
  param([Parameter(Mandatory)]$Item)
  if(-not (Test-Path -LiteralPath $Item.path)){ return $null }
  if($Item.type -eq 'file'){ return Get-Sha256Hex $Item.path }
  $x = Get-ItemExcludes -Item $Item
  return Get-FolderHash -Root $Item.path -Exclude $x.Folders -ExcludeFiles $x.Files
}

function Write-BackupLog {
  param([Parameter(Mandatory)][string]$Root,[Parameter(Mandatory)][string]$Message)
  try{
    $logDir = Join-Path $Root '_log'
    New-Item -ItemType Directory -Force -Path $logDir | Out-Null
    $line = ('{0}  {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Message)
    Add-Content -LiteralPath (Join-Path $logDir 'backup-log.txt') -Value $line -Encoding UTF8
  } catch { }
}

function Get-BackupLockName {
  # Numele lacatului depinde de Root, ca testele (Root in TEMP) sa nu se calce
  # cu backup-ul adevarat de pe E:.
  param([Parameter(Mandatory)][string]$Root)
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($Root.ToLowerInvariant().TrimEnd('\'))
  $sha = [System.Security.Cryptography.SHA256]::Create()
  $h = (($sha.ComputeHash($bytes) | Select-Object -First 8 | ForEach-Object { $_.ToString('x2') }) -join '')
  return ('Local\BackupClaude_' + $h)
}

function Save-BackupState {
  param([Parameter(Mandatory)][string]$StatePath,[Parameter(Mandatory)][hashtable]$State)
  try{
    New-Item -ItemType Directory -Force -Path (Split-Path $StatePath -Parent) | Out-Null
    ($State | ConvertTo-Json) | Set-Content -LiteralPath $StatePath -Encoding UTF8
  } catch {}
}

function Test-IntervalNotElapsed {
  # $true = itemul are `minIntervalHours` si ultima lui copie e mai noua de atat.
  param([Parameter(Mandatory)]$Item,[Parameter(Mandatory)][string]$Root)
  if(-not ($Item.PSObject.Properties.Name -contains 'minIntervalHours') -or -not $Item.minIntervalHours){ return $false }
  $catDir = Join-Path $Root $Item.category
  if(-not (Test-Path -LiteralPath $catDir)){ return $false }
  $rx = '^' + [regex]::Escape($Item.name) + '_\d{4}-\d{2}-\d{2}_\d{6}(\.|$)'
  $last = @(Get-ChildItem -LiteralPath $catDir -File -ErrorAction SilentlyContinue | Where-Object { $_.Name -match $rx } | Sort-Object LastWriteTime -Descending | Select-Object -First 1)
  if($last.Count -eq 0){ return $false }
  return (((Get-Date) - $last[0].LastWriteTime).TotalHours -lt [double]$Item.minIntervalHours)
}

function Invoke-Backup {
  param([string]$Root = 'E:\Backup-Claude')
  # Semafor cu nume, nu Mutex: un Mutex e reintrant pe acelasi fir, deci n-ar
  # opri o a doua rulare din acelasi proces. Daca procesul moare, Windows
  # inchide handle-ul si semaforul dispare - nu ramane un lacat agatat.
  $sem = $null; $areLacat = $false
  try{
    $sem = New-Object System.Threading.Semaphore(1, 1, (Get-BackupLockName -Root $Root))
    $areLacat = $sem.WaitOne(0)
  } catch { $areLacat = $true }
  if(-not $areLacat){
    Write-BackupLog $Root "sărit: o rulare anterioară încă rulează (deja rulează)"
    if($sem){ $sem.Dispose() }
    return
  }
  try{
    Invoke-BackupCore -Root $Root
  } finally {
    if($sem){ try{ [void]$sem.Release() }catch{}; $sem.Dispose() }
  }
}

function Invoke-BackupCore {
  param([string]$Root = 'E:\Backup-Claude')
  try{
    if(-not (Test-Path -LiteralPath $Root)){ try{ New-Item -ItemType Directory -Force -Path $Root | Out-Null }catch{ return } }
    $cfgPath = Join-Path $Root '_config\watchlist.json'
    $statePath = Join-Path $Root '_state\hashes.json'
    if(-not (Test-Path -LiteralPath $cfgPath)){ Write-BackupLog $Root "EROARE: watchlist.json lipsă"; return }
    $items = $null
    # NU folosi `@(... | ConvertFrom-Json)`: în PS 5.1 ambalează tot array-ul ca 1 element.
    # ConvertFrom-Json direct desfășoară array-ul; dacă e un singur obiect, îl ambalăm noi.
    try{
      $raw = Get-Content -LiteralPath $cfgPath -Raw -Encoding UTF8
      $items = ConvertFrom-Json $raw
      if($null -eq $items){ Write-BackupLog $Root "EROARE: watchlist.json gol"; return }
      if($items -isnot [System.Array]){ $items = @($items) }
    }
    catch{ Write-BackupLog $Root "EROARE: watchlist.json corupt"; return }
    $state = @{}
    if(Test-Path -LiteralPath $statePath){
      try{ $j = Get-Content -LiteralPath $statePath -Raw -Encoding UTF8 | ConvertFrom-Json
        foreach($p in $j.PSObject.Properties){ $state[$p.Name] = $p.Value } }catch{}
    }
    $stamp = Get-Date -Format 'yyyy-MM-dd_HHmmss'
    foreach($item in $items){
      try{
        if(Test-IntervalNotElapsed -Item $item -Root $Root){ Write-BackupLog $Root ("prea devreme: {0} (o copie la {1} h)" -f $item.name,$item.minIntervalHours); continue }
        $h = Get-ItemHash $item
        if($null -eq $h){ Write-BackupLog $Root ("LIPSĂ: {0} ({1})" -f $item.name,$item.path); continue }
        $prev = if($state.ContainsKey($item.name)){ $state[$item.name] } else { $null }
        if($h -eq $prev){ Write-BackupLog $Root ("neschimbat: {0}" -f $item.name); continue }
        $snap = New-Snapshot -Item $item -Root $Root -Stamp $stamp
        if($null -eq $snap){ Write-BackupLog $Root ("GOL: {0} (niciun fișier de salvat)" -f $item.name); continue }
        $state[$item.name] = $h
        # Scrisa dupa FIECARE item: daca rularea e oprita la jumatate, ce s-a
        # salvat deja nu se reia de la zero data viitoare.
        Save-BackupState -StatePath $statePath -State $state
        $del = Invoke-Rotation -CategoryDir (Join-Path $Root $item.category) -Name $item.name -Keep 3
        Write-BackupLog $Root ("snapshot: {0} -> {1} (șterse {2})" -f $item.name,(Split-Path $snap -Leaf),$del)
      } catch {
        Write-BackupLog $Root ("EROARE la {0}: {1}" -f $item.name, $_.Exception.Message)
      }
    }
    Save-BackupState -StatePath $statePath -State $state
  } catch {
    try{ Write-BackupLog $Root ("EROARE globală: {0}" -f $_.Exception.Message) }catch{}
  }
}
