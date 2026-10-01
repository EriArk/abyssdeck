[CmdletBinding()]
param([string]$WebViewSdk = (Join-Path $env:USERPROFILE '.nuget/packages/microsoft.web.webview2/1.0.1210.39'),[Parameter(Mandatory=$true)][string]$OutputDirectory)
$ErrorActionPreference='Stop'
if(Test-Path -LiteralPath $OutputDirectory){throw 'Use a new browser build directory.'}
New-Item -ItemType Directory -Path $OutputDirectory | Out-Null
$sdk=[IO.Path]::GetFullPath($WebViewSdk)
foreach($name in @('Core','WinForms')){
    Copy-Item -LiteralPath (Join-Path $sdk ('lib/net45/Microsoft.Web.WebView2.'+$name+'.dll')) -Destination $OutputDirectory
}
Copy-Item -LiteralPath (Join-Path $sdk 'runtimes/win-x64/native/WebView2Loader.dll') -Destination $OutputDirectory
$compiler=Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
foreach($build in @(@('exe','CodexWebBrowser.exe'),@('winexe','CodexWebBrowserHost.exe'))){
    & $compiler /nologo /codepage:65001 "/target:$($build[0])" /platform:x64 /r:System.Web.Extensions.dll /r:System.Drawing.dll /r:System.Windows.Forms.dll /r:System.Core.dll ("/r:"+(Join-Path $OutputDirectory 'Microsoft.Web.WebView2.Core.dll')) ("/r:"+(Join-Path $OutputDirectory 'Microsoft.Web.WebView2.WinForms.dll')) ("/out:"+(Join-Path $OutputDirectory $build[1])) (Join-Path $PSScriptRoot 'browser/Browser.cs')
    if($LASTEXITCODE -ne 0){throw 'Browser compilation failed.'}
}
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'browser/Start-Browser.ps1') -Destination $OutputDirectory
$files=[ordered]@{}
foreach($file in Get-ChildItem -LiteralPath $OutputDirectory -File | Sort-Object Name){$files[$file.Name]=(Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant()}
$json=$files | ConvertTo-Json -Compress
$hash=[Security.Cryptography.SHA256]::Create()
try{$release=([BitConverter]::ToString($hash.ComputeHash([Text.Encoding]::UTF8.GetBytes($json)))).Replace('-','').ToLowerInvariant()}finally{$hash.Dispose()}
[IO.File]::WriteAllText((Join-Path $OutputDirectory 'release.json'),(@{release=$release;files=$files;version='1.0.0'} | ConvertTo-Json -Depth 4),[Text.UTF8Encoding]::new($false))
@{release=$release;directory=[IO.Path]::GetFullPath($OutputDirectory)} | ConvertTo-Json -Compress
