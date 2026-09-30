function Resolve-CwCodexCommand {
    # Prefer the configured retained runtime; desktop update directories are candidates only.
    foreach($folder in @('companion-persistent','companion')) {
        $config=Join-Path $env:LOCALAPPDATA ('CodexWeb\'+$folder+'\config.json')
        if(Test-Path -LiteralPath $config){
            $path=(Get-Content -LiteralPath $config -Raw -Encoding UTF8 | ConvertFrom-Json).codexCommand
            if($path -and (Test-Path -LiteralPath $path -PathType Leaf)){return [string]$path}
        }
    }
    $command=Get-Command codex.exe -ErrorAction SilentlyContinue
    if($command -and $command.Source -notmatch '\\WindowsApps\\' -and (Test-Path -LiteralPath $command.Source -PathType Leaf)){return $command.Source}
    $root=Join-Path $env:LOCALAPPDATA 'OpenAI\Codex\bin'
    if(Test-Path -LiteralPath $root){
        foreach($candidate in @(Get-ChildItem -LiteralPath $root -Filter codex.exe -Recurse -File | Sort-Object LastWriteTimeUtc -Descending)){
            $folder=$candidate.DirectoryName
            if(@('codex-code-mode-host.exe','codex-command-runner.exe','codex-windows-sandbox-setup.exe' | Where-Object {-not(Test-Path -LiteralPath (Join-Path $folder $_) -PathType Leaf)}).Count -eq 0){return $candidate.FullName}
        }
    }
    return $null
}
function Copy-CompanionRuntime {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory=$true)][string]$CodexCommand,
        [Parameter(Mandatory=$true)][string]$TargetDirectory
    )
    $commandPath = [IO.Path]::GetFullPath($CodexCommand)
    if (-not (Test-Path -LiteralPath $commandPath -PathType Leaf) -or [IO.Path]::GetExtension($commandPath) -ne '.exe') {
        throw 'The configured Codex executable is missing.'
    }
    $bundle = Split-Path -Parent $commandPath
    # Desktop updates retire these directories even while an App Server is using them.
    # Standalone/custom CLI installations retain their explicitly configured path.
    if ($commandPath -notmatch '[\\/]OpenAI[\\/]Codex[\\/]bin[\\/]([a-fA-F0-9]{16})[\\/]codex\.exe$') {
        return $commandPath
    }
    $revision = $Matches[1]
    $files = @('codex.exe', 'codex-code-mode-host.exe', 'codex-command-runner.exe', 'codex-windows-sandbox-setup.exe')
    foreach ($name in $files) {
        if (-not (Test-Path -LiteralPath (Join-Path $bundle $name) -PathType Leaf)) {
            throw 'The selected desktop Codex bundle is incomplete. Select the current complete bundle before installing Companion.'
        }
    }
    $runtimeRoot = Join-Path ([IO.Path]::GetFullPath($TargetDirectory)) 'runtime'
    $destination = Join-Path $runtimeRoot $revision
    New-Item -ItemType Directory -Path $runtimeRoot -Force | Out-Null
    if (-not (Test-Path -LiteralPath $destination)) {
        $staging = Join-Path $runtimeRoot ($revision + '.staging-' + [Guid]::NewGuid().ToString('N'))
        $boundary = [IO.Path]::GetFullPath($runtimeRoot).TrimEnd('\\') + '\'
        if (-not [IO.Path]::GetFullPath($staging).StartsWith($boundary, [StringComparison]::OrdinalIgnoreCase) -or
            -not [IO.Path]::GetFullPath($destination).StartsWith($boundary, [StringComparison]::OrdinalIgnoreCase)) { throw 'Unexpected runtime destination' }
        New-Item -ItemType Directory -Path $staging | Out-Null
        foreach ($name in $files) {
            $source = Join-Path $bundle $name
            $copy = Join-Path $staging $name
            Copy-Item -LiteralPath $source -Destination $copy
            if ((Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash -ne (Get-FileHash -LiteralPath $copy -Algorithm SHA256).Hash) {
                throw 'Codex changed during installation. Retry after its update completes.'
            }
        }
        Move-Item -LiteralPath $staging -Destination $destination
    }
    foreach ($name in $files) {
        if ((Get-FileHash -LiteralPath (Join-Path $bundle $name) -Algorithm SHA256).Hash -ne (Get-FileHash -LiteralPath (Join-Path $destination $name) -Algorithm SHA256).Hash) {
            throw 'The saved Companion runtime does not match the selected Codex bundle.'
        }
    }
    # Keep older snapshots: a still-running App Server may need their helper executables.
    return (Join-Path $destination 'codex.exe')
}
