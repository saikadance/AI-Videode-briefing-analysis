@echo off
setlocal
chcp 65001 >nul

set "ROOT=%~dp0"
set "BACKEND_DIR=%ROOT%backend"
set "FRONTEND_DIR=%ROOT%frontend"
set "VENV_PYTHON=%BACKEND_DIR%\.venv\Scripts\python.exe"
set "VENV_PIP=%BACKEND_DIR%\.venv\Scripts\pip.exe"

echo ==========================================
echo   Bilibili Video Review Studio Launcher
echo ==========================================
echo.

if not exist "%BACKEND_DIR%\app\main.py" (
  echo [ERROR] Backend entry not found: "%BACKEND_DIR%\app\main.py"
  pause
  exit /b 1
)

if not exist "%FRONTEND_DIR%\package.json" (
  echo [ERROR] Frontend entry not found: "%FRONTEND_DIR%\package.json"
  pause
  exit /b 1
)

where python >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Python is not available in PATH.
  echo Please install Python first.
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo [ERROR] npm is not available in PATH.
  echo Please install Node.js first.
  pause
  exit /b 1
)

if not exist "%VENV_PYTHON%" (
  echo [INFO] Creating backend virtual environment...
  python -m venv "%BACKEND_DIR%\.venv"
  if errorlevel 1 (
    echo [ERROR] Failed to create virtual environment.
    pause
    exit /b 1
  )
)

if not exist "%VENV_PIP%" (
  echo [INFO] Installing pip into backend virtual environment...
  python -m pip --python "%VENV_PYTHON%" install pip
  if errorlevel 1 (
    echo [ERROR] Failed to install pip into the backend virtual environment.
    pause
    exit /b 1
  )
)

if not exist "%BACKEND_DIR%\.venv\.deps_installed" (
  echo [INFO] Installing backend dependencies...
  python -m pip --python "%VENV_PYTHON%" install -r "%BACKEND_DIR%\requirements.txt"
  if errorlevel 1 (
    echo [ERROR] Failed to install backend dependencies.
    pause
    exit /b 1
  )
  type nul > "%BACKEND_DIR%\.venv\.deps_installed"
)

if not exist "%FRONTEND_DIR%\node_modules" (
  echo [INFO] Installing frontend dependencies...
  pushd "%FRONTEND_DIR%"
  call npm install
  if errorlevel 1 (
    popd
    echo [ERROR] Failed to install frontend dependencies.
    pause
    exit /b 1
  )
  popd
)

echo [INFO] Building frontend...
pushd "%FRONTEND_DIR%"
call npm run build
if errorlevel 1 (
  popd
  echo [ERROR] Failed to build frontend.
  pause
  exit /b 1
)
popd

echo [INFO] Preparing browser...
powershell -WindowStyle Hidden -Command "Start-Sleep -Seconds 2; Start-Process 'http://127.0.0.1:8000'" >nul 2>nul

echo.
echo [INFO] Starting local web service...
echo [INFO] Keep this window open while using the tool.
echo [INFO] Close this window to stop the service.
echo.
cd /d "%BACKEND_DIR%"
"%VENV_PYTHON%" -m app.main
