@echo off
title CloudCAD 运维管理中心

cd /d "%~dp0"

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