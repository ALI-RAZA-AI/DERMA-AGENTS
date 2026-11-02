@echo off
REM DermaAgents - one-click local start for Windows.
REM Requires Python 3.11 or 3.12 (python.org, tick "Add python.exe to PATH" during install).
cd /d "%~dp0backend"
if not exist ".venv" (
  echo Creating virtual environment...
  python -m venv .venv || goto :nopython
)
call .venv\Scripts\activate.bat
echo Installing / checking dependencies (first run takes a few minutes)...
python -m pip install --upgrade pip >nul
python -m pip install -r requirements.txt || goto :piperror
echo.
echo DermaAgents is starting at  http://127.0.0.1:8000
echo Keep this window open. Press Ctrl+C to stop.
start "" http://127.0.0.1:8000
python -m uvicorn dermaagents.api.main:app --host 127.0.0.1 --port 8000
goto :eof
:nopython
echo Python was not found. Install Python 3.12 from https://www.python.org/downloads/ and run this file again.
pause
goto :eof
:piperror
echo Dependency installation failed. Check your internet connection and run this file again.
pause
