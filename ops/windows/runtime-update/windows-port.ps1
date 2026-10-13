[CmdletBinding()]
param([Parameter(Mandatory=$true)][ValidateSet('inspect','stop','start','ready','receipt')][string]$Action,
      [Parameter(Mandatory=$true)][string]$PlanPath)
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
function No-Link([string]$path) {
 $cursor=[IO.Path]::GetFullPath($path)
 while($cursor){if((Test-Path -LiteralPath $cursor) -and ((Get-Item -LiteralPath $cursor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Linked maintenance path'};$cursor=[IO.Path]::GetDirectoryName($cursor)}
}
No-Link $PlanPath
$plan=Get-Content -LiteralPath $PlanPath -Raw -Encoding UTF8|ConvertFrom-Json
if([Security.Principal.WindowsIdentity]::GetCurrent().User.Value -cne $plan.sid){throw 'Maintenance user changed'}
foreach($path in @($plan.configPath,$plan.broker,$plan.previousCommand,$plan.candidateCommand)){No-Link $path}
function Hash([string]$path){(Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant()}
function Own-Task {
 $task=Get-ScheduledTask -TaskName 'CodexWebCompanionPersistent'
 $sid=if($task.Principal.UserId -like 'S-1-*'){$task.Principal.UserId}else{([Security.Principal.NTAccount]::new($task.Principal.UserId)).Translate([Security.Principal.SecurityIdentifier]).Value}
 if($sid -cne $plan.sid -or $task.Principal.RunLevel -ne 'Limited' -or $task.Principal.LogonType -ne 'Interactive' -or $task.Actions.Count -ne 1 -or $task.Actions[0].Execute -cne $plan.taskCommand -or $task.Actions[0].Arguments -cne $plan.taskArguments -or $task.Actions[0].WorkingDirectory -cne $plan.taskDirectory){throw 'Companion task identity changed'}
 return $task
}
function Snapshot {
 $task=Own-Task
 $all=@(Get-CimInstance Win32_Process)
 $brokers=@($all|Where-Object {$_.ExecutablePath -ceq $plan.broker})
 if($brokers.Count -gt 1){throw 'Multiple brokers'}
 foreach($broker in $brokers){if((Invoke-CimMethod -InputObject $broker -MethodName GetOwnerSid).Sid -cne $plan.sid){throw 'Broker owner changed'}}
 $children=@($all|Where-Object {$brokers.ProcessId -contains $_.ParentProcessId})
 $hash=Hash $plan.configPath
 $config=if($hash -ceq $plan.previousHash){'previous'}elseif($hash -ceq $plan.candidateHash){'candidate'}else{'unknown'}
 return @{config=$config;taskState=[string]$task.State;brokers=$brokers.Count;children=$children.Count;nativePaths=@($children|ForEach-Object {$_.ExecutablePath});brokerPids=@($brokers.ProcessId)}
}
switch($Action) {
 'inspect' {Snapshot|ConvertTo-Json -Compress;break}
 'stop' {
   $before=Snapshot
   if($before.children){throw 'Native child remains; refusing stop'}
   if($before.taskState -eq 'Running'){Stop-ScheduledTask -TaskName 'CodexWebCompanionPersistent'}
   $watch=[Diagnostics.Stopwatch]::StartNew()
   do {$current=Snapshot;if($current.brokers -eq 0 -and $current.taskState -eq 'Ready'){break};Start-Sleep -Milliseconds 250}while($watch.Elapsed.TotalSeconds -lt 15)
   if($current.brokers -ne 0 -or $current.taskState -ne 'Ready'){throw 'Broker stop unconfirmed'}
   '{"stopped":true}';break
 }
 'start' {
   $before=Snapshot
   if($before.taskState -eq 'Ready' -and $before.brokers -eq 0){Start-ScheduledTask -TaskName 'CodexWebCompanionPersistent'}
   elseif($before.taskState -ne 'Running'){throw 'Companion task unavailable'}
   '{"accepted":true}';break
 }
 'ready' {
   $watch=[Diagnostics.Stopwatch]::StartNew();$ok=$false
   do {
    $current=Snapshot
    if($current.brokers -eq 1){
     $pipe=[IO.Pipes.NamedPipeClientStream]::new('.','codex-web-persistent-'+$plan.sid,[IO.Pipes.PipeDirection]::InOut)
     try {$pipe.Connect(1000);$writer=[IO.StreamWriter]::new($pipe);$writer.AutoFlush=$true;$writer.WriteLine('PING');$reader=[IO.StreamReader]::new($pipe);$read=$reader.ReadLineAsync();$ok=$read.Wait(1000) -and $read.Result -ceq 'OK'}catch [TimeoutException]{}catch [IO.IOException]{}finally{$pipe.Dispose()}
    }
    if($ok){break};Start-Sleep -Milliseconds 250
   }while($watch.Elapsed.TotalSeconds -lt 12)
   @{ready=$ok}|ConvertTo-Json -Compress;break
 }
 'receipt' {
   $current=Snapshot
   if($current.config -notin @('previous','candidate') -or $current.children -ne 1){throw 'Runtime not verified'}
   $expected=if($current.config -eq 'candidate'){$plan.candidateCommand}else{$plan.previousCommand}
   if($current.nativePaths[0] -cne $expected){throw 'Wrong native executable'}
   No-Link $plan.workerJournal
   $journal=Get-Content -LiteralPath $plan.workerJournal -Raw -Encoding UTF8|ConvertFrom-Json
   if($journal.sid -cne $plan.sid -or $journal.release -cne $plan.workerRelease -or $journal.componentId -cne 'CodexWebCompanionPersistent'){throw 'Worker journal changed'}
   if($journal.configHash -notin @($plan.previousHash,$plan.candidateHash)){throw 'Worker config receipt changed'}
   $journal.configHash=Hash $plan.configPath;$journal.nativeLease=$plan.operationId
   $next=$plan.workerJournal+'.runtime-next';No-Link $next
   [IO.File]::WriteAllText($next,($journal|ConvertTo-Json -Depth 10),[Text.UTF8Encoding]::new($false))
   [IO.File]::Replace($next,$plan.workerJournal,[NullString]::Value)
   @{verified=$current.config}|ConvertTo-Json -Compress;break
 }
}
