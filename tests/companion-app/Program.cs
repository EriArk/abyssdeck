using System.Text.Json;
using CodexWeb.Companion;

if(args.Length==2) {
    var signed=JsonSerializer.Deserialize<SignedUpdate>(File.ReadAllBytes(args[0]),SettingsStore.Json)!;
    var trusted=ReleaseVerifier.Verify(signed);ReleaseVerifier.VerifyPackage(args[1],trusted);
    Console.WriteLine("PASS actual Node publisher signature and clean package accepted by Windows verifier");return;
}
var temporary = Path.Combine(Path.GetTempPath(), "companion-ui-check-" + Guid.NewGuid());
Directory.CreateDirectory(temporary);
try
{
    void Check(bool value, string label) { if (!value) throw new Exception(label); Console.WriteLine("PASS " + label); }
    var store = new SettingsStore(Path.Combine(temporary, "companion-app"), "fixture-sid");
    var profile = new Profile("fixture-sid", "https://fixture.example", "fixture-device", "LAN");
    store.Save(profile);
    var bytes = File.ReadAllBytes(store.FilePath);
    Check(store.Load() == profile, "profile round-trip preserves binding and preferences");
    Check(!SettingsStore.ValidOrigin("http://fixture.example") && !SettingsStore.ValidOrigin("https://user:secret@fixture.example")
        && !SettingsStore.ValidOrigin("https://fixture.example/?token=x"), "reject credential URLs and non-origin endpoints");
    try { store.Save(profile with { Sid = "other-sid" }); throw new Exception("accepted foreign profile"); }
    catch (IOException) { Check(File.ReadAllBytes(store.FilePath).SequenceEqual(bytes), "foreign identity never overwrites existing settings"); }
    var foreign = new SettingsStore(store.Directory, "other-sid");
    try { foreign.Load(); throw new Exception("loaded foreign profile"); }
    catch (IOException) { Console.WriteLine("PASS foreign profile load refused"); }
    var worker = Path.Combine(temporary, "companion-persistent"); Directory.CreateDirectory(worker);
    var cli = Path.Combine(worker, "fixture.exe"); File.WriteAllBytes(cli, [1, 2, 3]);
    var workerConfig = Path.Combine(worker, "config.json");
    File.WriteAllText(workerConfig, JsonSerializer.Serialize(new { codexCommand = cli, workingDirectories = new[] { "C:\\source-one", "D:\\source-two" }, secret = "never-export" }));
    var configBytes = File.ReadAllBytes(workerConfig);
    using var actual = new ReadinessService(store);
    var config = actual.ReadWorkerConfig();
    Check(config.Roots.SequenceEqual(new[] { "C:\\source-one", "D:\\source-two" }) && config.Runtime == cli && config.Notice is null
        && File.ReadAllBytes(workerConfig).SequenceEqual(configBytes), "read-only adoption preserves exact worker config and roots");
    var c = new Component("delivery", "Files", "delivery", true, true, true, "Ready", cli, true);
    var kit=Path.Combine(temporary,"reviewed-kit");Directory.CreateDirectory(kit);
    foreach(var name in WorkerManager.Files["CodexWebDelivery"].Append("Start-ManagedWorker.ps1"))File.WriteAllText(Path.Combine(kit,name),"reviewed-"+name);
    var managed=WorkerManager.Prepare(store.Directory,kit,"CodexWebDelivery");
    var repeat=WorkerManager.Prepare(store.Directory,kit,"CodexWebDelivery");
    Check(managed==repeat && ReleaseVerifier.HashFile(Path.Combine(managed.Directory,"worker.json"))==managed.Digest,
        "reviewed workers stage one immutable release separately from private state");
    File.WriteAllText(Path.Combine(managed.Directory,"DeliveryWorker.cjs"),"corrupted");
    var repair=WorkerManager.Prepare(store.Directory,kit,"CodexWebDelivery");
    Check(repair.Digest!=managed.Digest && WorkerManager.Prepare(store.Directory,kit,"CodexWebDelivery")==repair
        && File.ReadAllText(Path.Combine(managed.Directory,"DeliveryWorker.cjs"))=="corrupted",
        "damaged code repairs to a durable fresh address without overwriting active code");
    Check(!WorkerManager.Candidate(c with {Id="CodexWebDesktopRestart",TaskDigest=new string('a',64)})
        && !WorkerManager.Candidate(c with {Id="CodexWebDelivery",State="Disabled",TaskDigest=new string('a',64)}),
        "worker migration cannot enable disabled tasks or upgrade privileged desktop control");
    Check(StatusProjection.Project(c).State == "Готов по запросу" && !StatusProjection.Project(c).Attention, "idle demand worker is available, not a false error");
    Check(StatusProjection.Project(c with { State = "Running" }, false).Attention
        && StatusProjection.Project(c with { Owned = false }).State == "Неизвестно", "failed status and foreign task cannot imply readiness");
    var barrier = new TaskCompletionSource<Snapshot>(); var calls = 0;
    using var coalesced = new ReadinessService(store, customReader: _ => { calls++; return barrier.Task; });
    var first = coalesced.Refresh(profile); var second = coalesced.Refresh(profile);
    Check(ReferenceEquals(first, second) && calls == 1, "overlapping ticks coalesce without cancelling a slow probe");
    barrier.SetResult(new(DateTimeOffset.Now, new("fixture-sid", "fixture", "fixture-pc", 1, [], []), [], "ready", true, [], cli, null));
    await first;
    await coalesced.Refresh(profile);
    Check(calls == 2, "completed probe refreshes again instead of caching stale health forever");
    Check(SetupOperations.StepStates(3, false, true).SequenceEqual(new[] { "✓ Проверено", "✓ Проверено", "Выполняется…", "Ожидает", "Ожидает" }),
        "wizard checks only completed preceding steps, not the current installation");
    Check(SetupOperations.StepStates(5, false, false)[4] == "Продолжить" && SetupOperations.StepStates(5, true, false).All(s => s == "✓ Проверено"),
        "interrupted report stays incomplete until exact Hub confirmation");
    if (OperatingSystem.IsWindows()) {
        var deviceStore = new SettingsStore(Path.Combine(temporary, "protected-session"), SettingsStore.CurrentSid);
        var encrypted = new DeviceSessionStore(deviceStore);
        var marker = "private-fixture-token-" + Guid.NewGuid();
        var device = new DeviceSession("https://fixture.example", deviceStore.Sid, DeviceSessionStore.MachineGuid(), marker, "fixture-user");
        encrypted.Save(device);
        Check(encrypted.Load(device.HubOrigin) == device && encrypted.Load("https://other.example") is null,
            "DPAPI round-trip preserves account and refuses another Hub");
        Check(!System.Text.Encoding.UTF8.GetString(File.ReadAllBytes(Path.Combine(deviceStore.Directory, "device-session.bin"))).Contains(marker),
            "saved credential is encrypted, not plain JSON");
        using var connection = new HubConnection(deviceStore); connection.Restore(new(deviceStore.Sid, device.HubOrigin, "", ""));
        var one = connection.Enrollment(); var two = connection.Enrollment();
        Check(one.EnrollmentId == two.EnrollmentId && one.EnrollmentToken == two.EnrollmentToken,
            "interrupted pairing retains one request identity before network effects");
        encrypted.Clear(); Check(encrypted.Load(device.HubOrigin) is null, "local sign-out removes only the scoped credential");
        using var console = new LocalTerminal();
        var output = new TaskCompletionSource<bool>();
        var collected = new System.Text.StringBuilder();
        _ = console.Read(text => { lock(collected) { collected.Append(text); if (collected.ToString().Contains("CONPTY-READY-493")) output.TrySetResult(true); } });
        await console.Write("Write-Output 'CONPTY-READY-493'\r");
        Check(await output.Task.WaitAsync(TimeSpan.FromSeconds(15)), "real same-user ConPTY accepts input and produces output without SSH");
    }
    using(var signing=System.Security.Cryptography.RSA.Create(3072)) {
        var candidate=new UpdateRelease(1,"codexweb-companion-ui","win-x64","0.5.9",101,19045,1,new string('a',64),new string('b',64),4096,new string('c',40),DateTimeOffset.UtcNow);
        SignedUpdate Signed(UpdateRelease value) {
            var data=JsonSerializer.SerializeToUtf8Bytes(value,SettingsStore.Json);
            return new(1,Convert.ToBase64String(data),Convert.ToBase64String(signing.SignData(data,System.Security.Cryptography.HashAlgorithmName.SHA256,System.Security.Cryptography.RSASignaturePadding.Pss)));
        }
        var package=Path.Combine(temporary,"package");Directory.CreateDirectory(package);
        File.WriteAllBytes(Path.Combine(package,"CodexWeb.Companion.exe"),[1,2,3]);File.WriteAllText(Path.Combine(package,"README.txt"),"fixture");
        File.WriteAllBytes(Path.Combine(package,"release.json"),JsonSerializer.SerializeToUtf8Bytes(new {format=1,product=candidate.Product,platform=candidate.Platform,
            version=candidate.Version,sourceRevision=candidate.SourceRevision,sourceDirty=false,files=new Dictionary<string,string>{
                ["CodexWeb.Companion.exe"]=ReleaseVerifier.HashFile(Path.Combine(package,"CodexWeb.Companion.exe")),["README.txt"]=ReleaseVerifier.HashFile(Path.Combine(package,"README.txt"))}},SettingsStore.Json));
        var zipPath=Path.Combine(temporary,"fixture.zip");System.IO.Compression.ZipFile.CreateFromDirectory(package,zipPath);
        var archiveRelease=candidate with {ManifestSha256=ReleaseVerifier.HashFile(Path.Combine(package,"release.json")),PackageSha256=ReleaseVerifier.HashFile(zipPath),PackageBytes=new FileInfo(zipPath).Length};
        ReleaseVerifier.Extract(zipPath,Path.Combine(temporary,"unpacked"),archiveRelease);Check(true,"exact signed inventory extraction preserves every file");
        try {ReleaseVerifier.Extract(zipPath,Path.Combine(temporary,"tampered"),archiveRelease with {PackageSha256=new string('0',64)});throw new Exception("archive accepted");}catch(IOException){Console.WriteLine("PASS changed archive rejected before extraction");}
        File.WriteAllText(Path.Combine(package,"extra.txt"),"unexpected");
        try {ReleaseVerifier.VerifyPackage(package,archiveRelease);throw new Exception("extra accepted");}catch(IOException){Console.WriteLine("PASS unsigned extra package file rejected");}
        var signed=Signed(candidate);var key=signing.ExportSubjectPublicKeyInfoPem();
        Check(ReleaseVerifier.Verify(signed,100,key)==candidate,"trusted exact signature accepts a compatible release");
        try {ReleaseVerifier.Verify(signed,102,key);throw new Exception("rollback allowed");}catch(IOException){Console.WriteLine("PASS signed rollback sequence refused");}
        try {ReleaseVerifier.Verify(signed with {Payload=Convert.ToBase64String(JsonSerializer.SerializeToUtf8Bytes(candidate with {Version="9.0.0"},SettingsStore.Json))},0,key);throw new Exception("tampering allowed");}catch(IOException){Console.WriteLine("PASS modified manifest refused before staging");}
        try {ReleaseVerifier.Verify(Signed(candidate with {Platform="linux-x64"}),0,key);throw new Exception("platform accepted");}catch(IOException){Console.WriteLine("PASS incompatible platform refused");}
        using var stranger=System.Security.Cryptography.RSA.Create(3072);
        try {ReleaseVerifier.Verify(signed,0,stranger.ExportSubjectPublicKeyInfoPem());throw new Exception("foreign key allowed");}catch(IOException){Console.WriteLine("PASS untrusted publisher refused");}
    }
    var recoverStore=new SettingsStore(Path.Combine(temporary,"recovery"),"fixture-sid");Directory.CreateDirectory(recoverStore.Directory);
    var clock=DateTimeOffset.UtcNow;
    var policy=new RecoveryManager(recoverStore,()=>clock);
    var stopped=new Component("CodexWebComputerUse","Computer Use","computer-use",true,true,true,"Ready","fixture.exe",true,new string('a',64));
    Snapshot Ready()=>new(clock,new("fixture-sid","fixture","pc",1,[stopped],[]),[],"ready",true,[],"",null);
    var effects=0;
    Task Repair(Component c,Inventory inventory,string? kit){effects++;return Task.CompletedTask;}
    await policy.Recover(Ready(),false,null,Repair,()=>Task.FromResult(Ready()));Check(effects==0,"unconfirmed Hub account never grants automatic repair");
    await policy.Recover(Ready(),true,null,Repair,()=>Task.FromResult(Ready()));
    await policy.Recover(Ready(),true,null,Repair,()=>Task.FromResult(Ready()));Check(effects==1,"repeated ticks do not replay an accepted recovery effect");
    var reloaded=new RecoveryManager(recoverStore,()=>clock);Check(!reloaded.Due(stopped),"reopened UI retains recovery backoff");
    clock+=TimeSpan.FromSeconds(31);await reloaded.Recover(Ready(),true,null,Repair,()=>Task.FromResult(Ready()));
    clock+=TimeSpan.FromSeconds(121);await reloaded.Recover(Ready(),true,null,Repair,()=>Task.FromResult(Ready()));
    clock+=TimeSpan.FromSeconds(121);Check(effects==3 && !reloaded.Due(stopped),"three failed checks enter fifteen-minute cooling period");
    Check(!RecoveryManager.Candidate(stopped with {State="Running"}) && !RecoveryManager.Candidate(stopped with {State="Disabled"})
        && !RecoveryManager.Candidate(stopped with {Known=false}) && !RecoveryManager.Candidate(stopped with {Owned=false})
        && !RecoveryManager.Candidate(stopped with {Id="CodexWebCompanionPersistent"}) && !RecoveryManager.Candidate(stopped with {Id="CodexWebDelivery"}),
        "running, disabled, foreign, unknown, native writers and ready demand workers are untouched");
    File.WriteAllText(Path.Combine(recoverStore.Directory,"recovery-state.json"),"corrupted");
    var corrupted=new RecoveryManager(recoverStore,()=>clock);
    await corrupted.Recover(Ready(),true,null,Repair,()=>Task.FromResult(Ready()));
    Check(effects==3 && !corrupted.Due(stopped),"damaged recovery journal cannot replay previous effects");
    Console.WriteLine("Companion focused checks passed; no existing native process or task was changed.");
}
finally
{
    var resolved = Path.GetFullPath(temporary);
    if (!resolved.StartsWith(Path.GetFullPath(Path.GetTempPath()), StringComparison.OrdinalIgnoreCase)
        || !Path.GetFileName(resolved).StartsWith("companion-ui-check-")) throw new Exception("unsafe fixture cleanup");
    Directory.Delete(resolved, true);
}
