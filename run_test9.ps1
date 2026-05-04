$ErrorActionPreference = "Continue"

$pinfo = New-Object System.Diagnostics.ProcessStartInfo
$pinfo.FileName = "cmd.exe"
$pinfo.Arguments = "/c cd /d d:\project\cloudcad\packages\backend ^&^& call node_modules\.bin\jest.CMD --passWithNoTests --verbose"
$pinfo.WorkingDirectory = "d:\project\cloudcad\packages\backend"
$pinfo.RedirectStandardOutput = $true
$pinfo.RedirectStandardError = $true
$pinfo.UseShellExecute = $false
$pinfo.CreateNoWindow = $true
$pinfo.StandardOutputEncoding = [System.Text.Encoding]::UTF8
$pinfo.StandardErrorEncoding = [System.Text.Encoding]::UTF8

$p = New-Object System.Diagnostics.Process
$p.StartInfo = $pinfo
$p.Start() | Out-Null

$stdout = $p.StandardOutput.ReadToEnd()
$stderr = $p.StandardError.ReadToEnd()
$p.WaitForExit()

$combined = "=== STDOUT ===`n" + $stdout + "`n=== STDERR ===`n" + $stderr + "`n=== EXIT: " + $p.ExitCode + " ==="
try {
    [System.IO.File]::WriteAllText("d:\project\cloudcad\jest_combined.txt", $combined)
} catch {
    Write-Host "Failed to write file: $_"
}
Write-Host "Done. Exit: $($p.ExitCode)"
Write-Host "STDOUT length: $($stdout.Length)"
Write-Host "STDERR: $stderr"
