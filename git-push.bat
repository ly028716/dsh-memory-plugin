@echo off
chcp 65001 >nul
echo ========================================
echo   Push dsh-memory-plugin to GitHub
echo ========================================
echo.

cd /d E:\IDEWorkplaces\DeepSeekHarness\dsh-memory-plugin

echo Step 1: Adding safe directory exception...
git config --global --add safe.directory E:/IDEWorkplaces/DeepSeekHarness/dsh-memory-plugin
if errorlevel 1 (
    echo [ERROR] Failed to add safe directory. Please run as administrator.
    pause
    exit /b 1
)
echo [OK] Safe directory added
echo.

echo Step 2: Adding files to git...
git add .
if errorlevel 1 (
    echo [ERROR] Failed to add files.
    pause
    exit /b 1
)
echo [OK] Files added
echo.

echo Step 3: Creating initial commit...
git commit -m "Initial commit: dsh-memory-plugin v1.0.0

- Intelligent memory system for DSH
- Track user preferences and tool usage  
- Provide personalized recommendations
- Complete documentation and examples
- Modern web UI viewer"
if errorlevel 1 (
    echo [ERROR] Failed to commit.
    pause
    exit /b 1
)
echo [OK] Commit created
echo.

echo Step 4: Setting branch name to main...
git branch -M main
echo [OK] Branch renamed to main
echo.

echo Step 5: Adding remote repository...
git remote add origin git@github.com:ly028716/dsh-memory-plugin.git
if errorlevel 1 (
    echo [INFO] Remote may already exist, continuing...
)
echo [OK] Remote added
echo.

echo Step 6: Pushing to GitHub...
git push -u origin main
if errorlevel 1 (
    echo.
    echo [ERROR] Push failed. Possible reasons:
    echo   - SSH key not configured
    echo   - Network connection issue
    echo   - Repository doesn't exist on GitHub
    echo.
    echo Please check your GitHub SSH configuration and try again.
    pause
    exit /b 1
)
echo.
echo ========================================
echo   [SUCCESS] Code pushed to GitHub!
echo ========================================
echo.
echo Repository: https://github.com/ly028716/dsh-memory-plugin
echo.
pause
