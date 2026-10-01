[CmdletBinding()]
param([string]$Dotnet = 'dotnet', [string]$OutputDirectory)
$ErrorActionPreference = 'Stop'
$repository = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
if (-not $OutputDirectory) { $OutputDirectory = Join-Path $repository '.local/companion-app-package' }
$OutputDirectory = [IO.Path]::GetFullPath($OutputDirectory)
if (Test-Path -LiteralPath (Join-Path $OutputDirectory 'release.json')) { throw 'Use a new output directory for each immutable package.' }
$env:DOTNET_CLI_TELEMETRY_OPTOUT = '1'
$env:DOTNET_GENERATE_ASPNET_CERTIFICATE = 'false'
$sdkVersion = (& $Dotnet --version).Trim()
if ($LASTEXITCODE -ne 0 -or $sdkVersion -ne '10.0.401') { throw 'Companion requires the pinned .NET SDK 10.0.401.' }
& $Dotnet publish (Join-Path $repository 'apps/companion/CodexWeb.Companion.csproj') -c Release -r win-x64 --self-contained true -p:PublishSingleFile=false -p:RestoreLockedMode=true -o $OutputDirectory --nologo
if ($LASTEXITCODE -ne 0) { throw 'Companion publish failed.' }
foreach($name in @('Install-CompanionApp.ps1','Start-CompanionApp.ps1')) { Copy-Item -LiteralPath (Join-Path $PSScriptRoot $name) -Destination $OutputDirectory }
Push-Location -LiteralPath $repository
try { $helperJson = & node --input-type=module -e "import {companionRepairFiles} from './apps/hub/dist/machine-enrollment.js';console.log(JSON.stringify(companionRepairFiles()));" } finally { Pop-Location }
if($LASTEXITCODE -ne 0){throw 'Build the Hub helper modules before packaging Companion.'}
foreach($file in ($helperJson | ConvertFrom-Json)) {
    if($file.name -notmatch '^[A-Za-z0-9_-]+(?:/[A-Za-z0-9_-]+)*\.(ps1|cjs|js|cs)$'){throw 'Invalid reviewed helper file.'}
    $target=Join-Path $OutputDirectory ('helpers/'+$file.name)
    New-Item -ItemType Directory -Path ([IO.Path]::GetDirectoryName($target)) -Force|Out-Null
    [IO.File]::WriteAllBytes($target,[Convert]::FromBase64String($file.data))
}
$nativeDirectory=Join-Path $OutputDirectory 'helpers/managed-native'
New-Item -ItemType Directory -Path $nativeDirectory -Force|Out-Null
$compiler=Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
& $compiler /nologo /define:PERSISTENT_CHANNEL /target:exe /platform:x64 /r:System.Web.Extensions.dll ("/out:"+(Join-Path $nativeDirectory 'CodexWebCompanion.exe')) (Join-Path $PSScriptRoot 'companion/CodexWebBridge.cs') (Join-Path $PSScriptRoot 'companion/RuntimeBroker.cs')
if($LASTEXITCODE -ne 0){throw 'Persistent worker compilation failed.'}
[IO.File]::WriteAllText((Join-Path $OutputDirectory 'Install.cmd'), '@echo off' + "`r`n" + 'powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0Install-CompanionApp.ps1" -PackageDirectory "%~dp0."' + "`r`n" + 'if errorlevel 1 pause' + "`r`n", [Text.UTF8Encoding]::new($false))
Copy-Item -LiteralPath (Join-Path $repository 'docs/COMPANION_FIRST_START.txt') -Destination (Join-Path $OutputDirectory 'README.txt')
$files = [ordered]@{}
foreach ($file in Get-ChildItem -LiteralPath $OutputDirectory -File -Recurse | Sort-Object FullName) {
    if ($file.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Package contains a link.' }
    $name = $file.FullName.Substring($OutputDirectory.Length + 1).Replace('\','/')
    $files[$name] = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
}
if (-not $files.Contains('CodexWeb.Companion.exe')) { throw 'Package does not contain an executable.' }
$revision = (& git -C $repository rev-parse HEAD).Trim()
$sourceDirty = [bool](& git -C $repository status --porcelain)
$manifest = [ordered]@{ format=1; product='codexweb-companion-ui'; version='0.5.0'; platform='win-x64'; sourceRevision=$revision; sourceDirty=$sourceDirty; runtime='10.0.12'; files=$files }
[IO.File]::WriteAllText((Join-Path $OutputDirectory 'release.json'), ($manifest | ConvertTo-Json -Depth 6), [Text.UTF8Encoding]::new($false))
@{ package=$OutputDirectory; version=$manifest.version; manifestSha256=(Get-FileHash -LiteralPath (Join-Path $OutputDirectory 'release.json')).Hash.ToLowerInvariant(); files=$files.Count } | ConvertTo-Json -Compress
