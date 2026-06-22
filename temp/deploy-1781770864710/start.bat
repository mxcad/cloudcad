@echo off
title CloudCAD 二维绘图协同系统

cd /d "%~dp0"

REM 禁用 Corepack 严格检查，支持离线部署
set COREPACK_ENABLE_STRICT=0

REM 使用内嵌的 Node.js
set "NODE_EXE=%~dp0runtime\windows\node\node.exe"

if not exist "%NODE_EXE%" (
    echo [错误] 找不到 Node.js 运行时: %NODE_EXE%
    echo 请确保 runtime\windows\node 目录包含 Node.js
    pause
    exit /b 1
)

REM 检测部署包标记文件
if exist ".deploy" (
    echo Starting CloudCAD ^(deploy mode^)...
    "%NODE_EXE%" runtime\scripts\cli.js deploy --skip-build
) else (
    "%NODE_EXE%" runtime\scripts\cli.js
)
pause