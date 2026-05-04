$ErrorActionPreference = "Continue"
Set-Location "d:\project\cloudcad\packages\backend"
$output = & "d:\project\cloudcad\packages\backend\node_modules\.bin\jest.CMD" "--passWithNoTests" "--verbose" 2>&1 
$output | Out-File -FilePath "d:\project\cloudcad\jest_out.txt" -Encoding utf8
$exitCode = $LASTEXITCODE
"Exit code: $exitCode" | Out-File -FilePath "d:\project\cloudcad\jest_exit.txt" -Encoding utf8
Write-Host "Done. Exit: $exitCode"
