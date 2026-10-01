# Read-only current-user inventory. No task/process mutation, native controller,
# credentials, command-line logging or App Server launch.
[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$sid = $identity.User.Value
$session = [Diagnostics.Process]::GetCurrentProcess().SessionId
$definitions = @(
    @('CodexWebCompanionPersistent', 'Codex', 'companion-persistent', 'CodexWebCompanion.exe'),
    @('CodexWebCompanion', 'Совместимость', 'companion', 'CodexWebCompanion.exe'),
    @('CodexWebComputerUse', 'Computer Use', 'computer-use', ''),
    @('CodexWebDelivery', 'Файлы и результаты', 'delivery', 'Run-Delivery.ps1'),
    @('CodexWebFileLaunch', 'Открытие файлов', 'file-launch', 'Run-FileLaunch.ps1'),
    @('CodexWebProjectSetup', 'Проекты', 'project-setup', 'Run-ProjectSetup.ps1'),
    @('CodexWebGitHubReleases', 'GitHub', 'github-releases', 'Run-GitHubReleases.ps1'),
    @('CodexWebGuiPreview', 'Предпросмотр', 'gui-preview', 'Run-GuiPreview.ps1'),
    @('CodexWebDesktopRestart', 'Настольный Codex', 'desktop-control', 'CodexDesktopControl.ps1')
)
$taskMap = @{}
$tasksKnown = $true
try { foreach ($task in @(Get-ScheduledTask -TaskName 'CodexWeb*' -ErrorAction Stop)) { $taskMap[$task.TaskName] = $task } }
catch { $tasksKnown = $false }
$components = foreach ($definition in $definitions) {
    $task = $taskMap[$definition[0]]
    $mine = $false
    if ($task) {
        try {
            $principal = $task.Principal.UserId
            $principalSid = if ($principal -like 'S-1-*') { $principal } else { ([Security.Principal.NTAccount]::new($principal)).Translate([Security.Principal.SecurityIdentifier]).Value }
            $mine = $principalSid -eq $sid -and $task.Principal.LogonType -eq 'Interactive'
        } catch {}
    }
    $executable = if ($task -and $mine -and $task.Actions.Count -eq 1) { [string]$task.Actions[0].Execute } else { '' }
    $folder = Join-Path $env:LOCALAPPDATA ('CodexWeb/' + $definition[2])
    $module = if ($definition[3]) { Join-Path $folder $definition[3] } else { $executable }
    $registered = $false
    if ($task -and $mine -and $executable) {
        $registered = if ($definition[3] -like '*.ps1') { ([string]$task.Actions[0].Arguments).Contains('"' + $module + '"') } else { $executable.StartsWith($folder.TrimEnd('\') + '\', [StringComparison]::OrdinalIgnoreCase) }
    }
    $digest = ''
    if ($task -and $mine) { try { $sha=[Security.Cryptography.SHA256]::Create(); try { $digest=([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes((Export-ScheduledTask -TaskName $definition[0]))))).Replace('-','').ToLowerInvariant() } finally { $sha.Dispose() } } catch { $mine=$false } }
    if ($task -and $mine -and $definition[0] -in @('CodexWebCompanionPersistent','CodexWebDelivery','CodexWebProjectSetup','CodexWebGitHubReleases','CodexWebFileLaunch','CodexWebGuiPreview')) {
        try {
            $journalPath=Join-Path $env:LOCALAPPDATA ('CodexWeb\companion-app\workers\state\'+$definition[0]+'.json')
            if(Test-Path -LiteralPath $journalPath -PathType Leaf){
                if((Get-Item -LiteralPath $journalPath -Force).Attributes -band [IO.FileAttributes]::ReparsePoint -or (Get-Item -LiteralPath $journalPath).Length -gt 65536){throw 'WORKER_JOURNAL_CHANGED'}
                $journal=Get-Content -LiteralPath $journalPath -Raw -Encoding UTF8|ConvertFrom-Json
                if($journal.sid -cne $sid -or $journal.componentId -cne $definition[0] -or $journal.release -notmatch '^[a-f0-9]{64}$'){throw 'WORKER_JOURNAL_CHANGED'}
                $release=Join-Path $env:LOCALAPPDATA ('CodexWeb\companion-app\workers\releases\'+$journal.release)
                $launcher=Join-Path $release 'Start-ManagedWorker.ps1'
                $args='-NoLogo -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "'+$launcher+'" -ComponentId '+$definition[0]
                if($task.Actions[0].Arguments -ceq $args){
                    $registered=$false
                    $manifestPath=Join-Path $release 'worker.json'
                    if((Get-FileHash -LiteralPath $manifestPath -Algorithm SHA256).Hash.ToLowerInvariant() -cne $journal.release){throw 'WORKER_RELEASE_CHANGED'}
                    $manifest=Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8|ConvertFrom-Json
                    if($manifest.format -ne 1 -or $manifest.componentId -cne $definition[0] -or @($manifest.files.PSObject.Properties).Count -gt 16){throw 'WORKER_RELEASE_CHANGED'}
                    foreach($entry in $manifest.files.PSObject.Properties){
                        if($entry.Name -notmatch '^[A-Za-z0-9_.-]+$' -or $entry.Value -notmatch '^[a-f0-9]{64}$'){throw 'WORKER_RELEASE_CHANGED'}
                        $file=Join-Path $release $entry.Name
                        if((Get-Item -LiteralPath $file -Force).Attributes -band [IO.FileAttributes]::ReparsePoint -or (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant() -cne $entry.Value){throw 'WORKER_RELEASE_CHANGED'}
                    }
                    $registered=$journal.state -eq 'installed' -and $journal.taskDigest -ceq $digest -and $task.Actions[0].WorkingDirectory -ceq $folder
                    if($registered){$module=$launcher}
                }
            }
        } catch {$registered=$false}
    }
    [ordered]@{ id=$definition[0]; title=$definition[1]; folder=$definition[2]; installed=[bool]$task; owned=$mine; known=$tasksKnown; state=$(if ($task -and $mine) { $task.State.ToString() } else { 'Unknown' }); executable=$executable; executableExists=[bool]($registered -and (Test-Path -LiteralPath $executable -PathType Leaf) -and (Test-Path -LiteralPath $module -PathType Leaf)); taskDigest=$digest }
}
# No unrelated processes/windows, titles, arguments or environment variables.
$codexProcesses = @(Get-CimInstance Win32_Process -Filter "Name='codex.exe'" -ErrorAction SilentlyContinue | Where-Object {
    $_.ExecutablePath -and $_.ExecutablePath.StartsWith((Join-Path $env:LOCALAPPDATA 'CodexWeb\companion-persistent\runtime\'), [StringComparison]::OrdinalIgnoreCase) -and $_.SessionId -eq $session
} | ForEach-Object { [ordered]@{ pid=$_.ProcessId; started=$_.CreationDate.ToUniversalTime().ToString('o') } })
$env:PATH += ';'+[Environment]::GetEnvironmentVariable('PATH','Machine')+';'+[Environment]::GetEnvironmentVariable('PATH','User')
$requirements=@(
  [ordered]@{id='node';title='Node.js';ready=[bool](Get-Command node.exe -ErrorAction SilentlyContinue)},
  [ordered]@{id='git';title='Git';ready=[bool](Get-Command git.exe -ErrorAction SilentlyContinue)},
  [ordered]@{id='gh';title='GitHub CLI';ready=[bool](Get-Command gh.exe -ErrorAction SilentlyContinue)}
)
[ordered]@{ sid=$sid; user=$identity.Name; computer=$env:COMPUTERNAME; session=$session; components=@($components); nativeProcesses=$codexProcesses;requirements=$requirements } | ConvertTo-Json -Depth 6 -Compress
