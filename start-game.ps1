Set-Location "$PSScriptRoot"

function Stop-Port3000 {
    $lines = netstat -ano | Select-String ":3000\s+.*LISTENING"
    foreach ($line in $lines) {
        $pid_ = ($line.ToString().Trim() -split '\s+')[-1]
        if ($pid_ -match '^\d+$') {
            Stop-Process -Id $pid_ -Force -ErrorAction SilentlyContinue
        }
    }
}

# Kill stale process from previous run
Stop-Port3000

Write-Host ""
Write-Host "  IMPOSTOR GAME" -ForegroundColor Magenta
Write-Host "  Press Ctrl+C to stop" -ForegroundColor DarkGray
Write-Host ""

try {
    node server.js
} finally {
    Stop-Port3000
    Write-Host ""
    Write-Host "  Server stopped." -ForegroundColor Yellow
}
