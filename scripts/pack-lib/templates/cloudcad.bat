@echo off
title 梦想网页CAD实时协同平台 运维管理

REM 入口脚本位于 runtime\，部署根目录为其上一级
cd /d "%~dp0.."

REM 使用离线 Node.js
set "NODE_EXE=%~dp0windows\node\node.exe"

if not exist "%NODE_EXE%" (
    echo [错误] 离线 Node.js 不存在: %NODE_EXE%
    echo 请确保 runtime\windows\node 目录中有 Node.js
    pause
    exit /b 1
)

REM %* 透传子命令：无参=交互式菜单；带参=子命令（如 admin:reset-password）。
REM 与 cloudcad.sh 的 "$@" 对齐；pause 保留——恢复类命令输出的新密码需人工记录，
REM 窗口不应在结果显示后立即关闭。
"%NODE_EXE%" runtime\scripts\cli.js %*
pause
