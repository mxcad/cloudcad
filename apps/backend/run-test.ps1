$ErrorActionPreference = "Continue"
$jestCmd = "node_modules\jest\bin\jest.js"
$configPath = "test\jest-simple.json"
$outputFile = "test-result-output.txt"

try {
    Write-Host "Starting Jest tests..."
    $result = & node $jestCmd --config $configPath --verbose --forceExit 2>&1
    $result | Out-File -FilePath $outputFile -Encoding UTF8
    Write-Host "Tests completed. Result saved to $outputFile"
    $result
} catch {
    Write-Host "Error running tests: $_"
    "ERROR: $_" | Out-File -FilePath $outputFile -Encoding UTF8
}
