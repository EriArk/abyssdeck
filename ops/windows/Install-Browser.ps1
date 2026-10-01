[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$PackageDirectory,[string]$CodexCommand,[switch]$SkipMcpRegistration)
$ErrorActionPreference='Stop'
$package=(Resolve-Path -LiteralPath $PackageDirectory).Path
$manifest=Get-Content -Raw -LiteralPath (Join-Path $package 'release.json') | ConvertFrom-Json
if($manifest.release -notmatch '^[a-f0-9]{64}$'){throw 'Invalid browser package.'}
foreach($entry in $manifest.files.PSObject.Properties){
    if($entry.Name -notmatch '^[A-Za-z0-9_.-]+$' -or (Get-FileHash -LiteralPath (Join-Path $package $entry.Name)).Hash -ne $entry.Value){throw 'Browser package integrity failure.'}
}
$target=Join-Path $env:LOCALAPPDATA 'CodexWeb/browser'
$taskName='CodexWebBrowser'
$task=Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if($task -and $task.State -eq 'Running'){throw 'The browser host is running. Keep existing tabs; update it after closing browser work.'}
New-Item -ItemType Directory -Path $target -Force | Out-Null
$stamp=Get-Date -Format 'yyyyMMdd-HHmmss-fff'
$backup=Join-Path $target ('backup-'+$stamp)
New-Item -ItemType Directory -Path $backup | Out-Null
foreach($name in @('current.json','Start-Browser.ps1')){if(Test-Path -LiteralPath (Join-Path $target $name)){Copy-Item -LiteralPath (Join-Path $target $name) -Destination $backup}}
if($task){Export-ScheduledTask -TaskName $taskName | Set-Content -LiteralPath (Join-Path $backup 'task.xml') -Encoding UTF8}
$runtime=Join-Path $target ('runtime/'+$manifest.release)
if(-not(Test-Path -LiteralPath $runtime)){
    New-Item -ItemType Directory -Path $runtime -Force | Out-Null
    foreach($entry in $manifest.files.PSObject.Properties){Copy-Item -LiteralPath (Join-Path $package $entry.Name) -Destination $runtime}
}
foreach($entry in $manifest.files.PSObject.Properties){if((Get-FileHash -LiteralPath (Join-Path $runtime $entry.Name)).Hash -ne $entry.Value){throw 'Installed browser file mismatch.'}}
$user=[Security.Principal.WindowsIdentity]::GetCurrent().Name
$action=New-ScheduledTaskAction -Execute (Join-Path $runtime 'CodexWebBrowserHost.exe') -Argument '--server' -WorkingDirectory $runtime
$principal=New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
$trigger=New-ScheduledTaskTrigger -AtLogOn -User $user
$settings=New-ScheduledTaskSettingsSet -Hidden -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName $taskName -Action $action -Principal $principal -Trigger $trigger -Settings $settings -Description 'CodexWeb built-in WebView2 browser; private local pipe, independent of Codex writer.' -Force | Out-Null
Start-ScheduledTask -TaskName $taskName
$ready=$false
for($attempt=0;$attempt -lt 10;$attempt++){
    $proof=& (Join-Path $runtime 'CodexWebBrowser.exe') --probe
    if($LASTEXITCODE -eq 0 -and $proof){$ready=$true;break}
    Start-Sleep -Milliseconds 500
}
if(-not $ready){throw 'Browser did not become ready. MCP registration was not changed.'}
Copy-Item -LiteralPath (Join-Path $runtime 'Start-Browser.ps1') -Destination (Join-Path $target 'Start-Browser.ps1') -Force
$next=Join-Path $target 'current-next.json'
[IO.File]::WriteAllText($next,($manifest | ConvertTo-Json -Depth 4),[Text.UTF8Encoding]::new($false))
if(Test-Path -LiteralPath (Join-Path $target 'current.json')){[IO.File]::Replace($next,(Join-Path $target 'current.json'),(Join-Path $backup 'replaced.json'))}else{Move-Item -LiteralPath $next -Destination (Join-Path $target 'current.json')}
if(-not $SkipMcpRegistration){
    if(-not $CodexCommand){$CodexCommand=(Get-Content -Raw -LiteralPath (Join-Path $env:LOCALAPPDATA 'CodexWeb/companion-persistent/config.json') | ConvertFrom-Json).codexCommand}
    $codexRoot=if($env:CODEX_HOME){$env:CODEX_HOME}else{Join-Path $env:USERPROFILE '.codex'}
    $config=Join-Path $codexRoot 'config.toml'
    if(Test-Path -LiteralPath $config){Copy-Item -LiteralPath $config -Destination (Join-Path $backup 'config.toml')}
    $powershell=Join-Path $env:WINDIR 'System32/WindowsPowerShell/v1.0/powershell.exe'
    & $CodexCommand mcp add codexweb_browser --env "CODEXWEB_BROWSER_RELEASE=$($manifest.release)" -- $powershell -NoLogo -NoProfile -NonInteractive -File (Join-Path $target 'Start-Browser.ps1')
    if($LASTEXITCODE -ne 0){throw 'Browser installed but MCP registration failed.'}
}
$proof
