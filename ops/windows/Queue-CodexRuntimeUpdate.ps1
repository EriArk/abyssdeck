# Install one owner-scoped durable coordinator. Never drain native work here.
[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$Version,
      [Parameter(Mandatory=$true)][ValidatePattern('^[A-Za-z0-9][A-Za-z0-9_.-]*$')][string]$HubSshTarget,
      [Parameter(Mandatory=$true)][ValidatePattern('^[A-Za-z0-9_-]+$')][string]$MachineId,
      [ValidatePattern('^[A-Za-z0-9_-]+$')][string]$EngineContainer='codex-web-engine')
$ErrorActionPreference='Stop'
$utf8=[Text.UTF8Encoding]::new($false)
$base=Join-Path $env:LOCALAPPDATA 'CodexWeb\companion-persistent\updates\coordinator'
function No-Link([string]$path){$cursor=[IO.Path]::GetFullPath($path);while($cursor){if((Test-Path -LiteralPath $cursor) -and ((Get-Item -LiteralPath $cursor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Linked update path'};$cursor=[IO.Path]::GetDirectoryName($cursor)}}
No-Link $base
New-Item -ItemType Directory -Path $base -Force|Out-Null
$lock=[IO.File]::Open((Join-Path $base 'coordinator.lock'),'OpenOrCreate','ReadWrite','None')
try {
 if(Test-Path (Join-Path $base 'active.json')){
  $prior=Get-Content (Join-Path $base 'active.json') -Raw -Encoding UTF8|ConvertFrom-Json
  $state=Get-Content (Join-Path $prior.directory 'state.json') -Raw -Encoding UTF8|ConvertFrom-Json
  if($state.phase -notin @('completed','rolledBack','cancelled')){throw 'Previous maintenance must finish or be explicitly recovered first'}
 }
 $candidate=& (Join-Path $PSScriptRoot 'Stage-CodexRuntime.ps1') -Version $Version
 $configPath=Join-Path $env:LOCALAPPDATA 'CodexWeb\companion-persistent\config.json';No-Link $configPath
 $oldBytes=[IO.File]::ReadAllBytes($configPath);$config=[Text.Encoding]::UTF8.GetString($oldBytes).TrimStart([char]0xFEFF)|ConvertFrom-Json
 if($config.codexCommand -ceq $candidate){throw 'This runtime is already selected; inspect live readiness instead'}
 $previousCommand=$config.codexCommand;No-Link $previousCommand
 $task=Get-ScheduledTask -TaskName 'CodexWebCompanionPersistent'
 $sid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
 $taskSid=if($task.Principal.UserId -like 'S-1-*'){$task.Principal.UserId}else{([Security.Principal.NTAccount]::new($task.Principal.UserId)).Translate([Security.Principal.SecurityIdentifier]).Value}
 if($taskSid -cne $sid -or $task.Principal.RunLevel -ne 'Limited' -or $task.Principal.LogonType -ne 'Interactive' -or $task.Actions.Count -ne 1){throw 'Unexpected worker task owner'}
 $journalPath=Join-Path $env:LOCALAPPDATA 'CodexWeb\companion-app\workers\state\CodexWebCompanionPersistent.json';No-Link $journalPath
 $journal=Get-Content $journalPath -Raw -Encoding UTF8|ConvertFrom-Json
 if($journal.sid -cne $sid -or $journal.state -cne 'installed' -or $journal.release -notmatch '^[a-f0-9]{64}$'){throw 'Unverified worker installation'}
 $broker=Join-Path $env:LOCALAPPDATA ('CodexWeb\companion-app\workers\releases\'+$journal.release+'\CodexWebCompanion.exe')
 $node=(Get-Command node.exe -ErrorAction Stop).Source;$ssh=(Get-Command ssh.exe -ErrorAction Stop).Source
 foreach($p in @($node,$ssh,$broker)){No-Link $p}
 $operationId=[Guid]::NewGuid().ToString()
 $directory=Join-Path $base ('operations\'+$operationId);New-Item -ItemType Directory -Path $directory -Force|Out-Null
 $codeFiles=@('coordinator.mjs','runner.mjs','hub-maintenance.mjs','windows-port.ps1','Start-RuntimeUpdate.ps1')
 $hashes=[ordered]@{};foreach($name in $codeFiles){$hashes[$name]=(Get-FileHash (Join-Path $PSScriptRoot ('runtime-update\'+$name))).Hash.ToLowerInvariant()}
 $manifest=$hashes|ConvertTo-Json -Compress
 $sha=[Security.Cryptography.SHA256]::Create();try{$codeHash=([BitConverter]::ToString($sha.ComputeHash($utf8.GetBytes($manifest)))).Replace('-','').ToLowerInvariant()}finally{$sha.Dispose()}
 $code=Join-Path $base ('releases\'+$codeHash);No-Link $code
 New-Item -ItemType Directory -Path $code -Force|Out-Null
 foreach($name in $codeFiles){$dest=Join-Path $code $name;if(-not(Test-Path $dest)){Copy-Item -LiteralPath (Join-Path $PSScriptRoot ('runtime-update\'+$name)) -Destination $dest};if((Get-FileHash $dest).Hash.ToLowerInvariant() -cne $hashes[$name]){throw 'Installed coordinator changed'}}
 $requestJson=@{operationId=$operationId;machineId=$MachineId;action='owner'}|ConvertTo-Json -Compress
 $encoded=[Convert]::ToBase64String($utf8.GetBytes($requestJson))
 $reply=Get-Content (Join-Path $code 'hub-maintenance.mjs') -Raw -Encoding UTF8|& $ssh -o BatchMode=yes -o ConnectTimeout=10 $HubSshTarget docker exec -i -e "ABYSS_RUNTIME_MAINTENANCE=$encoded" $EngineContainer node --input-type=module
 if($LASTEXITCODE -ne 0){throw 'Cannot identify the configured Hub owner'}
 $owner=($reply|ConvertFrom-Json).owner;if(-not $owner){throw 'Hub owner missing'}
 [IO.File]::WriteAllBytes((Join-Path $directory 'previous.json'),$oldBytes)
 $config.codexCommand=$candidate;[IO.File]::WriteAllText((Join-Path $directory 'candidate.json'),($config|ConvertTo-Json -Depth 30),$utf8)
 $candidateRoot=Split-Path (Split-Path $candidate)
 $plan=@{operationId=$operationId;sid=$sid;owner=$owner;machineId=$MachineId;sshTarget=$HubSshTarget;engineContainer=$EngineContainer;ssh=$ssh;powershell=(Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe');configPath=$configPath;previousCommand=$previousCommand;candidateCommand=$candidate;candidateRoot=$candidateRoot;previousHash=(Get-FileHash (Join-Path $directory 'previous.json')).Hash.ToLowerInvariant();candidateHash=(Get-FileHash (Join-Path $directory 'candidate.json')).Hash.ToLowerInvariant();previousExeHash=(Get-FileHash $previousCommand).Hash.ToLowerInvariant();receiptHash=(Get-FileHash (Join-Path $candidateRoot 'abyssdeck-package.json')).Hash.ToLowerInvariant();broker=$broker;workerJournal=$journalPath;workerRelease=$journal.release;taskCommand=$task.Actions[0].Execute;taskArguments=$task.Actions[0].Arguments;taskDirectory=$task.Actions[0].WorkingDirectory}
 [IO.File]::WriteAllText((Join-Path $directory 'plan.json'),($plan|ConvertTo-Json -Depth 5),$utf8)
 [IO.File]::WriteAllText((Join-Path $directory 'seal.json'),(@{plan=(Get-FileHash (Join-Path $directory 'plan.json')).Hash.ToLowerInvariant();code=$hashes}|ConvertTo-Json -Depth 4),$utf8)
 $now=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
 [IO.File]::WriteAllText((Join-Path $directory 'state.json'),(@{operationId=$operationId;phase='waitingIdle';fenced=$false;createdAt=$now;deadline=$now+14400000}|ConvertTo-Json),$utf8)
 $launcher=Join-Path $code 'Start-RuntimeUpdate.ps1'
 $arguments='-NoLogo -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "'+$launcher+'" -Directory "'+$base+'"'
 $action=New-ScheduledTaskAction -Execute $plan.powershell -Argument $arguments
 $triggers=@((New-ScheduledTaskTrigger -AtLogOn -User $sid),(New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 1)))
 $settings=New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 3) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
 $principal=New-ScheduledTaskPrincipal -UserId $sid -LogonType Interactive -RunLevel Limited
 $existing=Get-ScheduledTask -TaskName 'CodexWebRuntimeUpdate' -ErrorAction SilentlyContinue
 if($existing -and $existing.State -eq 'Running'){throw 'Coordinator already running'}
 if($existing){
  $existingSid=if($existing.Principal.UserId -like 'S-1-*'){$existing.Principal.UserId}else{([Security.Principal.NTAccount]::new($existing.Principal.UserId)).Translate([Security.Principal.SecurityIdentifier]).Value}
  if($existingSid -cne $sid -or $existing.Actions.Count -ne 1 -or -not $existing.Actions[0].Arguments.Contains($base+'\releases\')){throw 'Existing scheduler belongs to a different installation'}
 }
 [IO.File]::WriteAllText((Join-Path $base 'active.json.next'),(@{directory=$directory;node=$node;code=$code}|ConvertTo-Json),$utf8)
 if(Test-Path (Join-Path $base 'active.json')){[IO.File]::Replace((Join-Path $base 'active.json.next'),(Join-Path $base 'active.json'),[NullString]::Value)}else{[IO.File]::Move((Join-Path $base 'active.json.next'),(Join-Path $base 'active.json'))}
 Register-ScheduledTask -TaskName 'CodexWebRuntimeUpdate' -Action $action -Trigger $triggers -Settings $settings -Principal $principal -Description 'AbyssDeck: durable owner Codex runtime update and interrupted-operation recovery' -Force|Out-Null
 # Read back actual installation, then return. The current native process is
 # never the parent of the scheduled coordinator.
 $installed=Get-ScheduledTask -TaskName 'CodexWebRuntimeUpdate'
 if($installed.Actions[0].Arguments -cne $arguments -or $installed.Principal.RunLevel -ne 'Limited'){throw 'Scheduler registration not verified'}
 @{operationId=$operationId;statePath=(Join-Path $directory 'state.json');task='CodexWebRuntimeUpdate';prepared=$true}|ConvertTo-Json
} finally {$lock.Dispose()}
Start-ScheduledTask -TaskName 'CodexWebRuntimeUpdate'
