@echo off
chcp 65001 >nul
title MFX Screener - server local
cd /d "%~dp0"

echo.
echo   ============================================
echo     MFX SCREENER - server local
echo   ============================================
echo.

where python >nul 2>&1
if errorlevel 1 (
  echo   [X] Python nu a fost gasit in PATH.
  echo       Instaleaza-l din Microsoft Store si incearca din nou.
  echo.
  pause
  exit /b 1
)

REM portul 8777 ca sa nu se bata cu alte servere pornite
set PORT=8777

echo   Pornesc serverul pe http://localhost:%PORT%
echo   Se deschide singur in browser.
echo.
echo   LASA FEREASTRA ASTA DESCHISA cat timp folosesti pagina.
echo   Ca sa opresti: inchide fereastra sau apasa Ctrl+C.
echo.

start "" "http://localhost:%PORT%/mfx-screener/"

python -m http.server %PORT%

echo.
echo   Serverul s-a oprit.
pause
