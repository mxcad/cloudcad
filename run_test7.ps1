[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Set-Location "d:\project\cloudcad\packages\backend"
$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = "cmd.exe"
$psi.Arguments = "/c `"d:\project\cloudcad\packages\backend\node_modules\.bin\jest.CMD`" --passWithNoTests --verbose > `"d:\project\cloudcad\jest_out.txt`" 2>&1"
$psi.UseShellExecute = $false
$psi.RedirectStandardOutput = $false
$psi.RedirectStandardError = $false
$psi.CreateNoWindow = $true
$proc = [System.Diagnostics.Process]::Start($psi)
$proc.WaitForExit()
$exitCode = $proc.ExitCode
"Exit code: $exitCode" | Out-File -FilePath "d:\project\cloudcad\jest_exit.txt" -Encoding utf8
Write-Host "Done. Exit: $exitCode"
