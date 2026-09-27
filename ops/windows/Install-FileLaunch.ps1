[CmdletBinding()]
param([string]$NodeCommand=(Get-Command node.exe -ErrorAction Stop).Source)
$ErrorActionPreference='Stop'
$directory=Join-Path $env:LOCALAPPDATA 'CodexWeb\file-launch'
$taskName='CodexWebFileLaunch'
$existing=Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if($existing -and $existing.State -eq 'Running'){throw 'Launch helper is busy. Wait for active launch observation before updating.'}
$node=[IO.Path]::GetFullPath($NodeCommand)
if(-not(Test-Path -LiteralPath $node -PathType Leaf) -or $node -match '\\WindowsApps\\'){throw 'Use a stable Node runtime'}
New-Item -ItemType Directory -Path $directory -Force|Out-Null
if($existing){
 $backup=Join-Path $directory ('backups\'+[DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss'));New-Item -ItemType Directory -Path $backup -Force|Out-Null
 foreach($name in @('FileLaunchWorker.cjs','NativeFileLaunch.ps1','ExactFileLaunch.cs','Run-FileLaunch.ps1','config.json')){if(Test-Path -LiteralPath (Join-Path $directory $name)){Copy-Item -LiteralPath (Join-Path $directory $name) -Destination $backup}}
 Export-ScheduledTask -TaskName $taskName | Set-Content -LiteralPath (Join-Path $backup 'task.xml') -Encoding UTF8
}
$identity=[Security.Principal.WindowsIdentity]::GetCurrent();$acl=Get-Acl -LiteralPath $directory;$acl.SetAccessRuleProtection($true,$false)
foreach($rule in @($acl.Access)){$acl.RemoveAccessRuleSpecific($rule)}
foreach($sid in @($identity.User,[Security.Principal.SecurityIdentifier]::new('S-1-5-18'),[Security.Principal.SecurityIdentifier]::new('S-1-5-32-544'))){$acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($sid,'FullControl','ContainerInherit,ObjectInherit','None','Allow'))}
[IO.Directory]::SetAccessControl($directory,$acl)
foreach($name in @('FileLaunchWorker.cjs','NativeFileLaunch.ps1','ExactFileLaunch.cs','Run-FileLaunch.ps1')){Copy-Item -LiteralPath (Join-Path $PSScriptRoot $name) -Destination (Join-Path $directory $name) -Force}
[IO.File]::WriteAllText((Join-Path $directory 'config.json'),(@{node=$node}|ConvertTo-Json -Compress),[Text.UTF8Encoding]::new($false))
$action=New-ScheduledTaskAction -Execute (Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe') -Argument ('-NoLogo -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "'+(Join-Path $directory 'Run-FileLaunch.ps1')+'"') -WorkingDirectory $directory
$principal=New-ScheduledTaskPrincipal -UserId $identity.Name -LogonType Interactive -RunLevel Limited
$settings=New-ScheduledTaskSettingsSet -Hidden -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew
if($existing){$settings=$existing.Settings;$settings.ExecutionTimeLimit='PT0S';$principal=$existing.Principal}
Register-ScheduledTask -TaskName $taskName -Action $action -Principal $principal -Settings $settings -Description 'Explicit exact project file launches; private mailbox, interactive user, no listener.' -Force|Out-Null
Write-Output 'Private exact-file launch helper installed; existing receipts preserved.'
