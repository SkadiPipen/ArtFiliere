$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
Set-Location $projectRoot
$toolDir = Join-Path $projectRoot 'tools/foundry'
$anvil = Join-Path $toolDir 'anvil.exe'
$forge = Join-Path $toolDir 'forge.exe'
if (-not (Test-Path $anvil) -or -not (Test-Path $forge)) {
    New-Item -ItemType Directory -Force $toolDir | Out-Null
    $baseUrl = 'https://github.com/foundry-rs/foundry/releases/download/v1.8.4/foundry_v1.8.4_win32_amd64'
    Invoke-WebRequest "$baseUrl.zip" -OutFile "$toolDir/foundry.zip"
    Invoke-WebRequest "$baseUrl.sha256" -OutFile "$toolDir/foundry.sha256"
    $expected = (Get-Content "$toolDir/foundry.sha256" -Raw).Split(' ')[0].Trim()
    if ((Get-FileHash "$toolDir/foundry.zip" -Algorithm SHA256).Hash.ToLower() -ne $expected.ToLower()) { throw 'Foundry checksum mismatch' }
    Expand-Archive "$toolDir/foundry.zip" $toolDir -Force
}
$stateDir = Join-Path $projectRoot '.local/blockchain'
New-Item -ItemType Directory -Force $stateDir | Out-Null
$rpc = 'http://127.0.0.1:8545'
function Test-LocalRpc {
    try {
        $response = Invoke-RestMethod $rpc -Method Post -ContentType 'application/json' -Body '{"jsonrpc":"2.0","id":1,"method":"web3_clientVersion","params":[]}' -TimeoutSec 2
        return [bool]$response.result
    } catch { return $false }
}
if (-not (Test-LocalRpc)) {
    $statePath = Join-Path $stateDir 'state.json'
    $nodeProcess = Start-Process $anvil -ArgumentList @('--host', '127.0.0.1', '--port', '8545', '--chain-id', '31337', '--state', ('"' + $statePath + '"'), '--state-interval', '1', '--silent') -WindowStyle Hidden -PassThru -RedirectStandardOutput "$stateDir/anvil.log" -RedirectStandardError "$stateDir/anvil-error.log"
    $nodeProcess.Id | Set-Content "$stateDir/anvil.pid"
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        if (Test-LocalRpc) { break }
        if ($nodeProcess.HasExited) { throw "Anvil exited. See $stateDir/anvil-error.log" }
        Start-Sleep -Milliseconds 500
    }
    if (-not (Test-LocalRpc)) { throw 'Anvil did not become ready.' }
}
& $forge build
if ($LASTEXITCODE -ne 0) { throw 'Contract compilation failed.' }
& "$projectRoot/venv/Scripts/python.exe" "$PSScriptRoot/local-blockchain.py"
if ($LASTEXITCODE -ne 0) { throw 'Local blockchain setup or verification failed.' }
