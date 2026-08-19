@echo off
chcp 65001 >nul
title Trading Tools - server local
cd /d "%~dp0"

echo.
echo   ============================================
echo     TRADING TOOLS - server local
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

set PORT=8777

echo   Server pe http://localhost:%PORT%
echo   Se deschide hub-ul; de acolo ajungi la orice pagina:
echo.
echo     - Factor Lab     ... bancul de proba pentru factori
echo     - MFX Screener   ... screener EVC + laborator + jurnal
echo     - restul suitei
echo.
echo   LASA FEREASTRA ASTA DESCHISA cat timp folosesti paginile.
echo   Ca sa opresti: inchide fereastra sau apasa Ctrl+C.
echo.

start "" "http://localhost:%PORT%/"

python -m http.server %PORT%

echo.
echo   Serverul s-a oprit.
pause
