[CmdletBinding()]
param()
$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue'
$qa=Join-Path $env:LOCALAPPDATA ('CodexWeb\qa-file-launch-'+[guid]::NewGuid().ToString())
New-Item -ItemType Directory -Path $qa|Out-Null
$node=(Get-Command node.exe).Source;$worker=Join-Path $env:LOCALAPPDATA 'CodexWeb\file-launch\FileLaunchWorker.cjs'
$program=@'
using System;using System.IO;using System.Windows.Forms;using System.Diagnostics;
public class LaunchQa { [STAThread] public static void Main(){
 var form=new Form();form.Text="CodexWeb launch verification";form.Width=340;form.Height=170;
 form.Controls.Add(new Label {Text="Exact-file launch verified.\nThis window closes automatically.",Dock=DockStyle.Fill});
 form.Shown+=(s,e)=>{File.AppendAllText(Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"visible.txt"),Process.GetCurrentProcess().SessionId+":"+form.Handle.ToInt64()+"\n");};
 var timer=new Timer();timer.Interval=7000;timer.Tick+=(s,e)=>form.Close();timer.Start();Application.Run(form);
}}
'@
Add-Type -TypeDefinition $program -ReferencedAssemblies System.Windows.Forms,System.Drawing -OutputAssembly (Join-Path $qa 'Demo.exe') -OutputType WindowsApplication
[IO.File]::WriteAllText((Join-Path $qa 'run.cmd'),"@echo off`r`n`"%~dp0Demo.exe`"`r`nexit /b 7`r`n",[Text.UTF8Encoding]::new($false))
[IO.File]::WriteAllText((Join-Path $qa 'run.ps1'),'Start-Process -FilePath (Join-Path $PSScriptRoot ''Demo.exe'') -Wait; exit 9',[Text.UTF8Encoding]::new($false))
function Request($q){$r=(@{root=$qa;request=$q}|ConvertTo-Json -Depth 8 -Compress)|& $node $worker request;$v=$r|ConvertFrom-Json;if(-not $v.ok){throw $v.code};return $v.value}
function Wait-State($id,$states){$deadline=[DateTime]::UtcNow.AddSeconds(35);do{$v=Request @{op='status';id=$id};if($v.state -in $states){return $v};Start-Sleep -Milliseconds 400}while([DateTime]::UtcNow -lt $deadline);throw 'Launch status timed out'}
$evidence=@()
foreach($file in @('Demo.exe','run.cmd','run.ps1')){
 $p=Request @{op='prepare';path=$file};$id=[guid]::NewGuid().ToString();$q=@{op='start';id=$id;path=$p.path;sha256=$p.sha256;bytes=$p.bytes;expiresAt=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()+30000}
 $first=Request $q;$again=Request $q;if($first.id -ne $again.id){throw 'Duplicate launch identity'}
 $running=Wait-State $id @('running','exited','failed','unknown');if($running.state -notin @('running','exited')){throw ($running|ConvertTo-Json -Compress)}
 $process=Get-Process -Id $running.pid -ErrorAction SilentlyContinue;$session=if($process){$process.SessionId}else{-1};if($session -eq 0){throw 'Session zero launch'}
 $done=Wait-State $id @('exited','failed','unknown');if($done.state -ne 'exited'){throw ($done|ConvertTo-Json -Compress)}
 $evidence+=@{file=$file;state=$done.state;exitCode=$done.exitCode;session=$session;id=$id}
}
$visible=@(Get-Content -LiteralPath (Join-Path $qa 'visible.txt'));if($visible.Count -ne 3 -or @($visible|Where-Object {$_ -notmatch '^[1-9]\d*:[1-9]\d*$'}).Count){throw 'Visible window evidence mismatch'}
$p=Request @{op='prepare';path='run.cmd'};[IO.File]::AppendAllText((Join-Path $qa 'run.cmd'),'rem changed');$rejected=$false
try{$null=Request @{op='start';id=[guid]::NewGuid().ToString();path=$p.path;sha256=$p.sha256;bytes=$p.bytes;expiresAt=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()+30000}}catch{if($_.Exception.Message -eq 'LAUNCH_CHANGED'){$rejected=$true}else{throw}}
if(-not $rejected){throw 'Changed file accepted'}
[ordered]@{installedHelper=$true;visibleWindows=$visible.Count;duplicatePrevented=$true;changedRejected=$rejected;operations=$evidence;fixture=$qa}|ConvertTo-Json -Depth 8 -Compress
