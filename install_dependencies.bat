@echo off
TITLE BHARATI - First Setup
echo ====================================================
echo      🔧 INSTALLING PROJECT DEPENDENCIES
echo ====================================================
echo.

:: 1. Install Backend Libraries
echo [1/2] Installing Python Libraries...
cd backend
call pip install -r requirements.txt
cd ..
echo ✅ Backend Ready.
echo.

:: 2. Install Frontend Libraries
echo [2/2] Installing React Modules (This may take a few minutes)...
cd frontend
call npm install
cd ..
echo ✅ Frontend Ready.

echo.
echo ====================================================
echo      🎉 INSTALLATION COMPLETE!
echo      You can now run 'start_system.bat'
echo ====================================================
pause