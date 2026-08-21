@echo off
title 梦想网页CAD实时协同平台 命令行（离线 Node.js 环境）
cd /d "%~dp0"

REM 使用内嵌的离线 Node.js 运行时
set "NODE_DIR=%~dp0runtime\windows\node"
set "NODE_EXE=%NODE_DIR%\node.exe"

if not exist "%NODE_EXE%" (
    echo [错误] 找不到离线 Node.js: %NODE_EXE%
    echo 请确保 runtime\windows\node 目录包含 Node.js
    pause
    exit /b 1
)

REM 将离线 node 加入 PATH，并设置 PM2_HOME 到本项目（隔离系统 pm2）
set "PATH=%NODE_DIR%;%PATH%"
set "PM2_HOME=%~dp0data\pm2"

REM 禁用 Corepack 严格检查，支持离线部署
set COREPACK_ENABLE_STRICT=0

echo.
echo  ============================================================
echo   梦想网页CAD实时协同平台 命令行已就绪（离线 Node.js）
echo   Node:  %NODE_EXE%
echo   PATH:  已加入离线 node 目录
echo   PM2:   %PM2_HOME%
echo.
echo   在本窗口可执行:  node / npm / npx / pnpm / pm2 / cloudcad
echo   退出: 输入 exit
echo  ============================================================
echo.

cmd /k