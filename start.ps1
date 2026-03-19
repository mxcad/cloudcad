# CloudCAD 启动脚本
# 自动检测部署模式或交互式模式

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptDir

# 禁用 Corepack 严格检查，支持离线部署
$env:COREPACK_ENABLE_STRICT = "0"

# 使用内嵌的 Node.js
$NODE_EXE = Join-Path $scriptDir "runtime\windows\node\node.exe"

if (-not (Test-Path $NODE_EXE)) {
    Write-Host "[错误] 找不到 Node.js 运行时: $NODE_EXE" -ForegroundColor Red
    Write-Host "请确保 runtime\windows\node 目录包含 Node.js"
    Read-Host "按回车键退出"
    exit 1
}

# 检测部署包标记文件
$deployMarker = Join-Path $scriptDir ".deploy"

if (Test-Path $deployMarker) {
    Write-Host "Starting CloudCAD (deploy mode)..." -ForegroundColor Cyan
    & $NODE_EXE runtime/scripts/cli.js deploy --skip-build
} else {
    & $NODE_EXE runtime/scripts/cli.js
}

Read-Host "按回车键退出"