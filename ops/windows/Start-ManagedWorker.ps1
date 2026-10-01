# Immutable code, existing per-user state. Task arguments select only a fixed component.
[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$ComponentId)
$ErrorActionPreference='Stop'
$definitions=@{
 CodexWebCompanionPersistent=@('companion-persistent','CodexWebCompanion.exe','--server')
 CodexWebDelivery=@('delivery','DeliveryWorker.cjs','worker')
 CodexWebProjectSetup=@('project-setup','ProjectSetupWorker.cjs','worker')
 CodexWebGitHubReleases=@('github-releases','GitHubReleases.cjs','worker')
 CodexWebFileLaunch=@('file-launch','FileLaunchWorker.cjs','work')
 CodexWebGuiPreview=@('gui-preview','GuiPreviewWorker.cjs','work')
}
if(-not $definitions.ContainsKey($ComponentId)){throw 'WORKER_UNKNOWN'}
function No-Link([string]$name){
 $cursor=[IO.Path]::GetFullPath($name)
 while($cursor){if((Get-Item -LiteralPath $cursor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'WORKER_LINK'};$cursor=[IO.Path]::GetDirectoryName($cursor)}
}
$manifestPath=Join-Path $PSScriptRoot 'worker.json'
No-Link $manifestPath
$digest=(Get-FileHash -LiteralPath $manifestPath -Algorithm SHA256).Hash.ToLowerInvariant()
if((Split-Path -Leaf $PSScriptRoot) -cne $digest){throw 'WORKER_RELEASE_CHANGED'}
$manifest=Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8|ConvertFrom-Json
if($manifest.format -ne 1 -or $manifest.componentId -cne $ComponentId){throw 'WORKER_RELEASE_CHANGED'}
foreach($entry in $manifest.files.PSObject.Properties){
 if($entry.Name -notmatch '^[A-Za-z0-9_.-]+$' -or $entry.Value -notmatch '^[a-f0-9]{64}$'){throw 'WORKER_RELEASE_CHANGED'}
 $file=Join-Path $PSScriptRoot $entry.Name;No-Link $file
 if((Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant() -cne $entry.Value){throw 'WORKER_RELEASE_CHANGED'}
}
$definition=$definitions[$ComponentId]
$module=Join-Path $env:LOCALAPPDATA ('CodexWeb\'+$definition[0])
$configPath=Join-Path $module 'config.json';No-Link $configPath
$config=Get-Content -LiteralPath $configPath -Raw -Encoding UTF8|ConvertFrom-Json
if($ComponentId -ceq 'CodexWebCompanionPersistent'){
 & (Join-Path $PSScriptRoot $definition[1]) --server $configPath
 exit $LASTEXITCODE
}
if(-not [IO.Path]::IsPathRooted($config.node) -or -not(Test-Path -LiteralPath $config.node -PathType Leaf) -or $config.node -match '\\WindowsApps\\'){throw 'WORKER_NODE_MISSING'}
No-Link $config.node
$env:CODEXWEB_WORKER_STATE=$module
Set-Location -LiteralPath $module
& $config.node (Join-Path $PSScriptRoot $definition[1]) $definition[2]
exit $LASTEXITCODE
