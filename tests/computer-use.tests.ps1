# Focused pure protocol/capability regressions; never launches or controls an app.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$temporary = Join-Path ([IO.Path]::GetTempPath()) ('codexweb-cua-tests-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $temporary | Out-Null
try {
    $binary = Join-Path $temporary 'ComputerUse.dll'
    & "$env:WINDIR\Microsoft.NET\Framework64\v4.0.30319\csc.exe" /nologo /target:library /platform:x64 /r:System.Web.Extensions.dll /r:System.Drawing.dll "/out:$binary" (Join-Path $root 'ops\windows\computer-use\ComputerUse.cs')
    if ($LASTEXITCODE -ne 0) { throw 'Compilation failed' }
    # Load bytes so cleanup does not depend on Windows assembly file locking.
    $assembly = [Reflection.Assembly]::Load([IO.File]::ReadAllBytes($binary))
    $type = $assembly.GetType('CodexWeb.ComputerUse.Program')
    $flags = [Reflection.BindingFlags]'NonPublic,Static'
    function Invoke-Private([string]$Name, [object[]]$Values) { $type.GetMethod($Name,$flags).Invoke($null,$Values) }
    function Assert-Throws([scriptblock]$Action, [string]$Code) {
        try { & $Action | Out-Null } catch { if ($_.Exception.ToString().Contains($Code)) { return }; throw }
        throw "Expected rejection: $Code"
    }
    $keys = Invoke-Private 'ParseKeys' @('CTRL+SHIFT+A')
    if (($keys -join ',') -ne '17,16,65') { throw 'Modifier order changed' }
    if (((Invoke-Private 'ParseKeys' @('WIN+R')) -join ',') -ne '91,82') { throw 'Windows modifier rejected' }
    if (((Invoke-Private 'ParseKeys' @('CTRL+RWIN+A')) -join ',') -ne '17,92,65') { throw 'Right Windows modifier order changed' }
    Assert-Throws { Invoke-Private 'ParseKeys' @('WIN+LWIN') } 'INVALID_KEY'
    foreach ($key in @([uint16]91,[uint16]92)) { if ((Invoke-Private 'Extended' @($key)) -ne 1) { throw 'Windows key needs extended input flag' } }
    Assert-Throws { Invoke-Private 'ParseKeys' @('A+B') } 'INVALID_KEY'
    Assert-Throws { Invoke-Private 'ReadBounded' @([IO.StringReader]::new("12345`n"),4) } 'InvalidDataException'
    if ((Invoke-Private 'ReadBounded' @([IO.StringReader]::new("1234`r`n"),5)) -ne '1234') { throw 'Frame changed bytes' }
    $registry = $type.GetField('Observations',$flags).GetValue($null)
    function New-Observation([string]$Client,[int]$AgeSeconds) {
        $target = [Activator]::CreateInstance($type.GetNestedType('Target',[Reflection.BindingFlags]::NonPublic),$true)
        $target.Client = $Client
        $observation = [Activator]::CreateInstance($type.GetNestedType('Observation',[Reflection.BindingFlags]::NonPublic),$true)
        $observation.Target = $target
        $observation.Created = [DateTime]::UtcNow.AddSeconds(-$AgeSeconds)
        return $observation
    }
    $registry.Add('fresh',(New-Observation 'client-a' 0))
    $registry.Add('other',(New-Observation 'client-b' 0))
    Assert-Throws { Invoke-Private 'TakeObservation' @('client-b','fresh') } 'OBSERVATION_EXPIRED'
    if ($registry.Count -ne 2) { throw 'Cross-client attempt consumed a capability' }
    Invoke-Private 'TakeObservation' @('client-a','fresh') | Out-Null
    if ($registry.Count -ne 0) { throw 'Input must invalidate all desktop observations' }
    Assert-Throws { Invoke-Private 'TakeObservation' @('client-a','fresh') } 'OBSERVATION_EXPIRED'
    $registry.Add('stale',(New-Observation 'client-a' 91))
    Assert-Throws { Invoke-Private 'TakeObservation' @('client-a','stale') } 'OBSERVATION_EXPIRED'
    Invoke-Private 'Prune' @() | Out-Null
    if ($registry.Count -ne 0) { throw 'Expired observations retained' }
    $schema = Invoke-Private 'Tools' @()
    if ($schema.Count -ne 4) { throw 'Expected four independent tools' }
    $instructions = $type.GetField('Instructions',$flags).GetRawConstantValue()
    if (-not $instructions.Contains('including ordinary sign-in and authorization') -or -not $instructions.Contains('masked password fields') -or $instructions.Contains('Codex, authentication,')) { throw 'MCP instructions incorrectly prohibit requested ordinary login' }
    if (-not $instructions.Contains('conversation history') -or -not $instructions.Contains('never automatically replay')) { throw 'Login permission lost secret-history or uncertain-input guidance' }
    if (-not $instructions.Contains('user-designated files/configurations') -or -not $instructions.Contains('Explicitly requested security/privacy settings changes') -or $instructions.Contains('Do not automate terminals')) { throw 'Explicitly authorized work is still categorically prohibited' }
    Write-Output 'PASS: keys, bounded frames, cross-client isolation, single use, cross-client invalidation, expiration, MCP schema and requested login contract; no GUI input.'
} finally {
    $resolved = [IO.Path]::GetFullPath($temporary)
    $expectedParent = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\')+'\'
    if (-not $resolved.StartsWith($expectedParent,[StringComparison]::OrdinalIgnoreCase) -or -not ([IO.Path]::GetFileName($resolved).StartsWith('codexweb-cua-tests-'))) { throw 'Unsafe temporary cleanup path' }
    Remove-Item -LiteralPath $resolved -Recurse -Force
}
