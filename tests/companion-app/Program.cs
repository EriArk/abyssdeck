using System.Text.Json;
using CodexWeb.Companion;

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
    Console.WriteLine("Companion focused checks passed; no existing native process or task was changed.");
}
finally
{
    var resolved = Path.GetFullPath(temporary);
    if (!resolved.StartsWith(Path.GetFullPath(Path.GetTempPath()), StringComparison.OrdinalIgnoreCase)
        || !Path.GetFileName(resolved).StartsWith("companion-ui-check-")) throw new Exception("unsafe fixture cleanup");
    Directory.Delete(resolved, true);
}
