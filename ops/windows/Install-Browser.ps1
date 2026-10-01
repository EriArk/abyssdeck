[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$PackageDirectory,[string]$CodexCommand,[switch]$SkipMcpRegistration,[string]$ExpectedSid,[string]$ExpectedTaskDigest)
$ErrorActionPreference='Stop'
$sid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
if($ExpectedSid -and $ExpectedSid -cne $sid){throw 'BROWSER_IDENTITY_CHANGED'}
function No-Link([string]$path){for($p=[IO.Path]::GetFullPath($path);$p;$p=[IO.Path]::GetDirectoryName($p)){if((Test-Path -LiteralPath $p) -and ((Get-Item -LiteralPath $p -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'BROWSER_PATH_LINK'}}}
function Task-Digest { $sha=[Security.Cryptography.SHA256]::Create();try{([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes((Export-ScheduledTask -TaskName 'CodexWebBrowser'))))).Replace('-','').ToLowerInvariant()}finally{$sha.Dispose()} }
function Browser-Call([string]$name){
 $pipe=[IO.Pipes.NamedPipeClientStream]::new('.',('codex-web-browser-'+$sid),[IO.Pipes.PipeDirection]::InOut,[IO.Pipes.PipeOptions]::None,[Security.Principal.TokenImpersonationLevel]::Impersonation)
 try{$pipe.Connect(2000);$writer=[IO.StreamWriter]::new($pipe,[Text.UTF8Encoding]::new($false),4096,$true);$writer.AutoFlush=$true
 $writer.WriteLine((@{client=[Guid]::NewGuid().ToString('N');name=$name;arguments=@{}}|ConvertTo-Json -Compress))
 $reader=[IO.StreamReader]::new($pipe);$read=$reader.ReadLineAsync();if(-not $read.Wait(5000)){throw 'BROWSER_STATUS_TIMEOUT'}
 $result=$read.Result|ConvertFrom-Json;if($result.isError){throw 'BROWSER_STATUS_FAILED'};return ($result.content[0].text|ConvertFrom-Json)
 }finally{$pipe.Dispose()}
}
function Ensure-Mcp {
if(-not $SkipMcpRegistration){
    if(-not $CodexCommand){foreach($folder in @('companion-persistent','companion')){$path=Join-Path $env:LOCALAPPDATA ('CodexWeb/'+$folder+'/config.json');if(Test-Path -LiteralPath $path){$CodexCommand=(Get-Content -Raw -LiteralPath $path|ConvertFrom-Json).codexCommand;break}}}
    if(-not $CodexCommand -or -not(Test-Path -LiteralPath $CodexCommand)){throw 'BROWSER_CODEX_NOT_CONFIGURED'}
    $readOk=$false;try{$registered=& $CodexCommand mcp get codexweb_browser --json 2>$null;$readOk=$LASTEXITCODE -eq 0}catch{}
    if($readOk){try{$info=$registered|ConvertFrom-Json;if($info.enabled -eq $true -and (Join-Path $target 'Start-Browser.ps1') -cin @($info.transport.args)){return}}catch{}}
    $backup=Join-Path $target ('mcp-backup-'+[Guid]::NewGuid().ToString('N'));New-Item -ItemType Directory -Path $backup|Out-Null
    $codexRoot=if($env:CODEX_HOME){$env:CODEX_HOME}else{Join-Path $env:USERPROFILE '.codex'}
    $config=Join-Path $codexRoot 'config.toml'
    if(Test-Path -LiteralPath $config){Copy-Item -LiteralPath $config -Destination (Join-Path $backup 'config.toml')}
    $powershell=Join-Path $env:WINDIR 'System32/WindowsPowerShell/v1.0/powershell.exe'
    & $CodexCommand mcp add codexweb_browser --env "CODEXWEB_BROWSER_RELEASE=stable" -- $powershell -NoLogo -NoProfile -NonInteractive -File (Join-Path $target 'Start-Browser.ps1') | Out-Null
    if($LASTEXITCODE -ne 0){throw 'Browser installed but MCP registration failed.'}
}
}
function Reply([string]$state){@{state=$state;release=$manifest.release}|ConvertTo-Json -Compress}
$mutex=[Threading.Mutex]::new($false,('Local\CodexWebBrowserInstall-'+$sid));$acquired=$false
try{
try{$acquired=$mutex.WaitOne(0)}catch [Threading.AbandonedMutexException]{$acquired=$true}
if(-not $acquired){throw 'BROWSER_INSTALL_RUNNING'}
No-Link $PackageDirectory
$package=(Resolve-Path -LiteralPath $PackageDirectory).Path
$manifest=Get-Content -Raw -LiteralPath (Join-Path $package 'release.json') | ConvertFrom-Json
if($manifest.release -notmatch '^[a-f0-9]{64}$' -or @($manifest.files.PSObject.Properties).Count -ne 6){throw 'Invalid browser package.'}
foreach($entry in $manifest.files.PSObject.Properties){
    if($entry.Name -notmatch '^[A-Za-z0-9_.-]+$' -or (Get-FileHash -LiteralPath (Join-Path $package $entry.Name)).Hash -ne $entry.Value){throw 'Browser package integrity failure.'}
}
foreach($name in @('CodexWebBrowser.exe','CodexWebBrowserHost.exe','Start-Browser.ps1','WebView2Loader.dll','Microsoft.Web.WebView2.Core.dll','Microsoft.Web.WebView2.WinForms.dll')){if($name -notin @($manifest.files.PSObject.Properties.Name)){throw 'BROWSER_PACKAGE_INCOMPLETE'}}
$runtimeVersion='';try{$runtimeVersion=& (Join-Path $package 'CodexWebBrowser.exe') --runtime 2>$null}catch{}
if(-not $runtimeVersion){
 $winget=Get-Command winget.exe -ErrorAction SilentlyContinue
 if($winget){try{& $winget.Source install --id Microsoft.EdgeWebView2Runtime --exact --silent --accept-source-agreements --accept-package-agreements | Out-Null}catch{}}
 $runtimeVersion='';try{$runtimeVersion=& (Join-Path $package 'CodexWebBrowser.exe') --runtime 2>$null}catch{}
 if(-not $runtimeVersion){Reply 'needsRuntime';return}
}
$target=Join-Path $env:LOCALAPPDATA 'CodexWeb/browser'
No-Link $target
$sourceRelease=$manifest.release
try{$prior=Get-Content -LiteralPath (Join-Path $target 'current.json') -Raw|ConvertFrom-Json;if($prior.sourceRelease -ceq $sourceRelease -and $prior.release -match '^[a-f0-9]{64}$'){$manifest.release=$prior.release}}catch{}
$manifest|Add-Member -NotePropertyName sourceRelease -NotePropertyValue $sourceRelease -Force
$taskName='CodexWebBrowser'
$task=Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if($task){
 $principal=if($task.Principal.UserId -like 'S-1-*'){$task.Principal.UserId}else{([Security.Principal.NTAccount]::new($task.Principal.UserId)).Translate([Security.Principal.SecurityIdentifier]).Value}
 if($principal -cne $sid -or $task.Principal.LogonType -ne 'Interactive' -or $task.Principal.RunLevel -ne 'Limited' -or $task.Actions.Count -ne 1 -or -not $task.Actions[0].Execute.StartsWith($target.TrimEnd('\')+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'BROWSER_TASK_CHANGED'}
 if($ExpectedTaskDigest -and (Task-Digest) -cne $ExpectedTaskDigest){throw 'BROWSER_TASK_CHANGED'}
} elseif($ExpectedTaskDigest){throw 'BROWSER_TASK_DISAPPEARED'}
if($task -and $task.State -eq 'Running'){
 $current=$null;try{$current=Get-Content -LiteralPath (Join-Path $target 'current.json') -Raw|ConvertFrom-Json}catch{}
 $same=$current -and $current.release -ceq $manifest.release -and $task.Actions[0].Execute -ceq (Join-Path $target ('runtime/'+$manifest.release+'/CodexWebBrowserHost.exe'))
 if($same){foreach($entry in $manifest.files.PSObject.Properties){try{if((Get-FileHash -LiteralPath (Join-Path $target ('runtime/'+$manifest.release+'/'+$entry.Name))).Hash -ne $entry.Value){$same=$false}}catch{$same=$false}}}
 if($same){$health=Browser-Call 'status';if($health.ready -and $health.webViewVersion){Copy-Item -LiteralPath (Join-Path $package 'Start-Browser.ps1') -Destination (Join-Path $target 'Start-Browser.ps1') -Force;Ensure-Mcp;Reply 'installed';return}}
 try{$shutdown=Browser-Call 'shutdown_idle'}catch{Reply 'waitingIdle';return}
 if(-not $shutdown.stopped){Reply 'waitingIdle';return}
 for($attempt=0;$attempt -lt 20;$attempt++){Start-Sleep -Milliseconds 250;$task=Get-ScheduledTask -TaskName $taskName;if($task.State -ne 'Running'){break}}
 if($task.State -eq 'Running'){Reply 'waitingIdle';return}
}

New-Item -ItemType Directory -Path $target -Force | Out-Null
$stamp=Get-Date -Format 'yyyyMMdd-HHmmss-fff'
$backup=Join-Path $target ('backup-'+$stamp)
New-Item -ItemType Directory -Path $backup | Out-Null
foreach($name in @('current.json','Start-Browser.ps1')){if(Test-Path -LiteralPath (Join-Path $target $name)){Copy-Item -LiteralPath (Join-Path $target $name) -Destination $backup}}
if($task){Export-ScheduledTask -TaskName $taskName | Set-Content -LiteralPath (Join-Path $backup 'task.xml') -Encoding UTF8}
try {
$runtime=Join-Path $target ('runtime/'+$manifest.release)
No-Link $runtime
$damaged=$false
if(Test-Path -LiteralPath $runtime){foreach($entry in $manifest.files.PSObject.Properties){try{if((Get-FileHash -LiteralPath (Join-Path $runtime $entry.Name)).Hash -ne $entry.Value){$damaged=$true}}catch{$damaged=$true}}}
if($damaged){
 $sha=[Security.Cryptography.SHA256]::Create();try{$manifest.release=([BitConverter]::ToString($sha.ComputeHash([Guid]::NewGuid().ToByteArray()))).Replace('-','').ToLowerInvariant()}finally{$sha.Dispose()}
 $runtime=Join-Path $target ('runtime/'+$manifest.release)
}
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
    try{$health=Browser-Call 'status';if($health.ready -and $health.webViewVersion){$ready=$true;break}}catch{}
    Start-Sleep -Milliseconds 500
}
if(-not $ready){throw 'Browser did not become ready. MCP registration was not changed.'}
Copy-Item -LiteralPath (Join-Path $runtime 'Start-Browser.ps1') -Destination (Join-Path $target 'Start-Browser.ps1') -Force
$next=Join-Path $target 'current-next.json'
[IO.File]::WriteAllText($next,($manifest | ConvertTo-Json -Depth 4),[Text.UTF8Encoding]::new($false))
if(Test-Path -LiteralPath (Join-Path $target 'current.json')){[IO.File]::Replace($next,(Join-Path $target 'current.json'),(Join-Path $backup 'replaced.json'))}else{Move-Item -LiteralPath $next -Destination (Join-Path $target 'current.json')}
} catch {
 if(Test-Path -LiteralPath (Join-Path $backup 'task.xml')){
  $now=Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
  if($now -and $now.Actions[0].Execute -ceq (Join-Path $runtime 'CodexWebBrowserHost.exe')){
   if($now.State -eq 'Running'){try{$closed=Browser-Call 'shutdown_idle';if(-not $closed.stopped){throw 'BROWSER_ROLLBACK_WAITING'}}catch{throw 'BROWSER_ROLLBACK_WAITING'}}
   Register-ScheduledTask -TaskName $taskName -Xml (Get-Content -LiteralPath (Join-Path $backup 'task.xml') -Raw) -Force|Out-Null
   foreach($name in @('current.json','Start-Browser.ps1')){if(Test-Path -LiteralPath (Join-Path $backup $name)){Copy-Item -LiteralPath (Join-Path $backup $name) -Destination (Join-Path $target $name) -Force}}
   Start-ScheduledTask -TaskName $taskName
  }
 }
 throw
}
Ensure-Mcp
Reply 'installed'
}finally{if($acquired){$mutex.ReleaseMutex()};$mutex.Dispose()}
