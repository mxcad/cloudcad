@echo off
title CloudCAD 运维管理

cd /d "%~dp0"

REM 使用离线 Node.js
set "NODE_EXE=%~dp0runtime\windows\node\node.exe"

if not exist "%NODE_EXE%" (
    echo [错误] 离线 Node.js 不存在: %NODE_EXE%
    echo 请确保 runtime\windows\node 目录中有 Node.js
    pause
    exit /b 1
)

"%NODE_EXE%" runtime\scripts\cli.js
pause
