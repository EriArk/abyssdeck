# Optional independent GUI module. Does not stop or replace either Codex Companion.
[CmdletBinding()]
param([string]$CodexCommand, [switch]$SkipMcpRegistration)
$ErrorActionPreference = 'Stop'
$taskName = 'CodexWebComputerUse'
$target = Join-Path $env:LOCALAPPDATA 'CodexWeb\computer-use'
$source = Join-Path $PSScriptRoot 'computer-use\ComputerUse.cs'
$compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($task -and $task.State -eq 'Running') { throw 'The Computer Use module is running. Stop only its idle task before upgrading; leave the main Companions running.' }
if (-not $SkipMcpRegistration -and -not $CodexCommand) {
    $configPath = Join-Path $env:LOCALAPPDATA 'CodexWeb\companion-persistent\config.json'
    if (Test-Path -LiteralPath $configPath) { $CodexCommand = (Get-Content -Raw -LiteralPath $configPath | ConvertFrom-Json).codexCommand }
    else { $CodexCommand = (Get-Command codex.exe -ErrorAction Stop).Source }
}
if (-not $SkipMcpRegistration -and -not (Test-Path -LiteralPath $CodexCommand -PathType Leaf)) { throw 'Configured Codex executable is missing.' }
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
if (Test-Path -LiteralPath $target) {
    $backup = "$target.backup-$stamp"
    New-Item -ItemType Directory -Path $backup | Out-Null
    # Immutable runtime directories stay in place; keep only the previous pointer
    # and launcher here instead of recursively copying every previous release.
    foreach ($name in @('current.json','Start-ComputerUse.ps1','installed.json')) {
        $previous = Join-Path $target $name
        if (Test-Path -LiteralPath $previous) { Copy-Item -LiteralPath $previous -Destination (Join-Path $backup $name) }
    }
    if ($task) { Export-ScheduledTask -TaskName $taskName | Set-Content -LiteralPath (Join-Path $backup 'task.xml') -Encoding UTF8 }
}
New-Item -ItemType Directory -Force -Path $target | Out-Null
$sourceHash = (Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash.ToLowerInvariant()
$runtime = Join-Path $target ('runtime\' + $sourceHash)
if (-not (Test-Path -LiteralPath $runtime)) {
    $stage = Join-Path $target ('stage-' + [Guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $stage | Out-Null
    foreach ($build in @(@('exe','CodexWebComputerUse.exe'),@('winexe','CodexWebComputerUseHost.exe'))) {
        & $compiler /nologo "/target:$($build[0])" /platform:x64 /r:System.Web.Extensions.dll /r:System.Drawing.dll "/out:$(Join-Path $stage $build[1])" $source
        if ($LASTEXITCODE -ne 0) { throw 'Computer Use compilation failed; installed binaries were not replaced.' }
    }
    @{ clientSha256 = (Get-FileHash -LiteralPath (Join-Path $stage 'CodexWebComputerUse.exe')).Hash; serverSha256 = (Get-FileHash -LiteralPath (Join-Path $stage 'CodexWebComputerUseHost.exe')).Hash } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $stage 'hashes.json') -Encoding UTF8
    New-Item -ItemType Directory -Path (Join-Path $target 'runtime') -Force | Out-Null
    Move-Item -LiteralPath $stage -Destination $runtime
}
$client = Join-Path $runtime 'CodexWebComputerUse.exe'
$server = Join-Path $runtime 'CodexWebComputerUseHost.exe'
$hashes = Get-Content -Raw -LiteralPath (Join-Path $runtime 'hashes.json') | ConvertFrom-Json
$clientHash = $hashes.clientSha256
$serverHash = $hashes.serverSha256
if ((Get-FileHash -LiteralPath $client).Hash -ne $clientHash -or (Get-FileHash -LiteralPath $server).Hash -ne $serverHash) { throw 'Installed binary hash mismatch.' }
$user = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$action = New-ScheduledTaskAction -Execute $server -Argument '--server' -WorkingDirectory $target
$principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $user
$settings = New-ScheduledTaskSettingsSet -Hidden -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval ([TimeSpan]::FromMinutes(1)) -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName $taskName -Action $action -Principal $principal -Trigger $trigger -Settings $settings -Description 'Private same-user Computer Use through local named pipe; no network listener or desktop Codex dependency.' -Force | Out-Null
Start-ScheduledTask -TaskName $taskName
& $client --probe
if ($LASTEXITCODE -ne 0) { throw 'Interactive Computer Use task did not start. MCP was not registered.' }
$launcher = Join-Path $target 'Start-ComputerUse.ps1'
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'computer-use\Start-ComputerUse.ps1') -Destination $launcher -Force
$pointer = Join-Path $target 'current.json'
$pointerNext = Join-Path $target 'current-next.json'
[IO.File]::WriteAllText($pointerNext,(@{release=$sourceHash;clientSha256=$clientHash;serverSha256=$serverHash} | ConvertTo-Json),[Text.UTF8Encoding]::new($false))
if (Test-Path -LiteralPath $pointer) {
    # Windows PowerShell binds $null to an empty string for this overload,
    # which makes File.Replace reject a repeat installation. Use a real backup.
    [IO.File]::Replace($pointerNext,$pointer,(Join-Path $backup 'current-replaced.json'))
} else { Move-Item -LiteralPath $pointerNext -Destination $pointer }
if (-not $SkipMcpRegistration) {
    $codexRoot = if ($env:CODEX_HOME) { $env:CODEX_HOME } else { Join-Path $env:USERPROFILE '.codex' }
    $mcpConfig = Join-Path $codexRoot 'config.toml'
    if (Test-Path -LiteralPath $mcpConfig) { Copy-Item -LiteralPath $mcpConfig -Destination (Join-Path $codexRoot "config.toml.before-computer-use-$stamp") }
    $windowsPowerShell = Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'
    # The stable launcher path does not change between releases. Include the
    # non-secret release fingerprint so a native MCP reload sees the upgrade.
    & $CodexCommand mcp add codexweb_computer_use --env "CODEXWEB_COMPUTER_USE_RELEASE=$sourceHash" -- $windowsPowerShell -NoLogo -NoProfile -NonInteractive -File $launcher
    if ($LASTEXITCODE -ne 0) { throw 'Module is installed, but MCP registration failed.' }
}
@{ task = $taskName; clientSha256 = $clientHash; serverSha256 = $serverHash; sourceSha256 = $sourceHash } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $target 'installed.json') -Encoding UTF8
Get-ScheduledTask -TaskName $taskName | Select-Object TaskName, State
