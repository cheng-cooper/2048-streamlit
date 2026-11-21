@echo off
setlocal
cd /d "%~dp0"
if not exist "app.py" (
    echo app.py is missing. In File Explorer, right-click the ZIP and choose Extract All.
    echo Then open start.cmd from the extracted GameLeaderboard folder.
    pause
    exit /b 1
)
set "GAME_PYTHON=py"
if exist "%USERPROFILE%\venv\Scripts\python.exe" set "GAME_PYTHON=%USERPROFILE%\venv\Scripts\python.exe"
if exist ".venv\Scripts\python.exe" set "GAME_PYTHON=%CD%\.venv\Scripts\python.exe"
"%GAME_PYTHON%" -c "import flask" >nul 2>&1
if errorlevel 1 (
    echo Python or Flask is missing. See README.md for setup.
    pause
    exit /b 1
)
echo Open http://127.0.0.1:5050/ after Flask starts.
"%GAME_PYTHON%" -B app.py
if errorlevel 1 (
    echo Startup failed. Check the message above.
    pause
    exit /b 1
)
