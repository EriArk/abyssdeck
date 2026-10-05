# Real offscreen HWNDs exercise dialog ownership and return without app input.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$temporary = Join-Path ([IO.Path]::GetTempPath()) ('codexweb-cua-windows-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $temporary | Out-Null
try {
    $binary = Join-Path $temporary 'ComputerUse.dll'
    & "$env:WINDIR\Microsoft.NET\Framework64\v4.0.30319\csc.exe" /nologo /target:library /platform:x64 /r:System.Web.Extensions.dll /r:System.Drawing.dll "/out:$binary" (Join-Path $root 'ops\windows\computer-use\ComputerUse.cs')
    if ($LASTEXITCODE -ne 0) { throw 'Compilation failed' }
    $assembly = [Reflection.Assembly]::Load([IO.File]::ReadAllBytes($binary))
    $type = $assembly.GetType('CodexWeb.ComputerUse.Program')
    $flags = [Reflection.BindingFlags]'NonPublic,Static'
    function Invoke-Private([string]$Name, [object[]]$Values) { $type.GetMethod($Name,$flags).Invoke($null,$Values) }
    function Assert-Throws([scriptblock]$Action, [string]$Code) {
        try { & $Action | Out-Null } catch { if ($_.Exception.ToString().Contains($Code)) { return }; throw }
        throw "Expected rejection: $Code"
    }
    Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class WindowFixture {
    [DllImport("user32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
    static extern IntPtr CreateWindowEx(uint ex, string cls, string title, uint style, int x, int y, int w, int h, IntPtr owner, IntPtr menu, IntPtr instance, IntPtr data);
    [DllImport("user32.dll")] public static extern bool DestroyWindow(IntPtr window);
    [DllImport("user32.dll")] public static extern bool EnableWindow(IntPtr window, bool enabled);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr window, int command);
    public static IntPtr Create(IntPtr owner) {
        // Hidden initially, then SW_SHOWNOACTIVATE: real untitled, activatable
        // windows without bringing an offscreen fixture to the foreground.
        var h = CreateWindowEx(0x80, "STATIC", "", 0x80000000, -20000, -20000, 400, 300, owner, IntPtr.Zero, IntPtr.Zero, IntPtr.Zero);
        if(h == IntPtr.Zero) throw new Exception("Fixture window creation failed");
        ShowWindow(h, 4); return h;
    }
}
'@
    $windows = [Collections.Generic.List[IntPtr]]::new()
    function New-Window([IntPtr]$Owner) { $h=[WindowFixture]::Create($Owner);$windows.Add($h);return $h }
    try {
        $parent = New-Window ([IntPtr]::Zero)
        $other = New-Window ([IntPtr]::Zero)
        $bound = Invoke-Private 'Bind' @($parent,'client-a')
        if ($null -eq $bound) { throw 'Untitled window missing' }
        $token = Invoke-Private 'Remember' @($bound)
        if ((Invoke-Private 'Remember' @((Invoke-Private 'Bind' @($parent,'client-a')))) -ne $token) { throw 'Window ID should remain stable within the client' }
        if ((Invoke-Private 'Remember' @((Invoke-Private 'Bind' @($parent,'client-b')))) -eq $token) { throw 'Window ID crossed client boundary' }
        $dialog = New-Window $parent
        [void][WindowFixture]::EnableWindow($parent,$false)
        $resolved = Invoke-Private 'ResolveObservationTarget' @($bound)
        if ($resolved.Hwnd -ne $dialog) { throw 'Disabled owner did not follow dialog' }
        Invoke-Private 'Remember' @($resolved) | Out-Null
        if ($resolved.Parent.Hwnd -ne $parent) { throw 'Owner identity not remembered' }
        # Same-process unrelated windows must not become an automatic dialog.
        if (Invoke-Private 'OwnedBy' @($other,$parent)) { throw 'Ownership inferred from process' }
        if ((Invoke-Private 'ResolveObservationTarget' @((Invoke-Private 'Bind' @($other,'client-a')))).Hwnd -ne $other) { throw 'Cannot switch to another application window' }
        $nested = New-Window $dialog
        [void][WindowFixture]::EnableWindow($dialog,$false)
        $nestedTarget = Invoke-Private 'ResolveObservationTarget' @($bound)
        if ($nestedTarget.Hwnd -ne $nested) { throw 'Nested dialog not followed' }
        Invoke-Private 'Remember' @($nestedTarget) | Out-Null
        [void][WindowFixture]::DestroyWindow($nested);[void]$windows.Remove($nested)
        [void][WindowFixture]::EnableWindow($dialog,$true)
        if ((Invoke-Private 'ResolveObservationTarget' @($nestedTarget)).Hwnd -ne $dialog) { throw 'Closed nested dialog did not return to owner' }
        [void][WindowFixture]::DestroyWindow($dialog);[void]$windows.Remove($dialog)
        [void][WindowFixture]::EnableWindow($parent,$true)
        if ((Invoke-Private 'ResolveObservationTarget' @($nestedTarget)).Hwnd -ne $parent) { throw 'Closed picker did not return to application' }
        # Recycled identity is rejected instead of jumping through remembered owners.
        $wrong = Invoke-Private 'Bind' @($parent,'client-a'); $wrong.Started++
        Assert-Throws { Invoke-Private 'ResolveObservationTarget' @($wrong) } 'WINDOW_CHANGED'
        Assert-Throws { Invoke-Private 'Validate' @($resolved) } 'WINDOW_CHANGED'
        # Actual pointer admission remains local, even though capture tolerates overlap.
        $point = [Activator]::CreateInstance($type.GetNestedType('Point',[Reflection.BindingFlags]::NonPublic))
        $point.X=0;$point.Y=0
        Assert-Throws { Invoke-Private 'RequirePointTarget' @($bound,$point) } 'POINT_NOT_IN_TARGET'
        Write-Output 'PASS: untitled windows, stable scoped IDs, modal/nested handoff, owner return, explicit other-window selection, recycled identity rejection and point admission.'
    } finally { foreach ($window in $windows) { [void][WindowFixture]::DestroyWindow($window) } }
} finally {
    $resolvedPath = [IO.Path]::GetFullPath($temporary)
    $expectedParent = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\')+'\'
    if (-not $resolvedPath.StartsWith($expectedParent,[StringComparison]::OrdinalIgnoreCase) -or -not ([IO.Path]::GetFileName($resolvedPath).StartsWith('codexweb-cua-windows-'))) { throw 'Unsafe temporary cleanup path' }
    Remove-Item -LiteralPath $resolvedPath -Recurse -Force
}
