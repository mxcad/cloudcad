$ErrorActionPreference = "Continue"

$nodeExe = "node"
$jestExe = "d:\project\cloudcad\packages\backend\node_modules\jest\bin\jest.js"

$pinfo = New-Object System.Diagnostics.ProcessStartInfo
$pinfo.FileName = $nodeExe
$pinfo.Arguments = "`"$jestExe`" --passWithNoTests --verbose"
$pinfo.WorkingDirectory = "d:\project\cloudcad\packages\backend"
$pinfo.RedirectStandardOutput = $true
$pinfo.RedirectStandardError = $true
$pinfo.UseShellExecute = $false
$pinfo.CreateNoWindow = $true
$pinfo.StandardOutputEncoding = [System.Text.Encoding]::UTF8
$pinfo.StandardErrorEncoding = [System.Text.Encoding]::UTF8
$pinfo.EnvironmentVariables["NODE_OPTIONS"] = ""

$p = New-Object System.Diagnostics.Process
$p.StartInfo = $pinfo
$p.Start() | Out-Null

$stdout = $p.StandardOutput.ReadToEnd()
$stderr = $p.StandardError.ReadToEnd()
$p.WaitForExit()

$combined = "=== STDOUT ===`n" + $stdout + "`n=== STDERR ===`n" + $stderr + "`n=== EXIT: " + $p.ExitCode + " ==="
try {
    [System.IO.File]::WriteAllText("d:\project\cloudcad\jest_combined.txt", $combined, [System.Text.Encoding]::UTF8)
} catch {
    Write-Host "Failed to write: $_"
}
Write-Host "Done. Exit: $($p.ExitCode)"
Write-Host "STDOUT chars: $($stdout.Length)"
