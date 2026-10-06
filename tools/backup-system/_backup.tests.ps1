# Harness de test fără Pester. Rulează: powershell -NoProfile -ExecutionPolicy Bypass -File _backup.tests.ps1
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '_backup-lib.ps1')

$script:pass = 0; $script:fail = 0
function Assert($name, $cond){ if($cond){ $script:pass++; Write-Host "PASS  $name" -ForegroundColor Green } else { $script:fail++; Write-Host "FAIL  $name" -ForegroundColor Red } }

# Test-IsSecret
Assert 'secret .key'      (Test-IsSecret 'config.key')
Assert 'secret ghp_'      (Test-IsSecret 'ghp_abc.txt')
Assert 'secret sk-ant'    (Test-IsSecret 'sk-ant-x.txt')
Assert 'secret token'     (Test-IsSecret 'my-token-file.txt')
Assert 'nu e secret html' (-not (Test-IsSecret 'index.html'))
Assert 'nu e secret js'   (-not (Test-IsSecret 'app.js'))

# Get-Sha256Hex
$tf = Join-Path $env:TEMP ('h_' + [System.Guid]::NewGuid().ToString('N') + '.txt')
Set-Content -LiteralPath $tf -Value 'abc' -NoNewline -Encoding UTF8
$h1 = Get-Sha256Hex $tf
Set-Content -LiteralPath $tf -Value 'abc' -NoNewline -Encoding UTF8
$h2 = Get-Sha256Hex $tf
Set-Content -LiteralPath $tf -Value 'abcd' -NoNewline -Encoding UTF8
$h3 = Get-Sha256Hex $tf
Remove-Item $tf -Force
Assert 'hash stabil'   ($h1 -eq $h2)
Assert 'hash diferit'  ($h1 -ne $h3)

# Un fisier BLOCAT de alt program nu are voie sa rupa tot backup-ul.
#
# Asa a picat backup-ul lui depozit-gestiune de 157 de ori intre 06 si 16.08.2026,
# tacut: serverul tinea deschise baza si jurnalele, Get-FileHash intorcea $null,
# iar `.Hash` pe $null arunca. Un singur fisier ocupat anula copia intregului
# proiect - si scria esecul doar in log.
$bl = Join-Path $env:TEMP ('blocat_' + [System.Guid]::NewGuid().ToString('N') + '.txt')
Set-Content -LiteralPath $bl -Value 'continut' -NoNewline -Encoding UTF8
$fs = [System.IO.File]::Open($bl, 'Open', 'Read', 'None')   # blocat exclusiv
try {
  $hb = Get-Sha256Hex $bl
} finally {
  $fs.Close()
  Remove-Item $bl -Force -ErrorAction SilentlyContinue
}
Assert 'fisier blocat nu arunca'      ($null -ne $hb)
Assert 'fisier blocat are marcaj'     ($hb -like 'BLOCAT:*')

