# Exercise the production readiness wait independently of installed tasks/pipes.
$ErrorActionPreference='Stop'
$path=Join-Path $PSScriptRoot '../ops/windows/Migrate-CompanionWorker.ps1'
$tokens=$null;$errors=$null
$ast=[Management.Automation.Language.Parser]::ParseFile($path,[ref]$tokens,[ref]$errors)
if($errors.Count){throw 'Migration script did not parse'}
$function=$ast.Find({param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'Wait-NativeReady'},$true)
. ([scriptblock]::Create($function.Extent.Text))
$script:checks=0;$script:readyAfter=3;$script:taskState='Running';$script:identityChanged=$false
function Native-Ready {
 $script:checks++
 if($script:identityChanged){throw 'WORKER_IDENTITY_CHANGED'}
 return $script:checks -ge $script:readyAfter
}
function Own-Task {[pscustomobject]@{State=$script:taskState}}
function Start-ScheduledTask {throw 'Readiness must not repeat a task start'}
function Stop-ScheduledTask {throw 'Readiness must not stop a process'}
if(-not(Wait-NativeReady -TimeoutMs 3000 -PollMs 300) -or $script:checks -ne 3){throw 'Slow startup incorrectly rejected'}
'PASS startup beyond 500 ms is observed until ready without restarting'
$script:checks=0;$script:readyAfter=[int]::MaxValue
$watch=[Diagnostics.Stopwatch]::StartNew()
if(Wait-NativeReady -TimeoutMs 150 -PollMs 20){throw 'Missing startup accepted'}
if($watch.ElapsedMilliseconds -gt 1500){throw 'Startup wait is unbounded'}
'PASS missing startup times out without another start'
$script:checks=0;$script:taskState='Disabled'
if((Wait-NativeReady -TimeoutMs 3000) -or $script:checks -ne 1){throw 'Disabled task was retried'}
'PASS disabled task is not restarted'
$script:identityChanged=$true
try {Wait-NativeReady;throw 'Identity change ignored'}catch{if($_.Exception.Message -ne 'WORKER_IDENTITY_CHANGED'){throw}}
'PASS identity changes remain explicit failures'
