$ErrorActionPreference='Stop'
$pointer=Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot 'current.json') | ConvertFrom-Json
if($pointer.release -notmatch '^[a-f0-9]{64}$'){throw 'Invalid browser release.'}
$root=Join-Path $PSScriptRoot ('runtime/'+$pointer.release)
foreach($entry in $pointer.files.PSObject.Properties){
    if($entry.Name -notmatch '^[A-Za-z0-9_.-]+$'){throw 'Invalid browser file.'}
    if((Get-FileHash -LiteralPath (Join-Path $root $entry.Name) -Algorithm SHA256).Hash -ne $entry.Value){throw 'Browser release integrity failure.'}
}
& (Join-Path $root 'CodexWebBrowser.exe') --mcp
exit $LASTEXITCODE
