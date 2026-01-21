# Clean all console logs from frontend and backend
$frontendDir = "D:\web\MxCADOnline\cloudcad\packages\frontend"
$backendDir = "D:\web\MxCADOnline\cloudcad\packages\backend\src"

function Remove-ConsoleLogs {
    param(
        [string]$FilePath
    )
    
    if (-not (Test-Path $FilePath)) {
        Write-Host "File not found: $FilePath" -ForegroundColor Yellow
        return
    }
    
    $content = Get-Content -Path $FilePath -Raw -Encoding UTF8
    $originalLength = $content.Length
    
    # Remove single-line console.* statements
    $content = $content -replace '^\s*console\.(log|error|warn|info|debug)\([^)]*\);\s*$', ''
    
    # Remove multi-line console.* (match start)
    $content = $content -replace '(?m)^\s*console\.(log|error|warn|info|debug)\([^)]*\);\s*\n?', ''
    
    # Remove console.log blocks (match { to })
    $pattern = '(?s)console\.(log|error|warn|info|debug)\([^}]*\}\s*\);'
    $content = $content -replace $pattern, ''
    
    $newLength = $content.Length
    
    if ($originalLength -ne $newLength) {
        $content | Set-Content -Path $FilePath -Encoding UTF8 -NoNewline
        Write-Host "Cleaned: $FilePath" -ForegroundColor Green
        Write-Host "  Removed: $($originalLength - $newLength) chars" -ForegroundColor Gray
    }
}

# Get frontend files (exclude node_modules, dist, public)
$frontendFiles = Get-ChildItem -Path $frontendDir -Recurse -Include "*.ts", "*.tsx" | 
    Where-Object { $_.FullName -notlike "*node_modules*" -and $_.FullName -notlike "*dist*" -and $_.FullName -notlike "*public*" }

# Get backend files (exclude node_modules, dist)
$backendFiles = Get-ChildItem -Path $backendDir -Recurse -Include "*.ts" | 
    Where-Object { $_.FullName -notlike "*node_modules*" -and $_.FullName -notlike "*dist*" }

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Console Logs Cleaner" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "Frontend files: $($frontendFiles.Count)" -ForegroundColor White
Write-Host "Backend files: $($backendFiles.Count)" -ForegroundColor White
Write-Host ""

$allFiles = $frontendFiles + $backendFiles
$cleanedCount = 0

Write-Host "Starting cleanup..." -ForegroundColor White
Write-Host ""

foreach ($file in $allFiles) {
    $originalLength = (Get-Content -Path $file.FullName -Raw -Encoding UTF8).Length
    
    Remove-ConsoleLogs -FilePath $file.FullName
    
    $newLength = (Get-Content -Path $file.FullName -Raw -Encoding UTF8).Length
    if ($originalLength -ne $newLength) {
        $cleanedCount++
    }
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Cleanup completed! Files cleaned: $cleanedCount" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan