@echo off
setlocal
REM CloudCAD offline pm2 entry
REM PM2_HOME is set locally and won't affect system pm2

set "PM2_HOME=%~dp0..\..\data\pm2"
"%~dp0..\..\runtime\windows\node\node.exe" "%~dp0..\..\runtime\windows\node\node_modules\pm2\bin\pm2" %*
endlocal
