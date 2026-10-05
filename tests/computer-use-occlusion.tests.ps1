# Native window regression. Creates only offscreen fixture windows; no input,
# activation, clipboard, screenshots or changes to the user's applications.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$temporary = Join-Path ([IO.Path]::GetTempPath()) ('codexweb-cua-occlusion-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $temporary | Out-Null
try {
    $binary = Join-Path $temporary 'ComputerUse.dll'
    & "$env:WINDIR\Microsoft.NET\Framework64\v4.0.30319\csc.exe" /nologo /target:library /platform:x64 /r:System.Web.Extensions.dll /r:System.Drawing.dll "/out:$binary" (Join-Path $root 'ops\windows\computer-use\ComputerUse.cs')
    if ($LASTEXITCODE -ne 0) { throw 'Compilation failed' }
    $assembly = [Reflection.Assembly]::Load([IO.File]::ReadAllBytes($binary))
    $type = $assembly.GetType('CodexWeb.ComputerUse.Program')
    $flags = [Reflection.BindingFlags]'NonPublic,Static'
    function Invoke-Private([string]$Name, [object[]]$Values) { $type.GetMethod($Name,$flags).Invoke($null,$Values) }
    Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class OcclusionFixture {
    [DllImport("user32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
    static extern IntPtr CreateWindowEx(uint ex, string cls, string title, uint style, int x, int y, int w, int h, IntPtr owner, IntPtr menu, IntPtr instance, IntPtr data);
    [DllImport("user32.dll")] public static extern bool DestroyWindow(IntPtr window);
    public static IntPtr Create(uint ex, IntPtr owner) {
        var h = CreateWindowEx(ex, "STATIC", "", 0x90000000, -20000, -20000, 400, 300, owner, IntPtr.Zero, IntPtr.Zero, IntPtr.Zero);
        if(h == IntPtr.Zero) throw new Exception("Fixture window creation failed: " + Marshal.GetLastWin32Error());
        return h;
    }
}
'@
    $fixture = [OcclusionFixture]::Create(0x08000080, [IntPtr]::Zero)
    try {
        $target = [Activator]::CreateInstance($type.GetNestedType('Target',[Reflection.BindingFlags]::NonPublic),$true)
        $target.Hwnd = $fixture
        $rect = [Activator]::CreateInstance($type.GetNestedType('Rect',[Reflection.BindingFlags]::NonPublic))
        $rect.Left=-20000; $rect.Top=-20000; $rect.Right=-19600; $rect.Bottom=-19700
        Invoke-Private 'Unobscured' @($target,$rect)
        # Exact WebView2 popup styles; same-user owned NOACTIVATE/TOOL/TRANSPARENT.
        # No class-name or empty-title allowlist: ownership/styles must be real.
        foreach ($case in @(
            @{Name='owned passive surface'; Styles=0x082000a0; Owner=$fixture; Allowed=$true},
            @{Name='foreign passive surface'; Styles=0x082000a0; Owner=[IntPtr]::Zero; Allowed=$false},
            @{Name='owned dialog'; Styles=0x08000000; Owner=$fixture; Allowed=$false},
            @{Name='owned tool without transparency'; Styles=0x08000080; Owner=$fixture; Allowed=$false},
            @{Name='owned activatable tool'; Styles=0x000000a0; Owner=$fixture; Allowed=$false},
            @{Name='owned transparent non-tool'; Styles=0x08000020; Owner=$fixture; Allowed=$false}
        )) {
            $popup = [OcclusionFixture]::Create($case.Styles, $case.Owner)
            try {
                $allowed = Invoke-Private 'PassiveOwnedOverlay' @($popup,$fixture)
                if ($allowed -ne $case.Allowed) { throw "Wrong classification: $($case.Name)" }
                $blocked = $false
                try { Invoke-Private 'Unobscured' @($target,$rect) }
                catch { if (-not $_.Exception.ToString().Contains('WINDOW_OCCLUDED')) { throw }; $blocked=$true }
                if ($blocked -eq $case.Allowed) { throw "Wrong occlusion admission: $($case.Name)" }
                Write-Output "PASS: $($case.Name)"
            } finally { [void][OcclusionFixture]::DestroyWindow($popup) }
        }
        Invoke-Private 'Unobscured' @($target,$rect)
    } finally { [void][OcclusionFixture]::DestroyWindow($fixture) }
} finally {
    $resolved = [IO.Path]::GetFullPath($temporary)
    $expectedParent = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\')+'\'
    if (-not $resolved.StartsWith($expectedParent,[StringComparison]::OrdinalIgnoreCase) -or -not ([IO.Path]::GetFileName($resolved).StartsWith('codexweb-cua-occlusion-'))) { throw 'Unsafe temporary cleanup path' }
    Remove-Item -LiteralPath $resolved -Recurse -Force
}
