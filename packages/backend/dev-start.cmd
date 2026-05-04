@echo off
echo 🚀 Starting CloudCAD backend with offline node...
echo 📍 Working directory: %~dp0

"%~dp0..\..\runtime\windows\node\node.exe" "%~dp0..\..\node_modules\.pnpm\tsx@4.21.0\node_modules\tsx\dist\cli.mjs" "%~dp0src\main.ts"
