param([int]$Interval = 60)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$pythonPath = Join-Path $projectRoot 'venv\Scripts\python.exe'
$backendPath = Join-Path $projectRoot 'backend'
$logPath = Join-Path $projectRoot 'tmp'
if (!(Test-Path -LiteralPath $pythonPath)) { throw 'The project Python virtual environment was not found.' }
New-Item -ItemType Directory -Path $logPath -Force | Out-Null
& (Join-Path $PSScriptRoot 'start-shop-payment-worker.ps1')
& (Join-Path $PSScriptRoot 'start-provenance-worker.ps1')
$existing = Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -eq $pythonPath -and $_.CommandLine -like '*process_commission_events*--watch*' }
if ($existing) { Write-Output "Commission worker already running (PID $($existing.ProcessId -join ', '))."; exit 0 }
$process = Start-Process -FilePath $pythonPath -ArgumentList @('-u', 'manage.py', 'process_commission_events', '--watch', '--record-proofs', '--interval', [string][Math]::Max(10, $Interval)) -WorkingDirectory $backendPath -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $logPath 'commission-worker.log') -RedirectStandardError (Join-Path $logPath 'commission-worker-errors.log')
Write-Output "Commission worker started (PID $($process.Id)). Logs: $logPath"
