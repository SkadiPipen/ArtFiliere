$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$backendRoot = Join-Path $projectRoot 'backend'
$pythonPath = Join-Path $backendRoot '.venv\Scripts\python.exe'
$runtimePath = Join-Path $projectRoot 'tmp\royalty-worker'
New-Item -ItemType Directory -Force -Path $runtimePath | Out-Null
$pidPath = Join-Path $runtimePath 'worker.pid'
if (Test-Path -LiteralPath $pidPath) {
    $savedPid = [int](Get-Content -LiteralPath $pidPath)
    $existingWorker = Get-CimInstance Win32_Process -Filter "ProcessId = $savedPid" -ErrorAction SilentlyContinue
    if ($existingWorker -and $existingWorker.CommandLine -match 'manage.py.*process_royalties.*--watch') {
        Write-Output "Royalty worker already running (PID $savedPid)."
        exit 0
    }
}
$worker = Start-Process -FilePath $pythonPath -ArgumentList @('-u', 'manage.py', 'process_royalties', '--watch', '--interval', '60') -WorkingDirectory $backendRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $runtimePath 'worker.log') -RedirectStandardError (Join-Path $runtimePath 'worker-error.log') -PassThru
Set-Content -LiteralPath $pidPath -Value $worker.Id
Write-Output "Royalty worker started (PID $($worker.Id))."