# Get-IncludedFiles + Get-FolderHash
$src = Join-Path $env:TEMP ('src_' + [System.Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force -Path $src | Out-Null
Set-Content -LiteralPath (Join-Path $src 'a.txt') -Value 'unu' -Encoding UTF8
New-Item -ItemType Directory -Force -Path (Join-Path $src '.git') | Out-Null
Set-Content -LiteralPath (Join-Path $src '.git\HEAD') -Value 'ref' -Encoding UTF8
New-Item -ItemType Directory -Force -Path (Join-Path $src 'sub') | Out-Null
Set-Content -LiteralPath (Join-Path $src 'sub\b.txt') -Value 'doi' -Encoding UTF8
Set-Content -LiteralPath (Join-Path $src 'creds.key') -Value 'secret' -Encoding UTF8

$inc = @(Get-IncludedFiles -Root $src -Exclude @('.git'))
$names = ($inc | ForEach-Object { $_.Name }) -join ','
Assert 'include a.txt'      ($names -like '*a.txt*')
Assert 'include sub b.txt'  ($names -like '*b.txt*')
Assert 'exclude .git/HEAD'  (-not ($names -like '*HEAD*'))
Assert 'exclude creds.key'  (-not ($names -like '*creds.key*'))

$fh1 = Get-FolderHash -Root $src -Exclude @('.git')
$fh2 = Get-FolderHash -Root $src -Exclude @('.git')
Set-Content -LiteralPath (Join-Path $src 'a.txt') -Value 'MODIFICAT' -Encoding UTF8
$fh3 = Get-FolderHash -Root $src -Exclude @('.git')
Remove-Item $src -Recurse -Force
Assert 'folder hash stabil'  ($fh1 -eq $fh2)
Assert 'folder hash diferit' ($fh1 -ne $fh3)

# New-Snapshot — fișier
$root = Join-Path $env:TEMP ('bk_' + [System.Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force -Path $root | Out-Null
$f1 = Join-Path $env:TEMP ('file_' + [System.Guid]::NewGuid().ToString('N') + '.html')
Set-Content -LiteralPath $f1 -Value '<html>x</html>' -Encoding UTF8
$itemF = [pscustomobject]@{ name='scan'; category='crypto-scanner'; path=$f1; type='file' }
$snapF = New-Snapshot -Item $itemF -Root $root -Stamp '2026-06-20_120000'
Assert 'snapshot fișier creat' (Test-Path $snapF)
Assert 'snapshot fișier nume'  ((Split-Path $snapF -Leaf) -eq 'scan_2026-06-20_120000.html')

# New-Snapshot — folder zip
$srcF = Join-Path $env:TEMP ('fld_' + [System.Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force -Path $srcF | Out-Null
Set-Content -LiteralPath (Join-Path $srcF 'index.html') -Value 'hi' -Encoding UTF8
Set-Content -LiteralPath (Join-Path $srcF 'app.js') -Value 'code' -Encoding UTF8
New-Item -ItemType Directory -Force -Path (Join-Path $srcF 'lib') | Out-Null
Set-Content -LiteralPath (Join-Path $srcF 'lib\util.js') -Value 'u' -Encoding UTF8
Set-Content -LiteralPath (Join-Path $srcF 'secret.key') -Value 'nope' -Encoding UTF8
$itemD = [pscustomobject]@{ name='suite'; category='premarket-suite'; path=$srcF; type='folder'; exclude=@() }
$snapD = New-Snapshot -Item $itemD -Root $root -Stamp '2026-06-20_120000'
Assert 'snapshot folder zip creat' (Test-Path $snapD)
Assert 'snapshot folder e zip'     ((Split-Path $snapD -Leaf) -eq 'suite_2026-06-20_120000.zip')
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead($snapD)
$entries = ($zip.Entries | ForEach-Object { $_.FullName }) -join ','
$zip.Dispose()
Assert 'zip conține index.html' ($entries -like '*index.html*')
Assert 'zip conține app.js'      ($entries -like '*app.js*')
Assert 'zip conține lib/util.js' ($entries -like '*util.js*')
Assert 'zip exclude secret.key' (-not ($entries -like '*secret.key*'))
Remove-Item $f1,$srcF,$root -Recurse -Force -ErrorAction SilentlyContinue

# Invoke-Rotation
$rotDir = Join-Path $env:TEMP ('rot_' + [System.Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force -Path $rotDir | Out-Null
foreach($s in '2026-06-20_100000','2026-06-20_110000','2026-06-20_120000','2026-06-20_130000','2026-06-20_140000'){
  Set-Content -LiteralPath (Join-Path $rotDir "scan_$s.html") -Value 'x' -Encoding UTF8
}
Set-Content -LiteralPath (Join-Path $rotDir 'altceva_2026-06-20_090000.html') -Value 'y' -Encoding UTF8
$del = Invoke-Rotation -CategoryDir $rotDir -Name 'scan' -Keep 3
$rest = @(Get-ChildItem -LiteralPath $rotDir -File -Filter 'scan_*' | ForEach-Object { $_.Name }) | Sort-Object
Assert 'rotație a șters 2'        ($del -eq 2)
Assert 'rămân 3'                  ($rest.Count -eq 3)
Assert 'păstrează cele mai noi'   (($rest -join ',') -eq 'scan_2026-06-20_120000.html,scan_2026-06-20_130000.html,scan_2026-06-20_140000.html')
Assert 'nu atinge alt item'       (Test-Path (Join-Path $rotDir 'altceva_2026-06-20_090000.html'))
Remove-Item $rotDir -Recurse -Force

# Invoke-Backup end-to-end
$bRoot = Join-Path $env:TEMP ('broot_' + [System.Guid]::NewGuid().ToString('N'))
$srcFile = Join-Path $env:TEMP ('e2e_' + [System.Guid]::NewGuid().ToString('N') + '.html')
Set-Content -LiteralPath $srcFile -Value 'v1' -Encoding UTF8
New-Item -ItemType Directory -Force -Path (Join-Path $bRoot '_config') | Out-Null
$wl = @([pscustomobject]@{ name='e2e'; category='crypto-scanner'; path=$srcFile; type='file'; exclude=@() })
($wl | ConvertTo-Json -Depth 5) | Set-Content -LiteralPath (Join-Path $bRoot '_config\watchlist.json') -Encoding UTF8

Invoke-Backup -Root $bRoot
$c1 = @(Get-ChildItem -LiteralPath (Join-Path $bRoot 'crypto-scanner') -File -Filter 'e2e_*')
Assert 'e2e snapshot 1 creat' ($c1.Count -eq 1)

Invoke-Backup -Root $bRoot  # neschimbat → fără snapshot nou
$c2 = @(Get-ChildItem -LiteralPath (Join-Path $bRoot 'crypto-scanner') -File -Filter 'e2e_*')
Assert 'e2e neschimbat = tot 1' ($c2.Count -eq 1)

Start-Sleep -Seconds 1
Set-Content -LiteralPath $srcFile -Value 'v2' -Encoding UTF8
Invoke-Backup -Root $bRoot  # schimbat → snapshot nou
$c3 = @(Get-ChildItem -LiteralPath (Join-Path $bRoot 'crypto-scanner') -File -Filter 'e2e_*')
Assert 'e2e schimbat = 2' ($c3.Count -eq 2)

Assert 'log există' (Test-Path (Join-Path $bRoot '_log\backup-log.txt'))
Assert 'state există' (Test-Path (Join-Path $bRoot '_state\hashes.json'))
Remove-Item $srcFile,$bRoot -Recurse -Force -ErrorAction SilentlyContinue

# Regresie: watchlist cu MAI MULTE items (JSON array de mână) — toate trebuie procesate
$mRoot = Join-Path $env:TEMP ('mroot_' + [System.Guid]::NewGuid().ToString('N'))
$mf1 = Join-Path $env:TEMP ('m1_' + [System.Guid]::NewGuid().ToString('N') + '.html')
$mf2 = Join-Path $env:TEMP ('m2_' + [System.Guid]::NewGuid().ToString('N') + '.html')
Set-Content -LiteralPath $mf1 -Value 'a' -Encoding UTF8
Set-Content -LiteralPath $mf2 -Value 'b' -Encoding UTF8
New-Item -ItemType Directory -Force -Path (Join-Path $mRoot '_config') | Out-Null
$mjson = '[' +
  '{"name":"m1","category":"cat-a","path":' + ($mf1 | ConvertTo-Json) + ',"type":"file","exclude":[]},' +
  '{"name":"m2","category":"cat-b","path":' + ($mf2 | ConvertTo-Json) + ',"type":"file","exclude":[]}]'
Set-Content -LiteralPath (Join-Path $mRoot '_config\watchlist.json') -Value $mjson -Encoding UTF8
Invoke-Backup -Root $mRoot
$m1c = @(Get-ChildItem -LiteralPath (Join-Path $mRoot 'cat-a') -File -ErrorAction SilentlyContinue).Count
$m2c = @(Get-ChildItem -LiteralPath (Join-Path $mRoot 'cat-b') -File -ErrorAction SilentlyContinue).Count
Remove-Item $mf1,$mf2,$mRoot -Recurse -Force -ErrorAction SilentlyContinue
Assert 'multi-item: m1 salvat' ($m1c -eq 1)
Assert 'multi-item: m2 salvat' ($m2c -eq 1)

# Regresie: rotația lui 'scan' NU trebuie să atingă snapshot-urile lui 'scan_v2' (prefix + '_')
$colDir = Join-Path $env:TEMP ('col_' + [System.Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force -Path $colDir | Out-Null
foreach($s in '2026-06-20_100000','2026-06-20_110000','2026-06-20_120000','2026-06-20_130000'){
  Set-Content -LiteralPath (Join-Path $colDir "scan_$s.html") -Value 'x' -Encoding UTF8
  Set-Content -LiteralPath (Join-Path $colDir "scan_v2_$s.html") -Value 'y' -Encoding UTF8
}
$delCol = Invoke-Rotation -CategoryDir $colDir -Name 'scan' -Keep 3
$scanLeft = @(Get-ChildItem -LiteralPath $colDir -File | Where-Object { $_.Name -match '^scan_\d{4}' }).Count
$v2Left   = @(Get-ChildItem -LiteralPath $colDir -File | Where-Object { $_.Name -like 'scan_v2_*' }).Count
Remove-Item $colDir -Recurse -Force
Assert 'rotație scan a șters 1'     ($delCol -eq 1)
Assert 'scan rămâne 3'             ($scanLeft -eq 3)
Assert 'scan_v2 neatins (4)'       ($v2Left -eq 4)

# Starea se scrie dupa FIECARE item, nu doar la final.
#
# 17.08-06.10.2026: hook-ul Stop are timeout 30 s si omora rularea dupa primele
# 5-6 iteme; hashes.json se scria abia la final, deci nu se scria niciodata.
# Fiecare rulare relua premarket+pine de la zero si nu ajungea la memorie,
# gestiune, DatorieTrack. Aici: cand ajunge la al doilea item, primul e deja in stare.
$sRoot = Join-Path $env:TEMP ('st_' + [System.Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force -Path (Join-Path $sRoot '_config') | Out-Null
$sfA = Join-Path $env:TEMP ('sa_' + [System.Guid]::NewGuid().ToString('N') + '.txt'); Set-Content -LiteralPath $sfA -Value 'A' -Encoding UTF8
$sfB = Join-Path $env:TEMP ('sb_' + [System.Guid]::NewGuid().ToString('N') + '.txt'); Set-Content -LiteralPath $sfB -Value 'B' -Encoding UTF8
$sjson = (@(
  @{ name='primul'; category='c1'; path=$sfA; type='file'; exclude=@() },
  @{ name='alDoilea'; category='c2'; path=$sfB; type='file'; exclude=@() }
) | ConvertTo-Json -Depth 4)
Set-Content -LiteralPath (Join-Path $sRoot '_config\watchlist.json') -Value $sjson -Encoding UTF8
$script:stareLaB = $null
$origHash = ${function:Get-ItemHash}
function Get-ItemHash { param($Item)
  if($Item.name -eq 'alDoilea'){
    $sp = Join-Path $sRoot '_state\hashes.json'
    $script:stareLaB = if(Test-Path $sp){ Get-Content -LiteralPath $sp -Raw } else { '' }
  }
  & $origHash -Item $Item
}
Invoke-Backup -Root $sRoot
${function:Get-ItemHash} = $origHash
Remove-Item $sfA,$sfB,$sRoot -Recurse -Force -ErrorAction SilentlyContinue
Assert 'stare: primul item salvat inainte de al doilea' ($null -ne $script:stareLaB -and $script:stareLaB -like '*primul*')

# Doua rulari NU se suprapun: hook-ul Stop porneste la fiecare raspuns, o rulare
# lunga ar fi calcata de urmatoarea (acelasi zip, acelasi hashes.json).
$lRoot = Join-Path $env:TEMP ('lk_' + [System.Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force -Path (Join-Path $lRoot '_config') | Out-Null
$lf = Join-Path $env:TEMP ('lf_' + [System.Guid]::NewGuid().ToString('N') + '.txt'); Set-Content -LiteralPath $lf -Value 'L' -Encoding UTF8
Set-Content -LiteralPath (Join-Path $lRoot '_config\watchlist.json') -Value (@(@{ name='lk'; category='lk'; path=$lf; type='file'; exclude=@() }) | ConvertTo-Json -Depth 4 | ForEach-Object { "[$_]" }) -Encoding UTF8
$sem = New-Object System.Threading.Semaphore(1, 1, (Get-BackupLockName -Root $lRoot))
[void]$sem.WaitOne()
try { Invoke-Backup -Root $lRoot } finally { [void]$sem.Release(); $sem.Dispose() }
$lkCnt = @(Get-ChildItem -LiteralPath (Join-Path $lRoot 'lk') -File -ErrorAction SilentlyContinue).Count
$lkLog = Get-Content -LiteralPath (Join-Path $lRoot '_log\backup-log.txt') -Raw -ErrorAction SilentlyContinue
Invoke-Backup -Root $lRoot
$lkCnt2 = @(Get-ChildItem -LiteralPath (Join-Path $lRoot 'lk') -File -ErrorAction SilentlyContinue).Count
Remove-Item $lf,$lRoot -Recurse -Force -ErrorAction SilentlyContinue
Assert 'lacat: a doua rulare nu face nimic'  ($lkCnt -eq 0)
Assert 'lacat: scrie de ce a sarit'          ($lkLog -like '*deja ruleaz*')
Assert 'lacat: eliberat, rularea merge'      ($lkCnt2 -eq 1)

# minIntervalHours: un item mare care se schimba des (crypto/data, la 2 min)
# primeste o copie cel mult o data la N ore, nu la fiecare raspuns.
$iRoot = Join-Path $env:TEMP ('iv_' + [System.Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force -Path (Join-Path $iRoot '_config') | Out-Null
$if1 = Join-Path $env:TEMP ('if_' + [System.Guid]::NewGuid().ToString('N') + '.txt'); Set-Content -LiteralPath $if1 -Value 'v1' -Encoding UTF8
Set-Content -LiteralPath (Join-Path $iRoot '_config\watchlist.json') -Value (@(@{ name='mare'; category='mare'; path=$if1; type='file'; exclude=@(); minIntervalHours=24 }) | ConvertTo-Json -Depth 4 | ForEach-Object { "[$_]" }) -Encoding UTF8
Invoke-Backup -Root $iRoot
# nume vechi, data proaspata: intervalul se judeca dupa data fisierului, iar o
# copie noua n-ar mai putea suprascrie-o pe asta din greseala (alt stamp)
Get-ChildItem -LiteralPath (Join-Path $iRoot 'mare') -File | ForEach-Object { Rename-Item -LiteralPath $_.FullName -NewName ('mare_2026-01-02_000000' + $_.Extension) }
Set-Content -LiteralPath $if1 -Value 'v2' -Encoding UTF8
Invoke-Backup -Root $iRoot
$iv1 = @(Get-ChildItem -LiteralPath (Join-Path $iRoot 'mare') -File).Count
# Copia "veche" primeste si un nume vechi: doua rulari in aceeasi secunda ar
# avea acelasi stamp, iar a doua ar suprascrie-o pe prima (test instabil).
$k = 0
Get-ChildItem -LiteralPath (Join-Path $iRoot 'mare') -File | ForEach-Object {
  $_.LastWriteTime = (Get-Date).AddHours(-25)
  $k++
  Rename-Item -LiteralPath $_.FullName -NewName (('mare_2026-01-01_00000{0}' -f $k) + $_.Extension)
}
Invoke-Backup -Root $iRoot
$iv2 = @(Get-ChildItem -LiteralPath (Join-Path $iRoot 'mare') -File).Count
$ivLog = Get-Content -LiteralPath (Join-Path $iRoot '_log\backup-log.txt') -Raw
Remove-Item $if1,$iRoot -Recurse -Force -ErrorAction SilentlyContinue
Assert 'interval: schimbat dar prea devreme = tot 1' ($iv1 -eq 1)
Assert 'interval: log spune prea devreme'            ($ivLog -like '*prea devreme*')
Assert 'interval: dupa 25 h face copia = 2'          ($iv2 -eq 2)

# Un FOLDER cu "secret" in nume nu intra niciodata in copie, chiar daca lista
# de excluderi nu-l numeste. 06.10.2026: gestiunea are `data\secret` exclus, dar
# cheia Firebase sta in `data\secrete` (alt nume) - a intrat in zip si a urcat
# in Drive. Numele fisierului (firebase-gestiune.json) nu are cum s-o tradeze.
$sk = Join-Path $env:TEMP ('sk_' + [System.Guid]::NewGuid().ToString('N'))
foreach($dd in 'data\secrete','data\Secrets','cod'){ New-Item -ItemType Directory -Force -Path (Join-Path $sk $dd) | Out-Null }
Set-Content -LiteralPath (Join-Path $sk 'data\secrete\firebase-gestiune.json') -Value '{"k":1}' -Encoding UTF8
Set-Content -LiteralPath (Join-Path $sk 'data\Secrets\cont.json') -Value '{"k":2}' -Encoding UTF8
Set-Content -LiteralPath (Join-Path $sk 'cod\app.py') -Value 'x=1' -Encoding UTF8
$skNames = (@(Get-IncludedFiles -Root $sk -Exclude @('data\secret')) | ForEach-Object { $_.Name }) -join ','
Remove-Item $sk -Recurse -Force
Assert 'folder secrete: cheia NU intra'   (-not ($skNames -like '*firebase-gestiune*'))
Assert 'folder Secrets: NU intra'         (-not ($skNames -like '*cont.json*'))
Assert 'folder secrete: codul intra'      ($skNames -like '*app.py*')

Write-Host "`nSUMMARY $script:pass PASS / $script:fail FAIL"
if($script:fail -gt 0){ exit 1 } else { exit 0 }
