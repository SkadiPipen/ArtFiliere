param([int]$Interval = 30)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$pythonPath = Join-Path $projectRoot 'venv\Scripts\python.exe'
$backendPath = Join-Path $projectRoot 'backend'
$logPath = Join-Path $projectRoot 'tmp'
if (!(Test-Path -LiteralPath $pythonPath)) { throw 'The project Python environment was not found.' }
New-Item -ItemType Directory -Path $logPath -Force | Out-Null
$existing = Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*manage.py process_shop_payments --watch*' -and $_.Name -like 'python*' }
if ($existing) { Write-Output 'Shop payment worker is already running.'; exit 0 }
$process = Start-Process -FilePath $pythonPath -ArgumentList @('-u', 'manage.py', 'process_shop_payments', '--watch', '--interval', [string][Math]::Max(10, $Interval)) -WorkingDirectory $backendPath -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $logPath 'shop-payment-worker.log') -RedirectStandardError (Join-Path $logPath 'shop-payment-worker-errors.log')
Write-Output "Shop payment worker started (PID $($process.Id))."
