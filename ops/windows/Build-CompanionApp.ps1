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
$files = [ordered]@{}
foreach ($file in Get-ChildItem -LiteralPath $OutputDirectory -File -Recurse | Sort-Object FullName) {
    if ($file.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Package contains a link.' }
    $name = $file.FullName.Substring($OutputDirectory.Length + 1).Replace('\','/')
    $files[$name] = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
}
if (-not $files.Contains('CodexWeb.Companion.exe')) { throw 'Package does not contain an executable.' }
$revision = (& git -C $repository rev-parse HEAD).Trim()
$sourceDirty = [bool](& git -C $repository status --porcelain)
$manifest = [ordered]@{ format=1; product='codexweb-companion-ui'; version='0.2.0'; platform='win-x64'; sourceRevision=$revision; sourceDirty=$sourceDirty; runtime='10.0.12'; files=$files }
[IO.File]::WriteAllText((Join-Path $OutputDirectory 'release.json'), ($manifest | ConvertTo-Json -Depth 6), [Text.UTF8Encoding]::new($false))
@{ package=$OutputDirectory; version=$manifest.version; manifestSha256=(Get-FileHash -LiteralPath (Join-Path $OutputDirectory 'release.json')).Hash.ToLowerInvariant(); files=$files.Count } | ConvertTo-Json -Compress
