# Download a complete official package into the existing runtime root. Staging
# never edits the selected command, restarts a worker, or touches live sessions.
[CmdletBinding()]
param(
    [string]$Version = 'latest',
    [string]$RuntimeRoot = (Join-Path $env:LOCALAPPDATA 'CodexWeb\companion-persistent\runtime'),
    [string]$ArchivePath
)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
if ($Version -notmatch '^(latest|[0-9]+\.[0-9]+\.[0-9]+)$') { throw 'Use a stable release version or latest.' }
if (-not [IO.Path]::IsPathRooted($RuntimeRoot)) { throw 'Runtime root must be absolute.' }
$root = [IO.Path]::GetFullPath($RuntimeRoot).TrimEnd('\')
$cursor = $root
while ($cursor) {
    if ((Test-Path -LiteralPath $cursor) -and ((Get-Item -LiteralPath $cursor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Runtime root must not traverse links.' }
    $cursor = [IO.Path]::GetDirectoryName($cursor)
}
New-Item -ItemType Directory -Path $root -Force | Out-Null
$required = @('bin/codex.exe','bin/codex-code-mode-host.exe','codex-resources/codex-command-runner.exe','codex-resources/codex-windows-sandbox-setup.exe','codex-path/rg.exe')
function Assert-Package([string]$directory, [string]$version) {
    if ((Get-Item -LiteralPath $directory -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Package links are unsupported.' }
    if (@(Get-ChildItem -LiteralPath $directory -Recurse -Force | Where-Object { $_.Attributes -band [IO.FileAttributes]::ReparsePoint }).Count) { throw 'Package links are unsupported.' }
    $manifest = Get-Content -LiteralPath (Join-Path $directory 'codex-package.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($manifest.layoutVersion -ne 1 -or $manifest.version -cne $version -or $manifest.target -cne 'x86_64-pc-windows-msvc' -or $manifest.entrypoint -cne 'bin/codex.exe' -or $manifest.resourcesDir -cne 'codex-resources' -or $manifest.pathDir -cne 'codex-path') { throw 'Unsupported package layout.' }
    foreach ($name in $required) {
        if (-not (Test-Path -LiteralPath (Join-Path $directory $name) -PathType Leaf)) { throw "Incomplete package: $name" }
    }
}
$lock = [IO.File]::Open((Join-Path $root '.stage.lock'), 'OpenOrCreate', 'ReadWrite', 'None')
try {
    $metadataUrl = if ($Version -eq 'latest') { 'https://releases.openai.com/codex/channels/latest' } else { "https://releases.openai.com/codex/releases/$Version/release.json" }
    $release = Invoke-RestMethod $metadataUrl
    if ($release.tag_name -notmatch '^rust-v([0-9]+\.[0-9]+\.[0-9]+)$') { throw 'Unexpected stable release identity.' }
    $resolved = $Matches[1]
    if ($Version -ne 'latest' -and $Version -cne $resolved) { throw 'Release identity changed.' }
    $assetName = 'codex-package-x86_64-pc-windows-msvc.tar.gz'
    $asset = @($release.assets | Where-Object name -CEQ $assetName)
    if ($asset.Count -ne 1 -or $asset[0].digest -notmatch '^sha256:([a-f0-9]{64})$') { throw 'Package digest missing.' }
    $expectedHash = $Matches[1]
    $destination = Join-Path $root $resolved
    $receiptPath = Join-Path $destination 'abyssdeck-package.json'
    if (Test-Path -LiteralPath $destination) {
        Assert-Package $destination $resolved
        if (-not (Test-Path -LiteralPath $receiptPath)) { throw 'Existing runtime has no staging receipt; inspect it before reuse.' }
        $receipt = Get-Content -LiteralPath $receiptPath -Raw -Encoding UTF8 | ConvertFrom-Json
        if ($receipt.version -cne $resolved -or $receipt.archiveSha256 -cne $expectedHash) { throw 'Existing runtime identity changed.' }
        foreach ($entry in $receipt.files.PSObject.Properties) {
            $path = [IO.Path]::GetFullPath((Join-Path $destination $entry.Name))
            if (-not $path.StartsWith($destination + '\', [StringComparison]::OrdinalIgnoreCase) -or (Get-Item -LiteralPath $path -Force).Attributes -band [IO.FileAttributes]::ReparsePoint -or (Get-FileHash -LiteralPath $path).Hash.ToLowerInvariant() -cne $entry.Value) { throw 'Existing runtime file changed.' }
        }
        $actual = @(Get-ChildItem -LiteralPath $destination -Recurse -File | Where-Object FullName -CNE $receiptPath | ForEach-Object { $_.FullName.Substring($destination.Length+1) })
        $recorded = @($receipt.files.PSObject.Properties.Name)
        if (-not $recorded.Count -or @(Compare-Object $actual $recorded -CaseSensitive).Count) { throw 'Existing runtime inventory changed.' }
        Write-Output (Join-Path $destination 'bin\codex.exe')
        return
    }
    $staging = Join-Path $root ($resolved + '.staging')
    if (Test-Path -LiteralPath $staging) { throw 'Interrupted staging exists; inspect before retry.' }
    $archive = if ($ArchivePath) { [IO.Path]::GetFullPath($ArchivePath) } else { Join-Path $root '.package-download.tar.gz' }
    if (-not $ArchivePath) { Invoke-WebRequest "https://releases.openai.com/codex/releases/$resolved/$assetName" -UseBasicParsing -OutFile $archive }
    if ((Get-FileHash -LiteralPath $archive).Hash.ToLowerInvariant() -cne $expectedHash) { throw 'Package SHA-256 mismatch.' }
    $entries = @(tar -tzf $archive)
    if ($LASTEXITCODE -ne 0 -or -not $entries.Count -or @($entries | Where-Object { $_ -match '(^/|(^|/)\.\.(/|$)|:|\\)' }).Count) { throw 'Unsafe archive path.' }
    New-Item -ItemType Directory -Path $staging | Out-Null
    tar -xzf $archive -C $staging
    if ($LASTEXITCODE -ne 0) { throw 'Package extraction failed.' }
    Assert-Package $staging $resolved
    if ((& (Join-Path $staging 'bin/codex.exe') --version) -cne "codex-cli $resolved" -or $LASTEXITCODE -ne 0) { throw 'Executable version mismatch.' }
    $files = [ordered]@{}
    Get-ChildItem -LiteralPath $staging -Recurse -File | ForEach-Object { $files[$_.FullName.Substring($staging.Length+1)] = (Get-FileHash -LiteralPath $_.FullName).Hash.ToLowerInvariant() }
    $receipt = @{version=$resolved;archiveSha256=$expectedHash;source=$metadataUrl;files=$files} | ConvertTo-Json -Depth 4
    [IO.File]::WriteAllText((Join-Path $staging 'abyssdeck-package.json'),$receipt,[Text.UTF8Encoding]::new($false))
    # Both checked absolute paths remain immediate children of the one root.
    if ([IO.Path]::GetDirectoryName($staging) -cne $root -or [IO.Path]::GetDirectoryName($destination) -cne $root) { throw 'Unexpected runtime destination.' }
    Move-Item -LiteralPath $staging -Destination $destination
    if (-not $ArchivePath) { Remove-Item -LiteralPath $archive }
    Write-Output (Join-Path $destination 'bin\codex.exe')
} finally { $lock.Dispose() }
