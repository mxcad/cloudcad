# CloudCAD 停止脚本

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptDir

# 使用内嵌的 Node.js
$NODE_EXE = Join-Path $scriptDir "runtime\windows\node\node.exe"

if (-not (Test-Path $NODE_EXE)) {
    Write-Host "[错误] 找不到 Node.js 运行时: $NODE_EXE" -ForegroundColor Red
    Write-Host "请确保 runtime\windows\node 目录包含 Node.js"
    Read-Host "按回车键退出"
    exit 1
}

Write-Host "Stopping CloudCAD services..." -ForegroundColor Cyan
& $NODE_EXE runtime/scripts/cli.js stop

Read-Host "按回车键退出"