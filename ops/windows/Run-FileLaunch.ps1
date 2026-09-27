$ErrorActionPreference='Stop'
$config=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'config.json') -Raw -Encoding UTF8|ConvertFrom-Json
& $config.node (Join-Path $PSScriptRoot 'FileLaunchWorker.cjs') work
exit $LASTEXITCODE
