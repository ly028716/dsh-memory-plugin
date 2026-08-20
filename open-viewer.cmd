@echo off
echo.
echo ========================================
echo   dsh-memory-plugin - Data Viewer
echo ========================================
echo.
echo Opening memory data viewer...
echo.

REM Open viewer HTML file
start "" "%~dp0viewer.html"

echo.
echo [OK] Viewer opened in browser!
echo.
echo Tips:
echo    - If you see "No data found", please use the plugin first to record some data
echo    - Data file location: .dsh-memory.json
echo    - Click "Refresh" button to reload data
echo.
pause
