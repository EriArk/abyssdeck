[CmdletBinding()]
param([Parameter(Mandatory=$true)][ValidatePattern('^[a-fA-F0-9-]{36}$')][string]$OperationId)
$ErrorActionPreference='Stop'
$directory=Join-Path $PSScriptRoot 'state'
$record=Get-Content -LiteralPath (Join-Path $directory ($OperationId+'.request.json')) -Raw -Encoding UTF8 | ConvertFrom-Json
$progress=Join-Path $directory ($OperationId+'.progress.json')
$child=$null;$pidValue=$null;$launched=$false
function Save-Progress([string]$stage,[string]$code='', $exitCode=$null) {
 $data=@{state=$stage;updatedAt=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()}
 if($code){$data.code=$code};if($pidValue){$data.pid=$pidValue};if($null -ne $exitCode){$data.exitCode=$exitCode}
 $temp=$progress+'.tmp';[IO.File]::WriteAllText($temp,($data|ConvertTo-Json -Compress),[Text.UTF8Encoding]::new($false))
 if(Test-Path -LiteralPath $progress){[IO.File]::Replace($temp,$progress,[NullString]::Value)}else{[IO.File]::Move($temp,$progress)}
}
try {
 if([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() -gt [long]$record.expiresAt){throw 'LAUNCH_EXPIRED'}
 if((Get-Process -Id $PID).SessionId -eq 0){throw 'LAUNCH_UNAVAILABLE'}
 Save-Progress 'launching'
 Add-Type -Path (Join-Path $PSScriptRoot 'ExactFileLaunch.cs')
 $child=[ExactFileLaunch]::new([string]$record.root,[string]$record.path,[string]$record.sha256,[long]$record.bytes,[long]$record.expiresAt)
 $launched=$true;$pidValue=$child.Process.Id
 $deadline=[DateTime]::UtcNow.AddHours(2)
 while(-not $child.Process.HasExited -and [DateTime]::UtcNow -lt $deadline){Save-Progress 'running';Start-Sleep -Seconds 2;$child.Process.Refresh()}
 if($child.Process.HasExited){Save-Progress 'exited' '' $child.Process.ExitCode}else{Save-Progress 'unknown' 'LAUNCH_UNKNOWN'}
}catch{
 $code='LAUNCH_FAILED';if($_.Exception.Message -match 'LAUNCH_[A-Z_]+'){$code=$matches[0]}
 if($launched){Save-Progress 'unknown' 'LAUNCH_UNKNOWN'}else{Save-Progress 'failed' $code}
}finally{if($child){$child.Dispose()}} # Never terminate the launched app or unrelated processes.
