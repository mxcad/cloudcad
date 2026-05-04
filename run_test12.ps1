$ErrorActionPreference = "Continue"

$jestExe = "d:\project\cloudcad\packages\backend\node_modules\jest\bin\jest.js"
$workingDir = "d:\project\cloudcad\packages\backend"

$outputFile = "d:\project\cloudcad\jest_out.txt"

try {
    $p = Start-Process -FilePath "node" -ArgumentList "`"$jestExe`" --passWithNoTests --verbose" -WorkingDirectory $workingDir -NoNewWindow -Wait -PassThru -RedirectStandardOutput $outputFile
    Write-Host "Done. Exit: $($p.ExitCode)"
} catch {
    Write-Host "Error: $_"
}

if (Test-Path $outputFile) {
    $content = Get-Content $outputFile -Raw -Encoding UTF8
    Write-Host "=== JEST OUTPUT ==="
    Write-Host $content
    Write-Host "=== END ==="
} else {
    Write-Host "Output file not found"
}
