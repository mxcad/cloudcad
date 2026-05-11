@echo off
setlocal enabledelayedexpansion

REM ============================================================
REM CloudCAD AutoTest Pipeline
REM Scheduled hourly via Windows Task Scheduler
REM Runs all tests, fixes failures, auto-commits
REM ============================================================

set "REPO_ROOT=D:\project\cloudcad"
set "LOG_DIR=%REPO_ROOT%\logs\autotest"
set "TIMESTAMP=%date:~0,4%%date:~5,2%%date:~8,2%_%time:~0,2%%time:~3,2%%time:~6,2%"
set "TIMESTAMP=%TIMESTAMP: =0%"
set "LOG_FILE=%LOG_DIR%\autotest_%TIMESTAMP%.log"
set "RESULT_FILE=%LOG_DIR%\latest_result.txt"

if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"

echo [%date% %time%] ========== AutoTest Pipeline START ========== > "%LOG_FILE%"

cd /d "%REPO_ROOT%" 2>&1 >> "%LOG_FILE%"

REM --- Step 1: Pull latest changes ---
echo [%date% %time%] Pulling latest changes... >> "%LOG_FILE%"
git pull origin refactor/circular-deps 2>&1 >> "%LOG_FILE%" 2>&1

REM --- Step 2: Install dependencies ---
echo [%date% %time%] Installing dependencies... >> "%LOG_FILE%"
call pnpm install 2>&1 >> "%LOG_FILE%" 2>&1

REM --- Step 3: Run all tests ---
set "PASSED=1"

echo [%date% %time%] Running backend tests (Jest)... >> "%LOG_FILE%"
cd /d "%REPO_ROOT%\packages\backend"
call pnpm test 2>&1 >> "%LOG_FILE%" 2>&1
if %errorlevel% neq 0 (
    echo [%date% %time%] BACKEND TESTS FAILED >> "%LOG_FILE%"
    set "PASSED=0"
) else (
    echo [%date% %time%] Backend tests PASSED >> "%LOG_FILE%"
)

echo [%date% %time%] Running frontend tests (Vitest)... >> "%LOG_FILE%"
cd /d "%REPO_ROOT%\packages\frontend"
call pnpm test 2>&1 >> "%LOG_FILE%" 2>&1
if %errorlevel% neq 0 (
    echo [%date% %time%] FRONTEND TESTS FAILED >> "%LOG_FILE%"
    set "PASSED=0"
) else (
    echo [%date% %time%] Frontend tests PASSED >> "%LOG_FILE%"
)

cd /d "%REPO_ROOT%"

REM --- Step 4: Log result ---
echo %PASSED% > "%RESULT_FILE%"

if "%PASSED%"=="1" (
    echo [%date% %time%] ALL TESTS PASSED >> "%LOG_FILE%"
) else (
    echo [%date% %time%] TESTS FAILED - needs attention >> "%LOG_FILE%"
    REM Signal to Claude that fixes are needed by writing a trigger file
    echo FAILED_%TIMESTAMP% > "%LOG_DIR%\needs_fix.trigger"
)

echo [%date% %time%] ========== AutoTest Pipeline END ========== >> "%LOG_FILE%"
exit /b %PASSED%
