using System.Text.Json;

namespace CodexWeb.Companion;

public sealed record RecoveryAttempt(string Sid, string Digest, int Attempts, DateTimeOffset NextAt, string State);
public sealed class RecoveryManager(SettingsStore settings, Func<DateTimeOffset>? clock = null)
{
    readonly Dictionary<string,RecoveryAttempt>? attempts=Load(settings);
    DateTimeOffset Now => clock?.Invoke() ?? DateTimeOffset.UtcNow;
    public bool Running {get;private set;}
    static string PathName(SettingsStore settings)=>Path.Combine(settings.Directory,"recovery-state.json");
    static Dictionary<string,RecoveryAttempt>? Load(SettingsStore settings) {
        try {var path=PathName(settings);SettingsStore.NoLinks(path);return !File.Exists(path)?[]:new FileInfo(path).Length<16384
            ? JsonSerializer.Deserialize<Dictionary<string,RecoveryAttempt>>(File.ReadAllBytes(path),SettingsStore.Json):null;} catch {return null;}
    }
    void Save()=>ReleaseVerifier.Atomic(PathName(settings),JsonSerializer.SerializeToUtf8Bytes(attempts,SettingsStore.Json));
    public static bool Candidate(Component c) => c.Known && c.Installed && c.Owned && c.TaskDigest.Length==64 && c.State=="Ready"
        && c.Id is not ("CodexWebCompanion" or "CodexWebCompanionPersistent" or "CodexWebDesktopRestart" or "CodexWebBrowser")
        && (!c.ExecutableExists || c.Id=="CodexWebComputerUse");
    public bool Due(Component c) => attempts is not null && Candidate(c) && (!attempts.TryGetValue(c.Id,out var entry)
        || entry.Sid!=settings.Sid || entry.Digest!=c.TaskDigest || entry.NextAt<=Now);
    public string Description(Component c) => attempts is null ? "Журнал автовосстановления нужно проверить вручную" : attempts.TryGetValue(c.Id,out var entry) && entry.Sid==settings.Sid && entry.Digest==c.TaskDigest
        && entry.State!="healthy" ? entry.State=="checking" ? "Автовосстановление · проверяем результат"
        : "Автовосстановление · следующая проверка " + entry.NextAt.ToLocalTime().ToString("HH:mm:ss") : "";
    public async Task<Snapshot> Recover(Snapshot snapshot, bool authorized, string? verifiedKit,
        Func<Component,Inventory,string?,Task> repair, Func<Task<Snapshot>> refresh)
    {
        if(attempts is null || Running || !authorized || snapshot.Inventory.Sid!=settings.Sid || Now-snapshot.CheckedAt>TimeSpan.FromSeconds(45))return snapshot;
        Running=true;
        try {
            // At most one component effect per fresh inventory. Demand workers in
            // Ready are healthy; disabled, unknown, absent and native writers need a person.
            var changed=false;
            foreach(var component in snapshot.Inventory.Components) {
                if(!Candidate(component)) {
                    if(component.Known && component.Owned && component.ExecutableExists && component.State is "Running" or "Ready") changed |= attempts.Remove(component.Id);
                    continue;
                }
                if(!Due(component) || !component.ExecutableExists && verifiedKit is null)continue;
                var previous=attempts.GetValueOrDefault(component.Id);
                var count=previous?.Sid==settings.Sid && previous.Digest==component.TaskDigest && previous.Attempts<3 ? previous.Attempts+1 : 1;
                var delay=count switch {1=>30,2=>120,_=>900};
                attempts[component.Id]=new(settings.Sid,component.TaskDigest,count,Now+TimeSpan.FromSeconds(delay),"checking");Save();
                try {
                    await repair(component,snapshot.Inventory,verifiedKit);
                    snapshot=await refresh();
                    var actual=snapshot.Inventory.Components.FirstOrDefault(c=>c.Id==component.Id);
                    if(actual is not null && actual.Known && actual.Owned && actual.ExecutableExists && (actual.State=="Running" || actual.Id!="CodexWebComputerUse" && actual.State=="Ready"))
                        attempts.Remove(component.Id);
                    else attempts[component.Id]=attempts[component.Id] with {State="waiting"};
                } catch {attempts[component.Id]=attempts[component.Id] with {State="waiting"};}
                Save();return snapshot;
            }
            if(changed)Save();return snapshot;
        } finally {Running=false;}
    }
}
