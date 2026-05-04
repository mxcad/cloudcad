$ErrorActionPreference = "Continue"
Set-Location "d:\project\cloudcad\packages\backend"
$output = & "d:\project\cloudcad\packages\backend\node_modules\.bin\jest.CMD" "--passWithNoTests" "--verbose" 2>&1 
[System.IO.File]::WriteAllText("d:\project\cloudcad\jest_out.txt", ($output | Out-String))
$exitCode = $LASTEXITCODE
[System.IO.File]::AppendAllText("d:\project\cloudcad\jest_exit.txt", "Exit code: $exitCode`n")
Write-Host "Done. Exit: $exitCode"
