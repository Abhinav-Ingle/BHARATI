@echo off
TITLE Bharati System Control Center


:MENU
CLS
echo ====================================================
echo      🌊 BHARATI SURVEILLANCE CONTROL CENTER
echo ====================================================
echo.
echo    [1] START SYSTEM   (Launch Backend and Frontend)
echo    [2] RESTART SYSTEM (Kill and Relaunch Everything)
echo    [3] STOP SYSTEM    (Kill All Processes and Exit)
echo.
echo ====================================================
set /p choice="Select an option (1-3): "

if "%choice%"=="1" goto START
if "%choice%"=="2" goto RESTART
if "%choice%"=="3" goto STOP
goto MENU

:START
CLS
echo [1/2] Launching Python Backend (AI Core)...
start "Bharati Backend" cmd /k "cd backend && python main.py"

timeout /t 3 /nobreak >nul

echo [2/2] Launching React Dashboard...
start "Bharati Frontend" cmd /k "cd frontend && npm start"

echo.
echo ✅ SYSTEM LAUNCHED! 
echo Press any key to return to menu...
pause >nul
goto MENU

:STOP
CLS
echo 🛑 STOPPING SYSTEM...
taskkill /IM python.exe /F >nul 2>&1
taskkill /IM node.exe /F >nul 2>&1
echo ✅ All processes stopped.
echo.
echo Press any key to exit...
pause >nul
exit

:RESTART
CLS
echo 🔄 RESTARTING SYSTEM...
echo [1/3] Killing old processes...
taskkill /IM python.exe /F >nul 2>&1
taskkill /IM node.exe /F >nul 2>&1

echo [2/3] Launching Backend...
start "Bharati Backend" cmd /k "cd backend && python main.py"
timeout /t 3 /nobreak >nul

echo [3/3] Launching Frontend...
start "Bharati Frontend" cmd /k "cd frontend && npm start"

echo.
echo ✅ RESTART COMPLETE!
echo Press any key to return to menu...
pause >nul
goto MENU