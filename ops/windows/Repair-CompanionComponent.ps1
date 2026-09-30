# Fixed same-user stopped-module recovery. Never stop work or replace a native writer.
$ErrorActionPreference='Stop'
$allowed=@('CodexWebCompanion','CodexWebCompanionPersistent','CodexWebComputerUse','CodexWebDelivery','CodexWebFileLaunch','CodexWebProjectSetup','CodexWebGitHubReleases','CodexWebGuiPreview','CodexWebDesktopRestart')
if($componentId -notin $allowed -or [Security.Principal.WindowsIdentity]::GetCurrent().User.Value -cne $expectedSid){throw 'IDENTITY_CHANGED'}
$repairMutex=[Threading.Mutex]::new($false,('Local\CodexWebRepair-'+$expectedSid+'-'+$componentId))
$repairAcquired=$false
try {
try {$repairAcquired=$repairMutex.WaitOne(0)} catch [Threading.AbandonedMutexException] {$repairAcquired=$true}
if(-not $repairAcquired){throw 'REPAIR_ALREADY_RUNNING'}
if($automatic -and $componentId -in @('CodexWebCompanion','CodexWebCompanionPersistent','CodexWebDesktopRestart')){throw 'AUTOMATIC_WRITER_OR_ELEVATION_REFUSED'}
$task=Get-ScheduledTask -TaskName $componentId -ErrorAction SilentlyContinue
if($task){
$principalSid=if($task.Principal.UserId -like 'S-1-*'){$task.Principal.UserId}else{([Security.Principal.NTAccount]::new($task.Principal.UserId)).Translate([Security.Principal.SecurityIdentifier]).Value}
if($principalSid -cne $expectedSid -or $task.Principal.LogonType -ne 'Interactive' -or $task.Actions.Count -ne 1 -or $task.State -eq 'Running'){throw 'TASK_CHANGED_OR_BUSY'}
$sha=[Security.Cryptography.SHA256]::Create()
try {$digest=([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes((Export-ScheduledTask -TaskName $componentId))))).Replace('-','').ToLowerInvariant()} finally {$sha.Dispose()}
if($digest -cne $expectedDigest){throw 'TASK_DEFINITION_CHANGED'}
if($automatic -and $task.State -ne 'Ready'){throw 'AUTOMATIC_TASK_NOT_IDLE'}
} elseif($expectedDigest){throw 'TASK_DISAPPEARED'}
if($automatic -and -not $task){throw 'AUTOMATIC_TASK_UNKNOWN'}
if($componentId -in @('CodexWebCompanion','CodexWebCompanionPersistent')){
  $native=@(Get-CimInstance Win32_Process -Filter "Name='codex.exe'" | Where-Object {$_.ExecutablePath -and $_.ExecutablePath.StartsWith((Join-Path $env:LOCALAPPDATA 'CodexWeb\companion-persistent\runtime\'),[StringComparison]::OrdinalIgnoreCase)})
  if($native.Count){throw 'NATIVE_WORK_PRESENT'}
  $other=Get-ScheduledTask -TaskName $(if($componentId -eq 'CodexWebCompanion'){'CodexWebCompanionPersistent'}else{'CodexWebCompanion'}) -ErrorAction SilentlyContinue
  if($other -and $other.State -eq 'Running'){throw 'OTHER_WRITER_PRESENT'}
}
if($repairSource){
  if($componentId -in @('CodexWebCompanion','CodexWebCompanionPersistent')){throw 'WRITER_MIGRATION_REQUIRED'}
  $installers=@{CodexWebDelivery='Install-Delivery.ps1';CodexWebFileLaunch='Install-FileLaunch.ps1';CodexWebProjectSetup='Install-ProjectSetup.ps1';CodexWebGitHubReleases='Install-GitHubReleases.ps1';CodexWebGuiPreview='Install-GuiPreview.ps1';CodexWebDesktopRestart='Install-DesktopControl.ps1';CodexWebComputerUse='Install-ComputerUse.ps1'}
  $installer=Join-Path $repairSource $installers[$componentId]
  if(-not(Test-Path -LiteralPath $installer -PathType Leaf)){throw 'REPAIR_KIT_MISSING'}
  # Preserve a rollback copy of this module and its task; native accounts/receipts stay in place.
  $folders=@{CodexWebDelivery='delivery';CodexWebFileLaunch='file-launch';CodexWebProjectSetup='project-setup';CodexWebGitHubReleases='github-releases';CodexWebGuiPreview='gui-preview';CodexWebDesktopRestart='desktop-control';CodexWebComputerUse='computer-use'}
  $module=Join-Path $env:LOCALAPPDATA ('CodexWeb\'+$folders[$componentId])
  $backup=Join-Path $repairSource ('backup-'+[Guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Path $backup | Out-Null
  if($task){Export-ScheduledTask -TaskName $componentId | Set-Content -LiteralPath (Join-Path $backup 'task.xml') -Encoding UTF8}
  if(Test-Path -LiteralPath $module){
    if((Get-Item -LiteralPath $module -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'MODULE_LINK'}
    foreach($file in @(Get-ChildItem -LiteralPath $module -File -Force)){
      if($file.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'MODULE_LINK'}
      if($file.Length -gt 8MB){throw 'MODULE_BACKUP_BOUND'}
      Copy-Item -LiteralPath $file.FullName -Destination $backup
    }
  }
  if($componentId -eq 'CodexWebComputerUse'){
    # Install the local optional host; existing native clients decide when to reload MCP.
    & $installer -SkipMcpRegistration
  }else{
    $node=(Get-Command node.exe -ErrorAction Stop).Source
    if($componentId -eq 'CodexWebDelivery'){& $installer -NodeCommand $node -ProbePath (Join-Path $repairSource 'deliveryProbe.js')}
    elseif($componentId -eq 'CodexWebProjectSetup'){& $installer -NodeCommand $node -ProbePath (Join-Path $repairSource 'setupProbe.js')}
    else{& $installer -NodeCommand $node}
  }
}else{
  if(-not $task -or -not(Test-Path -LiteralPath $task.Actions[0].Execute -PathType Leaf)){throw 'EXECUTABLE_MISSING'}
  if($task.State -eq 'Disabled'){Enable-ScheduledTask -TaskName $componentId | Out-Null}
  if($componentId -in @('CodexWebCompanion','CodexWebCompanionPersistent','CodexWebComputerUse')){Start-ScheduledTask -TaskName $componentId}
}
# Demand workers remain Ready; their accepted work is dispatched only by the Hub.
} finally {
  if($repairAcquired){$repairMutex.ReleaseMutex()}
  $repairMutex.Dispose()
}
