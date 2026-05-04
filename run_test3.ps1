$ErrorActionPreference = "Continue"
Set-Location "d:\project\cloudcad\packages\backend"
$output = & "d:\project\cloudcad\node_modules\.bin\jest.exe" "--passWithNoTests" "--verbose" 2>&1 | Out-String
$output | Out-File -FilePath "d:\project\cloudcad\jest_out.txt" -Encoding utf8
$exitCode = $LASTEXITCODE
"Exit code: $exitCode" | Out-File -FilePath "d:\project\cloudcad\jest_exit.txt" -Append
Write-Host "Done. Exit: $exitCode"
