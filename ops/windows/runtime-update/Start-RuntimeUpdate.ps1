[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$Directory)
$ErrorActionPreference='Stop'
$ErrorView='NormalView'
$base=Join-Path $env:LOCALAPPDATA 'CodexWeb\companion-persistent\updates\coordinator'
if([IO.Path]::GetFullPath($Directory) -cne [IO.Path]::GetFullPath($base)){throw 'Unexpected coordinator state directory'}
function No-Link([string]$path){$cursor=[IO.Path]::GetFullPath($path);while($cursor){if((Test-Path -LiteralPath $cursor) -and ((Get-Item -LiteralPath $cursor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Linked coordinator path'};$cursor=[IO.Path]::GetDirectoryName($cursor)}}
No-Link $base
$lock=$null
try {
 try {$lock=[IO.File]::Open((Join-Path $base 'coordinator.lock'),'OpenOrCreate','ReadWrite','None')}catch [IO.IOException]{exit 0}
 $active=Get-Content -LiteralPath (Join-Path $base 'active.json') -Raw -Encoding UTF8|ConvertFrom-Json
 $operation=[IO.Path]::GetFullPath($active.directory)
 if([IO.Path]::GetDirectoryName($operation) -cne (Join-Path $base 'operations') -or (Split-Path $operation -Leaf) -notmatch '^[a-f0-9-]{36}$'){throw 'Invalid operation directory'}
 No-Link $operation;No-Link $active.node
 $seal=Get-Content -LiteralPath (Join-Path $operation 'seal.json') -Raw -Encoding UTF8|ConvertFrom-Json
 if((Get-FileHash -LiteralPath (Join-Path $operation 'plan.json')).Hash.ToLowerInvariant() -cne $seal.plan){throw 'Plan changed'}
 foreach($entry in $seal.code.PSObject.Properties){if($entry.Name -notmatch '^[\w.-]+$' -or (Get-FileHash -LiteralPath (Join-Path $PSScriptRoot $entry.Name)).Hash.ToLowerInvariant() -cne $entry.Value){throw 'Coordinator changed'}}
 # Fail before acquire if manually launched under the native process/job tree.
 $all=@(Get-CimInstance Win32_Process);$cursorId=$PID;$ancestry=@();$seen=@{}
 while($cursorId -gt 0 -and -not $seen.ContainsKey($cursorId)){
  $seen[$cursorId]=$true;$p=$all|Where-Object ProcessId -EQ $cursorId|Select-Object -First 1
  if(-not $p){break};$ancestry+=@{pid=$p.ProcessId;name=$p.Name}
  if($p.Name -in @('codex.exe','codex-code-mode-host.exe','CodexWebCompanion.exe')){throw 'Coordinator must be launched by Task Scheduler, outside native Codex'}
  $cursorId=$p.ParentProcessId
 }
 $task=Get-ScheduledTask -TaskName 'CodexWebRuntimeUpdate'
 if($task.State -ne 'Running' -or $task.Actions.Count -ne 1 -or -not $task.Actions[0].Arguments.Contains($PSScriptRoot)){throw 'Independent scheduler identity not confirmed'}
 [IO.File]::WriteAllText((Join-Path $base 'host.json'),(@{pid=$PID;atUtc=[DateTime]::UtcNow.ToString('o');ancestry=$ancestry;independent=$true}|ConvertTo-Json -Depth 5),[Text.UTF8Encoding]::new($false))
 & $active.node (Join-Path $PSScriptRoot 'runner.mjs') $operation
 if($LASTEXITCODE -ne 0){throw 'Coordinator runner failed; next scheduled run reconciles durable state'}
} catch {
 [IO.File]::WriteAllText((Join-Path $base 'launcher-error.json'),(@{atUtc=[DateTime]::UtcNow.ToString('o');message=$_.Exception.Message}|ConvertTo-Json),[Text.UTF8Encoding]::new($false))
 exit 1
} finally {if($lock){$lock.Dispose()}}
