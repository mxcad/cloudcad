@echo off
setlocal
REM CloudCAD offline pm2 entry
REM setlocal ensures PATH changes are isolated to this script session only

set "PM2_HOME=%~dp0offline-data\pm2"
set "PATH=%~dp0runtime\windows\node;%PATH%"
"%~dp0runtime\windows\node\node.exe" "%~dp0runtime\windows\node\node_modules\pm2\bin\pm2" %*
endlocal
