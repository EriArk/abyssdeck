# Fault injection against the real migration script, with isolated task fixtures.
# No installed task is read or changed.
$ErrorActionPreference='Stop'
$originalLocal=$env:LOCALAPPDATA
$fixtureRoot=Join-Path $env:TEMP ('cw-worker-fixture-'+[Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $fixtureRoot|Out-Null
$env:LOCALAPPDATA=$fixtureRoot
$componentId='CodexWebDelivery';$expectedSid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$rollback=$false;$nativeLease=''
$script:effects=0;$script:race=$false;$script:failOnce=$false
$code=[IO.File]::ReadAllText((Join-Path $PSScriptRoot '../ops/windows/Migrate-CompanionWorker.ps1'))
function Digest([string]$text){$sha=[Security.Cryptography.SHA256]::Create();try{return ([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($text)))).Replace('-','').ToLowerInvariant()}finally{$sha.Dispose()}}
function Get-ScheduledTask {param($TaskName,$ErrorAction)
 [xml]$data=$script:xml
 [pscustomobject]@{State=$(if($script:race){'Running'}elseif($data.Task.Settings.Enabled -eq 'false'){'Disabled'}else{'Ready'});Principal=[pscustomobject]@{UserId=$expectedSid;LogonType='Interactive';RunLevel='Limited'};Actions=@([pscustomobject]@{Execute=[string]$data.Task.Actions.Exec.Command;Arguments=[string]$data.Task.Actions.Exec.Arguments;WorkingDirectory=[string]$data.Task.Actions.Exec.WorkingDirectory})}
}
function Export-ScheduledTask {param($TaskName,$ErrorAction) $script:xml}
function Disable-ScheduledTask {param($TaskName)
 if($script:xml -notmatch '<Enabled>'){$script:xml=$script:xml.Replace('<Settings>','<Settings><Enabled>false</Enabled>')}else{[xml]$data=$script:xml;$data.Task.Settings.Enabled='false';$script:xml=$data.OuterXml};$script:effects++
}
function Enable-ScheduledTask {param($TaskName)
 [xml]$data=$script:xml;$data.Task.Settings.Enabled='true';$script:xml=$data.OuterXml;$script:effects++
}
function Register-ScheduledTask {param($TaskName,$Xml,[switch]$Force)
 if($script:failOnce -and $Xml.Contains('Start-ManagedWorker')){$script:failOnce=$false;throw 'INJECTED_ACTIVATION_FAILURE'}
 $script:xml=([xml]$Xml).OuterXml;$script:effects++
}
function Stop-ScheduledTask {throw 'TEST_MUST_NOT_STOP_WORK'}
try {
 $module=Join-Path $fixtureRoot 'CodexWeb\delivery';New-Item -ItemType Directory -Path $module -Force|Out-Null
 $config=Join-Path $module 'config.json';[IO.File]::WriteAllText($config,'{"node":"fixture-runtime","private":"preserve"}')
 $expectedConfigHash=(Get-FileHash -LiteralPath $config -Algorithm SHA256).Hash.ToLowerInvariant()
 $receipts=Join-Path $module 'accepted-receipt.json';[IO.File]::WriteAllText($receipts,'{"accepted":true,"id":"do-not-replay"}')
 $receiptHash=(Get-FileHash -LiteralPath $receipts).Hash
 $bytes='fixture reviewed launcher'
 $manifest=@{format=1;componentId=$componentId;files=@{'Start-ManagedWorker.ps1'=(Digest $bytes)}}|ConvertTo-Json -Compress
 $releaseDigest=Digest $manifest
 $releaseDirectory=Join-Path $fixtureRoot ('CodexWeb\companion-app\workers\releases\'+$releaseDigest)
 New-Item -ItemType Directory -Path $releaseDirectory -Force|Out-Null
 [IO.File]::WriteAllText((Join-Path $releaseDirectory 'worker.json'),$manifest,[Text.UTF8Encoding]::new($false))
 [IO.File]::WriteAllText((Join-Path $releaseDirectory 'Start-ManagedWorker.ps1'),$bytes,[Text.UTF8Encoding]::new($false))
 $script:xml='<Task xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task"><RegistrationInfo><Description>keep fixture description</Description></RegistrationInfo><Settings><MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy></Settings><Actions><Exec><Command>fixture.exe</Command><Arguments>original</Arguments><WorkingDirectory>fixture</WorkingDirectory></Exec></Actions></Task>'
 $original=$script:xml;$expectedTaskDigest=Digest $script:xml
 $reply=(& ([scriptblock]::Create($code)))|ConvertFrom-Json
 if($reply.state -ne 'installed' -or $script:effects -ne 2){throw 'Migration did not switch exactly once'}
 if($script:xml -notmatch 'keep fixture description' -or $script:xml -notmatch 'IgnoreNew'){throw 'Unrelated task settings changed'}
 'PASS demand worker admission handles omitted default Enabled and preserves task policy and state'
 $expectedTaskDigest=Digest $script:xml
 & ([scriptblock]::Create($code))|Out-Null
 if($script:effects -ne 2){throw 'Accepted switch replayed'}
 'PASS lost migration reply reconciles without repeating task effects'
 $rollback=$true
 $reply=(& ([scriptblock]::Create($code)))|ConvertFrom-Json
 if($reply.state -ne 'rolledBack' -or $script:xml -cne $original){throw 'Rollback did not restore exact XML'}
 'PASS explicit rollback restores the exact previous task'
 $rollback=$false;$expectedTaskDigest=Digest $script:xml
 & ([scriptblock]::Create($code))|Out-Null
 if($script:xml -cne $original){throw 'Automatic updater reinstalled a rejected release'}
 'PASS rolled-back release stays paused instead of installing in a loop'
 $journal=Join-Path $fixtureRoot ('CodexWeb\companion-app\workers\state\'+$componentId+'.json')
 Remove-Item -LiteralPath $journal
 $script:race=$true
 $reply=(& ([scriptblock]::Create($code)))|ConvertFrom-Json
 if($reply.state -ne 'busy' -or $script:xml -cne $original){throw 'Busy task changed'}
 'PASS active demand work is never stopped or rewritten'
 $script:race=$false;$script:failOnce=$true
 try{& ([scriptblock]::Create($code))|Out-Null;throw 'Fault was not injected'}catch{if($_.Exception.Message -notmatch 'INJECTED_ACTIVATION_FAILURE'){throw}}
 if($script:xml -cne $original){throw 'Automatic rollback did not restore original'}
 'PASS failed activation rolls back without disturbing receipts'
 if((Get-FileHash -LiteralPath $receipts).Hash -cne $receiptHash -or (Get-FileHash -LiteralPath $config).Hash.ToLowerInvariant() -cne $expectedConfigHash){throw 'Private state changed'}
 [IO.File]::WriteAllText($config,'changed by user')
 $before=$script:effects
 try{& ([scriptblock]::Create($code))|Out-Null;throw 'Config race accepted'}catch{if($_.Exception.Message -notmatch 'WORKER_CONFIG_CHANGED'){throw}}
 if($script:effects -ne $before){throw 'Changed config caused a task effect'}
 'PASS config fingerprint race refuses mutation; accepted receipts remain exact'
}finally{
 $env:LOCALAPPDATA=$originalLocal
 $resolved=[IO.Path]::GetFullPath($fixtureRoot)
 if(-not $resolved.StartsWith([IO.Path]::GetFullPath($env:TEMP)+'\',[StringComparison]::OrdinalIgnoreCase) -or (Split-Path -Leaf $resolved) -notlike 'cw-worker-fixture-*'){throw 'Unsafe fixture cleanup'}
 Remove-Item -LiteralPath $resolved -Recurse -Force
}
