@echo off
chcp 65001 >nul
setlocal

echo ========================================
echo   Push dsh-memory-plugin to GitHub
echo ========================================
echo.

cd /d "%~dp0"
if errorlevel 1 (
    echo [ERROR] Failed to enter the repository directory.
    exit /b 1
)

git rev-parse --show-toplevel >nul 2>&1
if errorlevel 1 (
    echo [ERROR] This script must be run from a Git repository.
    exit /b 1
)

git remote get-url origin >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Git remote 'origin' is not configured.
    echo         Configure it with: git remote add origin ^<repository-url^>
    exit /b 1
)

echo Step 1: Staging changes...
git add -A
if errorlevel 1 (
    echo [ERROR] Failed to stage files.
    exit /b 1
)

git diff --cached --quiet
if not errorlevel 1 (
    echo [INFO] No changes to commit.
    exit /b 0
)

set "COMMIT_MESSAGE=%~1"
if not defined COMMIT_MESSAGE set "COMMIT_MESSAGE=chore: update dsh-memory-plugin"

echo Step 2: Creating commit...
git commit -m "%COMMIT_MESSAGE%"
if errorlevel 1 (
    echo [ERROR] Failed to create commit.
    exit /b 1
)

echo Step 3: Pushing current branch...
git push origin HEAD
if errorlevel 1 (
    echo [ERROR] Push failed. Check the remote URL, credentials, and network connection.
    exit /b 1
)

echo.
echo ========================================
echo   [SUCCESS] Code pushed to GitHub!
echo ========================================
endlocal
