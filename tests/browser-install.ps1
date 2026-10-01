param([Parameter(Mandatory=$true)][string]$PackageDirectory)
$ErrorActionPreference='Stop'
$package=(Resolve-Path $PackageDirectory).Path
$source=[IO.File]::ReadAllText((Join-Path $PSScriptRoot '../ops/windows/Install-Browser.ps1'))
$tokens=$null;$errors=$null
$ast=[Management.Automation.Language.Parser]::ParseInput($source,[ref]$tokens,[ref]$errors)
if($errors.Count){throw 'Installer parse failed'}
$call=$ast.Find({param($a)$a -is [Management.Automation.Language.FunctionDefinitionAst] -and $a.Name -eq 'Browser-Call'},$true)
$source=$source.Substring(0,$call.Extent.StartOffset)+'function Browser-Call {param($name) if($name -eq "shutdown_idle"){if($script:failStartup){$script:closing=2;return @{stopped=$true}};return @{stopped=$false}};if($script:failStartup){throw "fixture startup failure"};return @{ready=$true;webViewVersion="fixture"}}'+$source.Substring($call.Extent.EndOffset)
$root=Join-Path $env:TEMP ('cw-browser-install-'+[Guid]::NewGuid().ToString('N'))
$original=$env:LOCALAPPDATA;$env:LOCALAPPDATA=$root
$sid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$script:task=$null;$script:writes=0;$script:failStartup=$false;$script:closing=0
function Get-ScheduledTask {param($TaskName,$ErrorAction) if($script:closing -gt 0){$script:closing--;if($script:closing -eq 0){$script:task.State='Ready'}};$script:task}
function Export-ScheduledTask {param($TaskName) 'fixture-task'}
function New-ScheduledTaskAction {param($Execute,$Argument,$WorkingDirectory) [pscustomobject]@{Execute=$Execute;Arguments=$Argument;WorkingDirectory=$WorkingDirectory}}
function New-ScheduledTaskPrincipal {param($UserId,$LogonType,$RunLevel) [pscustomobject]@{UserId=$sid;LogonType=$LogonType;RunLevel=$RunLevel}}
function New-ScheduledTaskTrigger {param($AtLogOn,$User) return @{} }
function New-ScheduledTaskSettingsSet {param([switch]$Hidden,[switch]$AllowStartIfOnBatteries,[switch]$DontStopIfGoingOnBatteries,[switch]$StartWhenAvailable,$ExecutionTimeLimit,$MultipleInstances) return @{} }
function Register-ScheduledTask {param($TaskName,$Action,$Principal,$Trigger,$Settings,$Description,$Xml,[switch]$Force) if($Xml){if($script:task.State -eq "Running"){throw "Rollback raced live process"};$script:task=$script:savedTask;return};$script:writes++;$script:task=[pscustomobject]@{Actions=@($Action);Principal=$Principal;State='Ready'} }
function Start-ScheduledTask {param($TaskName) $script:writes++;$script:task.State='Running'}
try{
 New-Item -ItemType Directory -Path $root|Out-Null
 # Switch parameter needed by production call.
 function New-ScheduledTaskTrigger {param([switch]$AtLogOn,$User) return @{} }
 $run=[scriptblock]::Create($source)
 $result=& $run -PackageDirectory $package -SkipMcpRegistration -ExpectedSid $sid | ConvertFrom-Json
 if($result.state -ne 'installed' -or $writes -ne 2){throw 'Fresh browser was not installed once'}
 $pointer=Join-Path $root 'CodexWeb/browser/current.json';$bytes=[IO.File]::ReadAllBytes($pointer)
 $result=& $run -PackageDirectory $package -SkipMcpRegistration -ExpectedSid $sid | ConvertFrom-Json
 if($result.state -ne 'installed' -or $writes -ne 2 -or [Convert]::ToBase64String([IO.File]::ReadAllBytes($pointer)) -cne [Convert]::ToBase64String($bytes)){throw 'Healthy install repeated an effect'}
 'PASS first install and reopen reconcile exact pointer without duplicate task changes'
 try{& $run -PackageDirectory $package -SkipMcpRegistration -ExpectedSid 'wrong';throw 'Expected identity refusal'}catch{if($_.Exception.Message -ne 'BROWSER_IDENTITY_CHANGED'){throw}}
 try{& $run -PackageDirectory $package -SkipMcpRegistration -ExpectedSid $sid -ExpectedTaskDigest ('0'*64);throw 'Expected task refusal'}catch{if($_.Exception.Message -ne 'BROWSER_TASK_CHANGED'){throw}}
 if($writes -ne 2){throw 'Refusal changed tasks'}
 'PASS identity and stale task checks precede mutation'
 $script:task.Actions[0].Execute=Join-Path $root 'CodexWeb/browser/runtime/old/CodexWebBrowserHost.exe'
 $result=& $run -PackageDirectory $package -SkipMcpRegistration -ExpectedSid $sid | ConvertFrom-Json
 if($result.state -ne 'waitingIdle' -or $writes -ne 2){throw 'Open browser work was interrupted'}
 'PASS busy browser retains task, pointer and profile'
 # Same exact package with a damaged immutable file repairs to a fresh address.
 $script:task.State='Ready'
 $old=(Get-Content $pointer -Raw|ConvertFrom-Json).release
 $broken=Join-Path $root ('CodexWeb/browser/runtime/'+$old+'/CodexWebBrowser.exe')
 [IO.File]::WriteAllText($broken,'damaged')
 $result=& $run -PackageDirectory $package -SkipMcpRegistration -ExpectedSid $sid | ConvertFrom-Json
 if($result.state -ne 'installed' -or $result.release -eq $old -or [IO.File]::ReadAllText($broken) -ne 'damaged'){throw 'Repair overwrote old release'}
 $before=$writes
 $result=& $run -PackageDirectory $package -SkipMcpRegistration -ExpectedSid $sid | ConvertFrom-Json
 if($writes -ne $before -or $result.state -ne 'installed'){throw 'Repair was not durably reconciled'}
 'PASS damaged release repair preserves old bytes and survives repeated setup'
 $script:task.State='Ready'
 $script:savedTask=$script:task
 $pointerBefore=[IO.File]::ReadAllText($pointer)
 $script:failStartup=$true
 try{& $run -PackageDirectory $package -SkipMcpRegistration -ExpectedSid $sid;throw 'Expected failed startup'}catch{if($_.Exception.Message -ne 'Browser did not become ready. MCP registration was not changed.'){throw}}
 if($script:task -ne $script:savedTask -or $script:task.State -ne 'Running' -or [IO.File]::ReadAllText($pointer) -cne $pointerBefore){throw 'Rollback did not preserve original task and pointer'}
 'PASS failed startup waits for process exit before restoring and starting previous task'
}finally{
 $env:LOCALAPPDATA=$original
 $resolved=[IO.Path]::GetFullPath($root)
 if($resolved.StartsWith(([IO.Path]::GetFullPath($env:TEMP).TrimEnd('\')+'\cw-browser-install-'),[StringComparison]::OrdinalIgnoreCase)){Remove-Item -LiteralPath $resolved -Recurse -Force}
}
