# Stable current-user UI launcher. No worker stop/start or native controller.
[CmdletBinding()]
param([switch]$Tray)
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$pointerPath = Join-Path $root 'current.json'
function Assert-NoLink([string]$path) {
    $current = [IO.Path]::GetFullPath($path)
    while ($current) {
        if ((Test-Path -LiteralPath $current) -and ((Get-Item -LiteralPath $current -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Companion UI path contains a link.' }
        $current = [IO.Path]::GetDirectoryName($current)
    }
}
Assert-NoLink $pointerPath
$pointer = Get-Content -LiteralPath $pointerPath -Raw -Encoding UTF8 | ConvertFrom-Json
if ($pointer.sid -cne [Security.Principal.WindowsIdentity]::GetCurrent().User.Value -or $pointer.release -notmatch '^[a-f0-9]{64}$' -or $pointer.executableSha256 -notmatch '^[a-f0-9]{64}$') { throw 'Companion UI identity is not valid.' }
$runtime = Join-Path $root ('releases/' + $pointer.release)
$manifestPath = Join-Path $runtime 'release.json'
$executable = Join-Path $runtime 'CodexWeb.Companion.exe'
Assert-NoLink $executable
Assert-NoLink $manifestPath
if ((Get-FileHash -LiteralPath $manifestPath -Algorithm SHA256).Hash.ToLowerInvariant() -cne $pointer.release -or (Get-FileHash -LiteralPath $executable -Algorithm SHA256).Hash.ToLowerInvariant() -cne $pointer.executableSha256) { throw 'Companion UI integrity check failed.' }
$options = @{FilePath=$executable;WorkingDirectory=$runtime;WindowStyle='Hidden'}
if ($Tray) { $options.ArgumentList = '--tray' }
Start-Process @options
