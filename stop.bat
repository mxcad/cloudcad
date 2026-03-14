@echo off
title CloudCAD Stop Services

cd /d "%~dp0"

REM Use embedded Node.js
set "NODE_EXE=%~dp0runtime\windows\node\node.exe"

if not exist "%NODE_EXE%" (
    echo [Error] Node.js runtime not found: %NODE_EXE%
    echo Please ensure runtime\windows\node directory contains Node.js
    pause
    exit /b 1
)

echo Stopping CloudCAD services...
"%NODE_EXE%" runtime\scripts\cli.js stop
pause