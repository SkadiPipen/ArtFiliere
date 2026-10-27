$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$stateDir = Join-Path $projectRoot '.local/blockchain'
New-Item -ItemType Directory -Force $stateDir | Out-Null
$pidPath = Join-Path $stateDir 'provenance-worker.pid'
if (Test-Path $pidPath) {
    $workerId = [int](Get-Content $pidPath)
    $existing = Get-CimInstance Win32_Process -Filter "ProcessId = $workerId" -ErrorAction SilentlyContinue
    if ($existing -and $existing.CommandLine -like '*process_provenance*') { Write-Output 'Provenance worker already running.'; exit 0 }
}
$python = Join-Path $projectRoot 'venv/Scripts/python.exe'
$worker = Start-Process $python -ArgumentList @('manage.py', 'process_provenance', '--watch') -WorkingDirectory (Join-Path $projectRoot 'backend') -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $stateDir 'provenance-worker.log') -RedirectStandardError (Join-Path $stateDir 'provenance-worker-error.log')
$worker.Id | Set-Content $pidPath
Write-Output "Provenance worker started (PID $($worker.Id))."
