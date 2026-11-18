@echo off
REM DermaAgents - run the backend test suite (run run.bat once first to set up .venv)
setlocal
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" (
    echo Run run.bat first to create the environment.
    pause
    exit /b 1
)
".venv\Scripts\python.exe" -m pip install -q -r backend\requirements-dev.txt
cd backend
"..\.venv\Scripts\python.exe" -m pytest -q
pause
endlocal
