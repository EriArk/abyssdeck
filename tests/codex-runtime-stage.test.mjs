import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

test('Windows runtime staging reuses exact packages and rejects incomplete, changed or redirected packages', {skip:process.platform !== 'win32'}, () => {
  const root=mkdtempSync(join(tmpdir(),'abyssdeck-runtime-test-'));
  try {
    const pkg=join(root,'runtime','0.162.1');
    const manifest={layoutVersion:1,version:'0.162.1',target:'x86_64-pc-windows-msvc',entrypoint:'bin/codex.exe',resourcesDir:'codex-resources',pathDir:'codex-path'};
    const files={};
    for(const [name,contents] of Object.entries({
      'codex-package.json':JSON.stringify(manifest),
      'bin/codex.exe':'fixture-executable',
      'bin/codex-code-mode-host.exe':'fixture-host',
      'codex-resources/codex-command-runner.exe':'fixture-runner',
      'codex-resources/codex-windows-sandbox-setup.exe':'fixture-sandbox',
      'codex-path/rg.exe':'fixture-search',
    })) {
      const path=join(pkg,name); mkdirSync(resolve(path,'..'),{recursive:true}); writeFileSync(path,contents);
      files[name.replaceAll('/','\\')]=createHash('sha256').update(contents).digest('hex');
    }
    writeFileSync(join(pkg,'abyssdeck-package.json'),JSON.stringify({version:'0.162.1',archiveSha256:'a'.repeat(64),files}));
    const script=join(root,'test.ps1');
    writeFileSync(script,`
param([string]$Stage,[string]$Root)
$ErrorActionPreference='Stop'
function Invoke-RestMethod { return @{tag_name='rust-v0.162.1';assets=@(@{name='codex-package-x86_64-pc-windows-msvc.tar.gz';digest=('sha256:'+('a'*64))})} }
function Rejected([scriptblock]$Action,[string]$Expected) {
  try { & $Action | Out-Null } catch { if($_.Exception.Message -like ('*'+$Expected+'*')) {return}; throw }
  throw ('Expected rejection: '+$Expected)
}
$runtime=Join-Path $Root 'runtime'
$first=& $Stage -Version 0.162.1 -RuntimeRoot $runtime
$second=& $Stage -Version 0.162.1 -RuntimeRoot $runtime
if($first -cne $second -or @(Get-ChildItem $runtime -Directory).Count -ne 1){throw 'Non-idempotent staging'}
Rejected { & $Stage -Version '../bad' -RuntimeRoot $runtime } 'stable release'
Rejected { & $Stage -RuntimeRoot 'relative' } 'absolute'
$exe=Join-Path $runtime '0.162.1\\bin\\codex.exe'
[IO.File]::WriteAllText($exe,'tampered')
Rejected { & $Stage -Version 0.162.1 -RuntimeRoot $runtime } 'file changed'
[IO.File]::WriteAllText($exe,'fixture-executable')
$receipt=Join-Path $runtime '0.162.1\\abyssdeck-package.json'
$original=[IO.File]::ReadAllText($receipt)
$data=$original|ConvertFrom-Json
$data.files.PSObject.Properties.Remove('bin\\codex.exe')
[IO.File]::WriteAllText($receipt,($data|ConvertTo-Json -Depth 5))
Rejected { & $Stage -Version 0.162.1 -RuntimeRoot $runtime } 'inventory changed'
[IO.File]::WriteAllText($receipt,$original)
$rg=Join-Path $runtime '0.162.1\\codex-path\\rg.exe'
[IO.File]::Move($rg,$rg+'.missing')
Rejected { & $Stage -Version 0.162.1 -RuntimeRoot $runtime } 'Incomplete package'
[IO.File]::Move($rg+'.missing',$rg)
$package=Join-Path $runtime '0.162.1\\codex-package.json'
$original=[IO.File]::ReadAllText($package)
$data=$original|ConvertFrom-Json; $data.layoutVersion=999
[IO.File]::WriteAllText($package,($data|ConvertTo-Json))
Rejected { & $Stage -Version 0.162.1 -RuntimeRoot $runtime } 'Unsupported package layout'
[IO.File]::WriteAllText($package,$original)
$linked=Join-Path $runtime '0.162.1\\redirect'
New-Item -ItemType Junction -Path $linked -Target $Root | Out-Null
Rejected { & $Stage -Version 0.162.1 -RuntimeRoot $runtime } 'links are unsupported'
[IO.Directory]::Delete($linked)
Write-Output 'STAGING_REGRESSIONS_OK'
`);
    const result=spawnSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',script,'-Stage',resolve('ops/windows/Stage-CodexRuntime.ps1'),'-Root',root],{encoding:'utf8',windowsHide:true,timeout:60000});
    assert.equal(result.status,0,result.stdout+'\n'+result.stderr);
    assert.match(result.stdout,/STAGING_REGRESSIONS_OK/);
  } finally { rmSync(root,{recursive:true,force:true}); }
});
