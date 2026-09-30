# Operator-only preconfiguration. Read one scoped Hub grant on stdin; never log it.
[CmdletBinding()]
param()
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Security
$value=[Console]::In.ReadToEnd() | ConvertFrom-Json
$sid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$guid=(Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Cryptography').MachineGuid.ToLowerInvariant()
if($value.sid -cne $sid -or $value.machineGuid -cne $guid -or $value.token -notmatch '^[A-Za-z0-9_-]{43}$'){throw 'COMPANION_IDENTITY_MISMATCH'}
$root=Join-Path $env:LOCALAPPDATA 'CodexWeb\companion-app'
$path=Join-Path $root 'device-session.bin'
$ancestor=$path
while($ancestor){if((Test-Path -LiteralPath $ancestor) -and ((Get-Item -LiteralPath $ancestor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'COMPANION_PATH_LINK'};$ancestor=Split-Path -Parent $ancestor}
$profile=Get-Content -LiteralPath (Join-Path $root 'profile.json') -Raw -Encoding UTF8 | ConvertFrom-Json
if($profile.sid -cne $sid -or $profile.hubOrigin -cne $value.hubOrigin){throw 'COMPANION_PROFILE_MISMATCH'}
$bytes=[Text.Encoding]::UTF8.GetBytes(($value | ConvertTo-Json -Compress))
try{$protected=[Security.Cryptography.ProtectedData]::Protect($bytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)}finally{[Array]::Clear($bytes,0,$bytes.Length);$value=$null}
$next=$path+'.tmp'
if((Test-Path -LiteralPath $next) -and ((Get-Item -LiteralPath $next -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'COMPANION_PATH_LINK'}
[IO.File]::WriteAllBytes($next,$protected)
if(Test-Path -LiteralPath $path){[IO.File]::Replace($next,$path,($path+'.previous-'+(Get-Date -Format 'yyyyMMddHHmmssfff')))}else{[IO.File]::Move($next,$path)}
[Console]::Write('COMPANION_CONNECTION_ENCRYPTED')
