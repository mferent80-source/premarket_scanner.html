# _backup.ps1 — entry. Apelat de hook-ul Stop. Iese MEREU cu 0 (non-blocant).
param([string]$Root = 'E:\Backup-Claude')
try{
  . (Join-Path $PSScriptRoot '_backup-lib.ps1')
  Invoke-Backup -Root $Root
} catch { }
exit 0
