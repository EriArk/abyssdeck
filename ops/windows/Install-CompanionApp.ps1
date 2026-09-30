# Installs ONLY the independently owned UI. Existing nine tasks/configs/keys and
# native processes are never stopped, rewritten, inspected for text or replayed.
[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][string]$PackageDirectory,
    [string]$HubOrigin,
    [string]$DeviceId = '',
    [string]$Route = 'Не привязан',
    [switch]$NoStart
)
$ErrorActionPreference = 'Stop'
function Assert-NoLink([string]$path) {
    $current = [IO.Path]::GetFullPath($path)
    while ($current) {
        if ((Test-Path -LiteralPath $current) -and ((Get-Item -LiteralPath $current -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Installation path contains a link.' }
        $current = [IO.Path]::GetDirectoryName($current)
    }
}
function Write-Atomic([string]$path, $value) {
    Assert-NoLink $path
    $temp = $path + '.tmp'
    Assert-NoLink $temp
    [IO.File]::WriteAllText($temp, ($value | ConvertTo-Json -Depth 7), [Text.UTF8Encoding]::new($false))
    if (Test-Path -LiteralPath $path) { [IO.File]::Replace($temp, $path, [NullString]::Value) }
    else { [IO.File]::Move($temp, $path) }
}
$sid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$mutexCreated = $false
$installerMutex = [Threading.Mutex]::new($true, ('Local\codex-web-companion-ui-install-' + $sid), [ref]$mutexCreated)
if (-not $mutexCreated) { $installerMutex.Dispose(); throw 'Another UI installation is already running.' }
try {
$package = (Resolve-Path -LiteralPath $PackageDirectory).Path.TrimEnd('\')
Assert-NoLink $package
$manifestPath = Join-Path $package 'release.json'
Assert-NoLink $manifestPath
$manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
if ($manifest.format -ne 1 -or $manifest.product -cne 'codexweb-companion-ui' -or $manifest.platform -cne 'win-x64' -or $manifest.version -notmatch '^0\.4\.\d+$') { throw 'Unknown UI package.' }
$entries = @($manifest.files.PSObject.Properties)
if ($entries.Count -lt 2 -or $entries.Count -gt 300) { throw 'Invalid package inventory.' }
$expected = @('release.json')
foreach ($entry in $entries) {
    $name = $entry.Name
    if ($name -notmatch '^[a-zA-Z0-9_.-]+(?:/[a-zA-Z0-9_.-]+)*$' -or @($name.Split('/') | Where-Object { $_ -eq '.' -or $_ -eq '..' }).Count -or $entry.Value -notmatch '^[a-f0-9]{64}$') { throw 'Invalid package path/hash.' }
    $file = Join-Path $package $name
    Assert-NoLink $file
    if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { throw 'UI package file is missing.' }
    if ((Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant() -cne $entry.Value) { throw 'UI package checksum mismatch.' }
    $expected += $name
}
$actual = @(Get-ChildItem -LiteralPath $package -File -Recurse | ForEach-Object { $_.FullName.Substring($package.Length + 1).Replace('\','/') })
if (Compare-Object ($expected | Sort-Object) ($actual | Sort-Object)) { throw 'UI package has unexpected files.' }
if (-not $manifest.files.'CodexWeb.Companion.exe') { throw 'UI executable is missing.' }
$root = Join-Path $env:LOCALAPPDATA 'CodexWeb/companion-app'
Assert-NoLink $root
New-Item -ItemType Directory -Path $root -Force | Out-Null
$directoryInfo = [IO.DirectoryInfo]::new($root)
# Modify only the DACL. A fresh descriptor passed to Set-Acl can request SACL
# privileges on a repeat install, even for this user's own protected directory.
$acl = $directoryInfo.GetAccessControl([Security.AccessControl.AccessControlSections]::Access)
$acl.SetAccessRuleProtection($true, $false)
foreach ($existingRule in @($acl.GetAccessRules($true, $false, [Security.Principal.SecurityIdentifier]))) {
    $acl.RemoveAccessRuleSpecific($existingRule)
}
foreach ($ownerSid in @($sid, 'S-1-5-18')) {
    $rule = [Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new($ownerSid), 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
    $acl.AddAccessRule($rule)
}
$directoryInfo.SetAccessControl($acl)
$profilePath = Join-Path $root 'profile.json'
Assert-NoLink $profilePath
$firstRun=-not(Test-Path -LiteralPath $profilePath)
if (Test-Path -LiteralPath $profilePath) {
    $profile = Get-Content -LiteralPath $profilePath -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($profile.sid -cne $sid) { throw 'UI profile belongs to another Windows identity.' }
} else {
    if ($HubOrigin) {
        $origin = [Uri]$HubOrigin
        if (-not $origin.IsAbsoluteUri -or $origin.Scheme -ne 'https' -or $origin.UserInfo -or $origin.AbsolutePath -ne '/' -or $origin.Query -or $origin.Fragment) { throw 'Hub origin must be HTTPS without a path or credentials.' }
        $HubOrigin = $origin.GetLeftPart([UriPartial]::Authority)
    } else { $HubOrigin = '' }
    if ($DeviceId.Length -gt 100 -or $Route.Length -gt 100) { throw 'Invalid device metadata.' }
    $profile = [ordered]@{sid=$sid;hubOrigin=$HubOrigin;deviceId=$DeviceId;route=$Route;theme='classic-dark';autoStart=$true}
    Write-Atomic $profilePath $profile
}
$release = (Get-FileHash -LiteralPath $manifestPath -Algorithm SHA256).Hash.ToLowerInvariant()
$runtime = Join-Path $root ('releases/' + $release)
Assert-NoLink $runtime
New-Item -ItemType Directory -Path $runtime -Force | Out-Null
foreach ($name in $expected) {
    $target = Join-Path $runtime $name
    Assert-NoLink $target
    New-Item -ItemType Directory -Path ([IO.Path]::GetDirectoryName($target)) -Force | Out-Null
    if (Test-Path -LiteralPath $target) {
        if ((Get-FileHash -LiteralPath $target).Hash -cne (Get-FileHash -LiteralPath (Join-Path $package $name)).Hash) { throw 'Immutable UI release was modified.' }
    } else { Copy-Item -LiteralPath (Join-Path $package $name) -Destination $target }
}
$current = Join-Path $root 'current.json'
if (Test-Path -LiteralPath $current) { Assert-NoLink $current; Copy-Item -LiteralPath $current -Destination (Join-Path $root ('previous-' + (Get-Date -Format 'yyyyMMddHHmmssfff') + '.json')) }
$launcher = Join-Path $root 'Start-CompanionApp.ps1'
Assert-NoLink $launcher
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'Start-CompanionApp.ps1') -Destination $launcher -Force
Write-Atomic $current ([ordered]@{sid=$sid;release=$release;version=$manifest.version;executableSha256=$manifest.files.'CodexWeb.Companion.exe';installedAt=[DateTime]::UtcNow.ToString('o')})
$powershell = Join-Path $env:WINDIR 'System32/WindowsPowerShell/v1.0/powershell.exe'
$runKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
if ($profile.autoStart) {
    New-Item -Path $runKey -Force | Out-Null
    Set-ItemProperty -Path $runKey -Name CodexWebCompanionApp -Value ('"' + $powershell + '" -NoLogo -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $launcher + '" -Tray')
}
$shortcuts = Join-Path ([Environment]::GetFolderPath('Programs')) 'CodexWeb'
New-Item -ItemType Directory -Path $shortcuts -Force | Out-Null
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut((Join-Path $shortcuts 'CodexWeb Companion.lnk'))
$shortcut.TargetPath = $powershell
$shortcut.Arguments = '-NoLogo -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $launcher + '"'
$shortcut.WorkingDirectory = $root
$shortcut.Description = 'CodexWeb Companion'
$shortcut.IconLocation = (Join-Path $runtime 'CodexWeb.Companion.exe') + ',0'
$shortcut.Save()
if (-not $NoStart) { if($firstRun){& $launcher}else{& $launcher -Tray} }
@{installed=$true;release=$release;version=$manifest.version;preservedWorkers=$true;runtime=$runtime} | ConvertTo-Json -Compress
} finally { $installerMutex.Dispose() }
