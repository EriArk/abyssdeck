$ErrorActionPreference = 'Stop'
$taskRoot = Join-Path ([IO.Path]::GetTempPath()) ('codex-broker-test-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $taskRoot | Out-Null
$server = $null
$clients = [Collections.Generic.List[Diagnostics.Process]]::new()
$compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
function Start-ProcessHidden([string]$path, [string]$arguments) {
    $p = [Diagnostics.Process]::new()
    $p.StartInfo = [Diagnostics.ProcessStartInfo]::new($path, $arguments)
    $p.StartInfo.UseShellExecute = $false
    $p.StartInfo.CreateNoWindow = $true
    $p.StartInfo.RedirectStandardInput = $true
    $p.StartInfo.RedirectStandardOutput = $true
    $p.StartInfo.RedirectStandardError = $true
    if (-not $p.Start()) { throw 'Start failed' }
    return $p
}
function Write-Frame($p, $value) { $p.StandardInput.WriteLine(($value | ConvertTo-Json -Depth 20 -Compress)); $p.StandardInput.Flush() }
function Read-Frame($p) {
    $task = $p.StandardOutput.ReadLineAsync()
    if (-not $task.Wait(8000)) { throw 'Read timed out' }
    if (-not $task.Result) { throw 'Unexpected disconnect' }
    return ($task.Result | ConvertFrom-Json)
}
function Open-Controller($entry, [bool]$create) {
    $p = Start-ProcessHidden (Join-Path $taskRoot 'Bridge.exe') '--runtime ignored'
    $clients.Add($p)
    Write-Frame $p @{binding=$entry.binding;capability=$entry.capability;cwd=$taskRoot;create=$create}
    Write-Frame $p @{id=1;method='initialize';params=@{}}
    $hello = Read-Frame $p
    if ($hello.result.companion.protocol -ne 2) { throw 'Missing protocol' }
    if ($entry.pid -and $entry.pid -ne $hello.result.companion.pid) { throw 'Native process replaced' }
    $entry.pid = $hello.result.companion.pid
    Write-Frame $p @{method='initialized';params=@{}}
    return $p
}
try {
    # Compile an isolated pipe namespace; never connect to the installed Companion.
    $source = [IO.File]::ReadAllText((Join-Path $PSScriptRoot '../ops/windows/companion/CodexWebBridge.cs'))
    $source = $source.Replace('"codex-web-" + WindowsIdentity', ('"codex-test-' + [Guid]::NewGuid().ToString('N') + '-" + WindowsIdentity'))
    [IO.File]::WriteAllText((Join-Path $taskRoot 'Bridge.cs'), $source)
    & $compiler /nologo /target:exe /platform:x64 /r:System.Web.Extensions.dll "/out:$taskRoot\Bridge.exe" "$taskRoot\Bridge.cs" (Join-Path $PSScriptRoot '../ops/windows/companion/RuntimeBroker.cs')
    if ($LASTEXITCODE -ne 0) { throw 'Broker compilation failed' }
    [IO.File]::WriteAllText((Join-Path $taskRoot 'Fake.cs'), @'
using System; using System.Collections.Generic; using System.Threading.Tasks; using System.Web.Script.Serialization;
class Fake {
 static object gate=new object(); static JavaScriptSerializer json=new JavaScriptSerializer(); static object question; static string thread,turn;
 static void Send(object v) { lock(gate) { Console.WriteLine(json.Serialize(v)); Console.Out.Flush(); } }
 static void Main() {
  string line; while((line=Console.ReadLine())!=null) {
   var v=json.Deserialize<Dictionary<string,object>>(line); object id; v.TryGetValue("id",out id);
   string method=v.ContainsKey("method")?(string)v["method"]:null;
   if(method=="initialize") Send(new {id=id,result=new {codexHome="fixture",userAgent="codex/0.153.4"}});
   else if(method=="turn/start") {
    thread="thread-"+Guid.NewGuid();turn="turn-"+Guid.NewGuid();
    Send(new {id=id,result=new {turn=new {id=turn,status="inProgress"}}});
    Send(new {method="turn/started",@params=new {threadId=thread,turn=new {id=turn,status="inProgress"}}});
    Task.Run(async delegate {await Task.Delay(900);question="approval-"+Guid.NewGuid();Send(new {id=question,method="item/commandExecution/requestApproval",@params=new {threadId=thread,turnId=turn,command="fixture"}});});
   } else if(method==null && id!=null && id.Equals(question)) {
    Send(new {method="serverRequest/resolved",@params=new {threadId=thread,requestId=question}});
    Send(new {method="turn/completed",@params=new {threadId=thread,turn=new {id=turn,status="completed"}}});
   } else if(method!=null && id!=null) Send(new {id=id,result=new {ok=true}});
  }
 }
}
'@)
    & $compiler /nologo /target:exe /platform:x64 /r:System.Web.Extensions.dll "/out:$taskRoot\Fake.exe" "$taskRoot\Fake.cs"
    if ($LASTEXITCODE -ne 0) { throw 'Fixture compilation failed' }
    [IO.File]::WriteAllText((Join-Path $taskRoot 'config.json'), (@{codexCommand="$taskRoot\Fake.exe";workingDirectories=@($taskRoot)} | ConvertTo-Json))
    $server = Start-ProcessHidden "$taskRoot\Bridge.exe" ('--server "' + $taskRoot + '\config.json"')
    Start-Sleep -Milliseconds 400
    $entries = @()
    foreach ($n in 1..5) {
        $entry = @{capability=([Guid]::NewGuid().ToString('N')+[Guid]::NewGuid().ToString('N'));binding=([Guid]::NewGuid().ToString('N')+[Guid]::NewGuid().ToString('N'));pid=0}
        $p = Open-Controller $entry $true
        Write-Frame $p @{id=2;method='companion/ready';params=@{}}
        if ((Read-Frame $p).result.pending.Count -ne 0) { throw 'Unexpected pending request' }
        Write-Frame $p @{id=3;method='turn/start';params=@{}}
        if ((Read-Frame $p).result.turn.status -ne 'inProgress') { throw 'Turn not started' }
        if ((Read-Frame $p).method -ne 'turn/started') { throw 'Missing start notification' }
        # Competing controller must lose without evicting the original writer.
        $other = Start-ProcessHidden "$taskRoot\Bridge.exe" '--runtime ignored'; $clients.Add($other)
        Write-Frame $other @{binding=$entry.binding;capability=$entry.capability;cwd=$taskRoot;create=$false}
        if (-not $other.WaitForExit(3000) -or $other.ExitCode -eq 0) { throw 'Split brain admitted' }
        $p.Kill(); $p.WaitForExit()
        $entries += $entry
    }
    Start-Sleep -Milliseconds 1200
    foreach ($entry in $entries) {
        $p = Open-Controller $entry $false
        Write-Frame $p @{id=2;method='companion/ready';params=@{}}
        $pending = (Read-Frame $p).result.pending
        if ($pending.Count -ne 1) { throw 'Offline approval lost or duplicated' }
        Write-Frame $p @{id=25;method='companion/close';params=@{}}
        if ((Read-Frame $p).error.message -ne 'RUNTIME_BUSY') { throw 'Busy native runtime was closed' }
        Write-Frame $p @{id=$pending[0].id;result=@{decision='accept'}}
        if ((Read-Frame $p).method -ne 'serverRequest/resolved') { throw 'Approval not resolved' }
        if ((Read-Frame $p).method -ne 'turn/completed') { throw 'Turn did not continue' }
        Write-Frame $p @{id=3;method='companion/inspect';params=@{}}
        if ((Read-Frame $p).result.active -ne 0) { throw 'Still active' }
        Write-Frame $p @{id=4;method='companion/close';params=@{}}
        if (-not (Read-Frame $p).result.closed) { throw 'Idle runtime not closed' }
    }
    $missing = Start-ProcessHidden "$taskRoot\Bridge.exe" '--runtime ignored'; $clients.Add($missing)
    Write-Frame $missing @{binding=$entries[0].binding;capability=$entries[0].capability;cwd=$taskRoot;create=$false}
    if (-not $missing.WaitForExit(3000) -or $missing.ExitCode -ne 42) { throw 'Missing runtime was recreated or ambiguous' }
    Write-Output 'Five persistent runtimes: detach, same PID reattach, offline approval, single controller and explicit idle close passed.'
} finally {
    foreach ($p in $clients) { try { if (-not $p.HasExited) { $p.Kill(); $p.WaitForExit() }; $p.Dispose() } catch {} }
    if ($server) { try { if (-not $server.HasExited) { $server.Kill(); $server.WaitForExit() }; $server.Dispose() } catch {} }
    $resolved = [IO.Path]::GetFullPath($taskRoot)
    $temporary = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\') + '\'
    if (-not $resolved.StartsWith($temporary,[StringComparison]::OrdinalIgnoreCase) -or (Split-Path -Leaf $resolved) -notlike 'codex-broker-test-*') { throw 'Unexpected cleanup path' }
    Remove-Item -LiteralPath $resolved -Recurse -Force
}
