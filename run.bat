@echo off
REM ================================================================
REM  DermaAgents - one-click launcher for Windows
REM  Designed and Developed by ALI RAZA
REM
REM  First run : creates a Python virtual environment (.venv) and
REM              installs the backend requirements (needs internet,
REM              takes a few minutes).
REM  Every run : starts the server and opens http://127.0.0.1:8000
REM
REM  Options   : run.bat 8080        (use another port)
REM              run.bat reinstall   (rebuild the virtual environment)
REM  Stop      : press Ctrl+C in this window.
REM ================================================================
setlocal EnableExtensions
title DermaAgents
cd /d "%~dp0"
set "ROOT=%~dp0"
set "VENV=%ROOT%.venv"
set "PORT=8000"
set "HOST=127.0.0.1"

if /I "%~1"=="reinstall" (
    echo [*] Removing old virtual environment...
    if exist "%VENV%" rmdir /s /q "%VENV%"
) else if not "%~1"=="" (
    set "PORT=%~1"
)

echo.
echo  ==========================================================
echo     DermaAgents - Dermatology Diagnosis ^& Care Simulation
echo  ==========================================================
echo.

REM ---------- 1. Find a suitable Python (3.11 - 3.13) ----------
set "PY="
for %%V in (3.12 3.13 3.11) do (
    if not defined PY (
        py -%%V -c "import sys" >nul 2>&1 && set "PY=py -%%V"
    )
)
if not defined PY (
    python -c "import sys; sys.exit(0 if (3,11) <= sys.version_info[:2] <= (3,13) else 1)" >nul 2>&1 && set "PY=python"
)
if not defined PY (
    echo [X] Python 3.11, 3.12 or 3.13 was not found.
    echo     Install Python 3.12 from https://www.python.org/downloads/
    echo     and tick "Add python.exe to PATH" during setup, then run this file again.
    echo.
    pause
    exit /b 1
)
echo [OK] Using Python: %PY%

REM ---------- 2. Create virtual environment (first run) ----------
if not exist "%VENV%\Scripts\python.exe" (
    echo [*] Creating virtual environment in .venv ...
    %PY% -m venv "%VENV%"
    if errorlevel 1 (
        echo [X] Could not create the virtual environment.
        pause
        exit /b 1
    )
)
set "VPY=%VENV%\Scripts\python.exe"

REM ---------- 3. Install requirements (first run only) ----------
if not exist "%VENV%\.installed" (
    echo [*] Installing requirements - this can take a few minutes on first run...
    "%VPY%" -m pip install --upgrade pip
    "%VPY%" -m pip install -r "%ROOT%backend\requirements.txt"
    if errorlevel 1 (
        echo.
        echo [X] Installing requirements failed. Check your internet connection
        echo     and run:  run.bat reinstall
        pause
        exit /b 1
    )
    echo done> "%VENV%\.installed"
    echo [OK] Requirements installed.
) else (
    echo [OK] Requirements already installed.
)

REM ---------- 4. Check the prebuilt frontend ----------
if not exist "%ROOT%frontend\dist\index.html" (
    where node >nul 2>&1
    if errorlevel 1 (
        echo [!] frontend\dist is missing and Node.js is not installed.
        echo     The API will still run; the web pages will not.
    ) else (
        echo [*] Building frontend...
        pushd "%ROOT%frontend"
        call npm install
        call node build.mjs
        popd
    )
)

REM ---------- 5. Start server and open the browser ----------
echo.
echo  App      : http://%HOST%:%PORT%
echo  API docs : http://%HOST%:%PORT%/docs
echo  Press Ctrl+C to stop the server.
echo.
start "" /min cmd /c "ping -n 8 127.0.0.1 >nul & start "" http://%HOST%:%PORT%/"

cd /d "%ROOT%backend"
"%VPY%" -m uvicorn dermaagents.api.main:app --host %HOST% --port %PORT%

echo.
echo Server stopped.
pause
endlocal
