# Runs only disposable local fixture apps through the real adapter implementation.
$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
$temporary=Join-Path ([IO.Path]::GetTempPath()) ('codexweb-cua-flow-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $temporary | Out-Null
try {
    $binary=Join-Path $temporary 'WindowFlow.exe'
    & "$env:WINDIR\Microsoft.NET\Framework64\v4.0.30319\csc.exe" /nologo /target:exe /platform:x64 /main:ComputerUseWindowFlow /r:System.Web.Extensions.dll /r:System.Drawing.dll /r:System.Windows.Forms.dll "/out:$binary" (Join-Path $root 'ops/windows/computer-use/ComputerUse.cs') (Join-Path $PSScriptRoot 'fixtures/ComputerUseWindowFlow.cs')
    if($LASTEXITCODE -ne 0){throw 'Acceptance compilation failed'}
    # Pipe stdout; hide the console. The only visible windows are the test apps.
    $out=Join-Path $temporary 'out.txt';$err=Join-Path $temporary 'err.txt'
    $process=Start-Process -FilePath $binary -ArgumentList ('"'+$temporary+'"') -WindowStyle Hidden -PassThru -RedirectStandardOutput $out -RedirectStandardError $err
    $processHandle=$process.Handle # Retain the exit status with Windows PowerShell 5.1.
    if(-not $process.WaitForExit(55000)){Stop-Process -Id $process.Id;throw 'Disposable acceptance fixture timed out'}
    Get-Content -LiteralPath $out
    if($process.ExitCode -ne 0){Get-Content -LiteralPath $err;throw "Window flow acceptance failed: $($process.ExitCode)"}
} finally {
    $resolved=[IO.Path]::GetFullPath($temporary)
    $parent=[IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\')+'\'
    if(-not $resolved.StartsWith($parent,[StringComparison]::OrdinalIgnoreCase) -or -not ([IO.Path]::GetFileName($resolved).StartsWith('codexweb-cua-flow-'))){throw 'Unsafe fixture cleanup path'}
    Remove-Item -LiteralPath $resolved -Recurse -Force
}
