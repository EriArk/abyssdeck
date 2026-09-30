$ErrorActionPreference='Stop'
$repairScript=[IO.File]::ReadAllText((Join-Path $PSScriptRoot '../ops/windows/Repair-CompanionComponent.ps1'))
$expectedSid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$componentId='CodexWebComputerUse';$repairSource=''
$fixtureXml='reviewed task fixture'
$sha=[Security.Cryptography.SHA256]::Create()
try{$expectedDigest=([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($fixtureXml)))).Replace('-','').ToLowerInvariant()}finally{$sha.Dispose()}
$fixture=[pscustomobject]@{Principal=[pscustomobject]@{UserId=$expectedSid;LogonType='Interactive'};Actions=@([pscustomobject]@{Execute=(Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe')});State='Disabled'}
$script:started=0;$script:enabled=0
function Get-ScheduledTask {param($TaskName,$ErrorAction) return $fixture}
function Export-ScheduledTask {param($TaskName) return $fixtureXml}
function Start-ScheduledTask {param($TaskName) $script:started++}
function Enable-ScheduledTask {param($TaskName) $script:enabled++}
& ([scriptblock]::Create($repairScript))
if($started -ne 1 -or $enabled -ne 1){throw 'Stopped module did not receive one explicit repair'}
'PASS stopped own task enabled and started exactly once'
$fixture.State='Running'
try{& ([scriptblock]::Create($repairScript));throw 'Busy repair accepted'}catch{if($_.Exception.Message -notmatch 'TASK_CHANGED_OR_BUSY'){throw}}
'PASS running task left intact'
$fixture.State='Ready';$fixtureXml='changed task fixture'
try{& ([scriptblock]::Create($repairScript));throw 'Changed task accepted'}catch{if($_.Exception.Message -notmatch 'TASK_DEFINITION_CHANGED'){throw}}
if($started -ne 1 -or $enabled -ne 1){throw 'Refusal mutated a task'}
'PASS changed definition refused before any mutation'
$fixture.Principal.UserId='S-1-5-21-999-888-777-1001'
try{& ([scriptblock]::Create($repairScript));throw 'Foreign task accepted'}catch{if($_.Exception.Message -notmatch 'TASK_CHANGED_OR_BUSY'){throw}}
'PASS other Windows identity refused'
$automatic=$true;$fixture.Principal.UserId=$expectedSid;$fixtureXml='reviewed task fixture';$fixture.State='Disabled'
try{& ([scriptblock]::Create($repairScript));throw 'Automatic enabling accepted'}catch{if($_.Exception.Message -notmatch 'AUTOMATIC_TASK_NOT_IDLE'){throw}}
if($started -ne 1 -or $enabled -ne 1){throw 'Automatic refusal mutated a task'}
'PASS automatic repair never enables a disabled component'
$componentId='CodexWebCompanionPersistent'
try{& ([scriptblock]::Create($repairScript));throw 'Automatic writer accepted'}catch{if($_.Exception.Message -notmatch 'AUTOMATIC_WRITER_OR_ELEVATION_REFUSED'){throw}}
'PASS automatic native writer repair refused before task access'
$automatic=$false;$componentId='CodexWebComputerUse'
$blocker=[Threading.Mutex]::new($false,('Local\CodexWebRepair-'+$expectedSid+'-'+$componentId))
# Hold the mutex from a separate process; same-thread acquisition would be reentrant.
$ready=Join-Path $env:TEMP ('companion-repair-check-'+[Guid]::NewGuid().ToString('N'))
$holdScript='$m=[Threading.Mutex]::new($false,''Local\CodexWebRepair-'+$expectedSid+'-'+$componentId+''');$m.WaitOne()|Out-Null;[IO.File]::WriteAllText('''+$ready.Replace("'","''")+''',''ready'');Start-Sleep -Seconds 15'
$holder=Start-Process -FilePath (Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe') -ArgumentList @('-NoLogo','-NoProfile','-EncodedCommand',[Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($holdScript))) -WindowStyle Hidden -PassThru
try{
  for($i=0;$i -lt 50 -and -not(Test-Path -LiteralPath $ready);$i++){Start-Sleep -Milliseconds 100}
  if(-not(Test-Path -LiteralPath $ready)){throw 'Mutex holder did not start'}
  try{& ([scriptblock]::Create($repairScript));throw 'Parallel repair accepted'}catch{if($_.Exception.Message -notmatch 'REPAIR_ALREADY_RUNNING'){throw}}
  'PASS parallel repair refused across reopened UI processes'
}finally{if(-not $holder.HasExited){Stop-Process -Id $holder.Id};$blocker.Dispose();if(Test-Path -LiteralPath $ready){Remove-Item -LiteralPath $ready}}
