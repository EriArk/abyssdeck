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
    [ordered]@{ id=$definition[0]; title=$definition[1]; folder=$definition[2]; installed=[bool]$task; owned=$mine; known=$tasksKnown; state=$(if ($task -and $mine) { $task.State.ToString() } else { 'Unknown' }); executable=$executable; executableExists=[bool]($registered -and (Test-Path -LiteralPath $executable -PathType Leaf) -and (Test-Path -LiteralPath $module -PathType Leaf)) }
}
# No unrelated processes/windows, titles, arguments or environment variables.
$codexProcesses = @(Get-CimInstance Win32_Process -Filter "Name='codex.exe'" -ErrorAction SilentlyContinue | Where-Object {
    $_.ExecutablePath -and $_.ExecutablePath.StartsWith((Join-Path $env:LOCALAPPDATA 'CodexWeb\companion-persistent\runtime\'), [StringComparison]::OrdinalIgnoreCase) -and $_.SessionId -eq $session
} | ForEach-Object { [ordered]@{ pid=$_.ProcessId; started=$_.CreationDate.ToUniversalTime().ToString('o') } })
[ordered]@{ sid=$sid; user=$identity.Name; computer=$env:COMPUTERNAME; session=$session; components=@($components); nativeProcesses=$codexProcesses } | ConvertTo-Json -Depth 6 -Compress
