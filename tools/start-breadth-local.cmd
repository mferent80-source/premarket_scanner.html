@echo off
setlocal
cd /d "%~dp0.."
if not exist ".venv\Scripts\python.exe" (
  py -3 -c "import sys;sys.exit(sys.version_info < (3,11))"
  if errorlevel 1 (
    echo Este necesar Python 3.11 sau mai nou, cu Python Launcher instalat.
    pause
    exit /b 1
  )
  py -3 -m venv .venv
  if errorlevel 1 (
    echo Instaleaza Python 3.11 sau mai nou, apoi porneste din nou acest fisier.
    pause
    exit /b 1
  )
)
if not exist ".venv\breadth-ready" (
  .venv\Scripts\python.exe -m pip install requests pyyaml tzdata jsonschema
  if errorlevel 1 (
    echo Instalarea dependentelor a esuat. Verifica internetul si porneste din nou.
    pause
    exit /b 1
  )
  echo ready> .venv\breadth-ready
)
.venv\Scripts\python.exe tools\breadth-local-server.py
pause
