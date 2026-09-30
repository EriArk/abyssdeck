# Stable MCP entry point. Releases remain beside each other until callers exit.
$ErrorActionPreference = 'Stop'
$utf8 = [Text.UTF8Encoding]::new($false)
[Console]::InputEncoding = $utf8
[Console]::OutputEncoding = $utf8
$OutputEncoding = $utf8
$release = Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot 'current.json') | ConvertFrom-Json
if ($release.release -notmatch '^[a-f0-9]{64}$') { throw 'Invalid Computer Use release' }
$client = Join-Path $PSScriptRoot ('runtime\' + $release.release + '\CodexWebComputerUse.exe')
if (-not (Test-Path -LiteralPath $client -PathType Leaf) -or (Get-FileHash -LiteralPath $client -Algorithm SHA256).Hash -ne $release.clientSha256) { throw 'Computer Use integrity check failed' }
& $client --mcp
exit $LASTEXITCODE
