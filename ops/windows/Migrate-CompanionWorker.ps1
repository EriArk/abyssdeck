# Parameters are supplied by the signed Companion application, never by a URL.
# Demand tasks are never stopped. The persistent broker additionally requires the
# Hub's durable drain and a same-user process-tree idle check before replacement.
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
$folders=@{CodexWebDelivery='delivery';CodexWebProjectSetup='project-setup';CodexWebGitHubReleases='github-releases';CodexWebFileLaunch='file-launch';CodexWebGuiPreview='gui-preview'}
$native=$componentId -ceq 'CodexWebCompanionPersistent'
if($native){$folders[$componentId]='companion-persistent';if($nativeLease -notmatch '^[a-f0-9-]{36}$'){throw 'WORKER_HUB_LEASE_REQUIRED'}}
if(-not $folders.ContainsKey($componentId) -or [Security.Principal.WindowsIdentity]::GetCurrent().User.Value -cne $expectedSid){throw 'WORKER_IDENTITY_CHANGED'}
function No-Link([string]$name){
 $cursor=[IO.Path]::GetFullPath($name)
 while($cursor){if((Test-Path -LiteralPath $cursor) -and ((Get-Item -LiteralPath $cursor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'WORKER_LINK'};$cursor=[IO.Path]::GetDirectoryName($cursor)}
}
function Hash-Text([string]$value){$sha=[Security.Cryptography.SHA256]::Create();try {return ([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($value)))).Replace('-','').ToLowerInvariant()}finally{$sha.Dispose()}}
function Set-Enabled([xml]$document,[string]$value){
 $settings=$document.SelectSingleNode("/*[local-name()='Task']/*[local-name()='Settings']")
 if(-not $settings){throw 'WORKER_TASK_CHANGED'}
 $node=$settings.SelectSingleNode("*[local-name()='Enabled']")
 if(-not $node){$node=$document.CreateElement('Enabled',$settings.NamespaceURI);$settings.AppendChild($node)|Out-Null}
 $node.InnerText=$value
}
function Admission-Xml([string]$value){
 [xml]$document=$value
 $node=$document.SelectSingleNode("/*[local-name()='Task']/*[local-name()='Settings']/*[local-name()='Enabled']")
 if($node){$node.ParentNode.RemoveChild($node)|Out-Null}
 return $document.OuterXml
}
function Task-Xml {return Export-ScheduledTask -TaskName $componentId -ErrorAction Stop}
function Own-Task {
 $task=Get-ScheduledTask -TaskName $componentId -ErrorAction Stop
 $sid=if($task.Principal.UserId -like 'S-1-*'){$task.Principal.UserId}else{([Security.Principal.NTAccount]::new($task.Principal.UserId)).Translate([Security.Principal.SecurityIdentifier]).Value}
 if($sid -cne $expectedSid -or $task.Principal.LogonType -ne 'Interactive' -or $task.Principal.RunLevel -ne 'Limited' -or $task.Actions.Count -ne 1){throw 'WORKER_TASK_CHANGED'}
 return $task
}
function Save-Journal {
 $temp=$journalPath+'.next';No-Link $temp
 [IO.File]::WriteAllText($temp,($journal|ConvertTo-Json -Depth 5 -Compress),[Text.UTF8Encoding]::new($false))
 if(Test-Path -LiteralPath $journalPath){[IO.File]::Replace($temp,$journalPath,[NullString]::Value)}else{[IO.File]::Move($temp,$journalPath)}
}
function Reply([string]$state){[ordered]@{state=$state;componentId=$componentId;release=$releaseDigest}|ConvertTo-Json -Compress}
function Native-Idle {
 $all=@(Get-CimInstance Win32_Process -ErrorAction Stop)
 $brokers=@($all|Where-Object {$_.Name -eq 'CodexWebCompanion.exe' -and $_.ExecutablePath -and ($_.ExecutablePath -ceq (Join-Path $module 'CodexWebCompanion.exe') -or $_.ExecutablePath.StartsWith($releaseRoot.TrimEnd('\')+'\',[StringComparison]::OrdinalIgnoreCase))})
 if($brokers.Count -gt 1){throw 'WORKER_EXTRA_WRITER'}
 foreach($broker in $brokers){
  $owner=Invoke-CimMethod -InputObject $broker -MethodName GetOwnerSid -ErrorAction Stop
  if($owner.Sid -cne $expectedSid){throw 'WORKER_IDENTITY_CHANGED'}
  if(@($all|Where-Object {$_.ParentProcessId -eq $broker.ProcessId}).Count){return $false}
 }
 return $true
}
function Native-Ready {
 $running=@(Get-CimInstance Win32_Process -Filter "Name='CodexWebCompanion.exe'" -ErrorAction Stop|Where-Object {$_.ExecutablePath -ceq (Join-Path $releaseDirectory 'CodexWebCompanion.exe')})
 if($running.Count -ne 1){return $false}
 $owner=Invoke-CimMethod -InputObject $running[0] -MethodName GetOwnerSid -ErrorAction Stop
 if($owner.Sid -cne $expectedSid){return $false}
 $pipe=[IO.Pipes.NamedPipeClientStream]::new('.','codex-web-persistent-'+$expectedSid,[IO.Pipes.PipeDirection]::InOut)
   try {$pipe.Connect(3000);$writer=[IO.StreamWriter]::new($pipe);$writer.AutoFlush=$true;$writer.WriteLine('PING');$reader=[IO.StreamReader]::new($pipe);$reply=$reader.ReadLineAsync();if(-not $reply.Wait(3000)){return $false};return $reply.Result -ceq 'OK'}finally{$pipe.Dispose()}
}
$module=Join-Path $env:LOCALAPPDATA ('CodexWeb\'+$folders[$componentId])
$appDirectory=Join-Path $env:LOCALAPPDATA 'CodexWeb\companion-app'
$releaseRoot=Join-Path $appDirectory 'workers\releases'
$releaseDirectory=[IO.Path]::GetFullPath($releaseDirectory)
if($releaseDigest -notmatch '^[a-f0-9]{64}$' -or $releaseDirectory -cne (Join-Path $releaseRoot $releaseDigest)){throw 'WORKER_RELEASE_PATH'}
foreach($path in @($releaseDirectory,$module,$appDirectory)){No-Link $path}
$manifestPath=Join-Path $releaseDirectory 'worker.json'
if((Get-FileHash -LiteralPath $manifestPath -Algorithm SHA256).Hash.ToLowerInvariant() -cne $releaseDigest){throw 'WORKER_RELEASE_CHANGED'}
$manifest=Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8|ConvertFrom-Json
if($manifest.format -ne 1 -or $manifest.componentId -cne $componentId -or @($manifest.files.PSObject.Properties).Count -gt 16){throw 'WORKER_RELEASE_CHANGED'}
foreach($entry in $manifest.files.PSObject.Properties){
 if($entry.Name -notmatch '^[A-Za-z0-9_.-]+$' -or $entry.Value -notmatch '^[a-f0-9]{64}$'){throw 'WORKER_RELEASE_CHANGED'}
 $path=Join-Path $releaseDirectory $entry.Name;No-Link $path
 if((Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant() -cne $entry.Value){throw 'WORKER_RELEASE_CHANGED'}
}
$configPath=Join-Path $module 'config.json';No-Link $configPath
if((Get-FileHash -LiteralPath $configPath -Algorithm SHA256).Hash.ToLowerInvariant() -cne $expectedConfigHash){throw 'WORKER_CONFIG_CHANGED'}
$stateDirectory=Join-Path $appDirectory 'workers\state';No-Link $stateDirectory
New-Item -ItemType Directory -Path $stateDirectory -Force|Out-Null
$journalPath=Join-Path $stateDirectory ($componentId+'.json');No-Link $journalPath
$launcher=Join-Path $releaseDirectory 'Start-ManagedWorker.ps1'
$command=Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'
$arguments='-NoLogo -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "'+$launcher+'" -ComponentId '+$componentId
$mutex=[Threading.Mutex]::new($false,('Local\CodexWebRepair-'+$expectedSid+'-'+$componentId));$acquired=$false
try {
 try {$acquired=$mutex.WaitOne(0)}catch [Threading.AbandonedMutexException]{$acquired=$true}
 if(-not $acquired){Reply 'busy';return}
 $task=Own-Task
 $journal=$null
 if(Test-Path -LiteralPath $journalPath){
  if((Get-Item -LiteralPath $journalPath).Length -gt 65536){throw 'WORKER_JOURNAL_CHANGED'}
  $journal=Get-Content -LiteralPath $journalPath -Raw -Encoding UTF8|ConvertFrom-Json
  if($journal.sid -cne $expectedSid -or $journal.componentId -cne $componentId){throw 'WORKER_JOURNAL_CHANGED'}
  if($rollback){
   if($journal.release -cne $releaseDigest -or $journal.state -cne 'installed' -or (Hash-Text (Task-Xml)) -cne $journal.taskDigest){throw 'WORKER_ROLLBACK_CHANGED'}
   if($task.State -eq 'Running'){Reply 'busy';return}
   if($task.State -ne 'Ready'){throw 'WORKER_TASK_NOT_IDLE'}
   Disable-ScheduledTask -TaskName $componentId|Out-Null
   $task=Own-Task
   if($task.State -eq 'Running'){Enable-ScheduledTask -TaskName $componentId|Out-Null;Reply 'busy';return}
   Register-ScheduledTask -TaskName $componentId -Xml $journal.originalXml -Force|Out-Null
   $journal.state='rolledBack';Save-Journal;Reply 'rolledBack';return
  }
  if($journal.release -ceq $releaseDigest -and $journal.state -ceq 'rolledBack'){Reply 'rolledBack';return}
  # An accepted switch with a lost reply is observed, never performed twice.
  if($journal.release -ceq $releaseDigest -and $task.Actions[0].Execute -ceq $command -and $task.Actions[0].Arguments -ceq $arguments -and $task.Actions[0].WorkingDirectory -ceq $module){
   if($task.State -notin @('Ready','Running')){throw 'WORKER_TASK_NOT_READY'}
   if($native -and -not(Native-Ready)){throw 'WORKER_ACTIVATION_FAILED'}
   $journal.state='installed';$journal.taskDigest=Hash-Text (Task-Xml);Save-Journal;Reply 'installed';return
  }
  if($journal.state -in @('disabling','switching')){
   # Restore an interrupted admission change only if the entire XML still matches.
   $current=Task-Xml
   if((Admission-Xml $current) -ceq (Admission-Xml $journal.originalXml) -and $task.State -eq 'Disabled'){
    Register-ScheduledTask -TaskName $componentId -Xml $journal.originalXml -Force|Out-Null
    if($native){Start-ScheduledTask -TaskName $componentId}
    $journal.state='rolledBack';Save-Journal;Reply 'rolledBack';return
   }
   if((Hash-Text $current) -cne (Hash-Text $journal.originalXml)){throw 'WORKER_OUTCOME_UNKNOWN'}
  }
 }
 if($task.State -eq 'Running' -and (-not $native -or -not(Native-Idle))){Reply 'busy';return}
 if($task.State -notin @('Ready','Running')){Reply 'disabled';return}
 $original=Task-Xml
 if((Hash-Text $original) -cne $expectedTaskDigest){throw 'WORKER_TASK_CHANGED'}
 $previousExecutable=if($native -and $journal -and $journal.state -eq 'installed'){Join-Path $releaseRoot ($journal.release+'\CodexWebCompanion.exe')}else{$task.Actions[0].Execute}
 $journal=[ordered]@{format=1;sid=$expectedSid;componentId=$componentId;release=$releaseDigest;configHash=$expectedConfigHash;state='disabling';originalXml=$original;disabledDigest='';taskDigest='';previousExecutable=$previousExecutable;nativeLease=$nativeLease}
 # Save the exact expected disabled XML BEFORE changing admission (crash-safe).
 [xml]$disabled=$original;Set-Enabled $disabled 'false'
 # Exported XML serialization is normalized below after Disable. An interruption
 # between these operations must reconcile the known Enabled-only change.
 $journal.disabledDigest=Hash-Text $disabled.OuterXml;Save-Journal
 Disable-ScheduledTask -TaskName $componentId|Out-Null
 $task=Own-Task
 if((Admission-Xml (Task-Xml)) -cne (Admission-Xml $original)){throw 'WORKER_TASK_CHANGED'}
 $journal.disabledDigest=Hash-Text (Task-Xml);Save-Journal
 if($task.State -eq 'Running'){
  if($native -and (Native-Idle)){
   Stop-ScheduledTask -TaskName $componentId -ErrorAction Stop
   for($attempt=0;$attempt -lt 30 -and (Own-Task).State -eq 'Running';$attempt++){Start-Sleep -Milliseconds 100}
   $task=Own-Task
   if($task.State -eq 'Running'){throw 'WORKER_STOP_UNCONFIRMED'}
  }else{
  Register-ScheduledTask -TaskName $componentId -Xml $original -Force|Out-Null
  $journal.state='waitingIdle';Save-Journal;Reply 'busy';return
  }
 }
 if($task.State -ne 'Disabled'){throw 'WORKER_TASK_NOT_IDLE'}
 [xml]$next=$original
 $execNode=$next.SelectSingleNode("/*[local-name()='Task']/*[local-name()='Actions']/*[local-name()='Exec']")
 foreach($field in @(@('Command',$command),@('Arguments',$arguments),@('WorkingDirectory',$module))){
  $node=$execNode.SelectSingleNode("*[local-name()='"+$field[0]+"']")
  if(-not $node){$node=$next.CreateElement($field[0],$next.DocumentElement.NamespaceURI);$execNode.AppendChild($node)|Out-Null}
  $node.InnerText=[string]$field[1]
 }
 $journal.state='switching';Save-Journal
 try {
  if((Hash-Text (Task-Xml)) -cne $journal.disabledDigest -or (Get-FileHash -LiteralPath $configPath -Algorithm SHA256).Hash.ToLowerInvariant() -cne $expectedConfigHash){throw 'WORKER_TASK_CHANGED'}
  Register-ScheduledTask -TaskName $componentId -Xml $next.OuterXml -Force|Out-Null
  if($native){Start-ScheduledTask -TaskName $componentId;Start-Sleep -Milliseconds 500;if(-not(Native-Ready)){throw 'WORKER_ACTIVATION_FAILED'}}
  $task=Own-Task
  if($task.State -notin @('Ready','Running') -or $task.Actions[0].Execute -cne $command -or $task.Actions[0].Arguments -cne $arguments -or $task.Actions[0].WorkingDirectory -cne $module){throw 'WORKER_ACTIVATION_FAILED'}
  $journal.state='installed';$journal.taskDigest=Hash-Text (Task-Xml);Save-Journal;Reply 'installed'
 } catch {
  $task=Own-Task
  if($native -and $task.State -eq 'Running' -and (Native-Idle)){Stop-ScheduledTask -TaskName $componentId;Start-Sleep -Milliseconds 500;$task=Own-Task}
  if($task.State -ne 'Running' -and (($task.Actions[0].Execute -ceq $command -and $task.Actions[0].Arguments -ceq $arguments) -or (Hash-Text (Task-Xml)) -ceq $journal.disabledDigest)){
   Register-ScheduledTask -TaskName $componentId -Xml $original -Force|Out-Null
   if($native){Start-ScheduledTask -TaskName $componentId}
   $journal.state='rolledBack';Save-Journal
  }
  throw
 }
}finally{if($acquired){$mutex.ReleaseMutex()};$mutex.Dispose()}
