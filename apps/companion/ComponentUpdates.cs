using System.Text.Json;
using System.Text.RegularExpressions;

namespace CodexWeb.Companion;

public sealed record ComponentUpdate(string Id, string State, string Detail, bool Repair = false, bool Elevation = false)
{
    public bool Current => State == "current";
}

// Read-only comparison with the verified installed package. A migration receipt
// alone is not proof of the current task, code, configuration or readiness.
public sealed class ComponentUpdates(SettingsStore settings)
{
    static JsonDocument Read(string path) {
        SettingsStore.NoLinks(path);
        if(new FileInfo(path).Length > 65536) throw new IOException();
        return JsonDocument.Parse(File.ReadAllBytes(path));
    }
    static string Field(JsonElement value, string name) => value.TryGetProperty(name,out var p) && p.ValueKind==JsonValueKind.String ? p.GetString()! : "";
    static bool Digest(string value) => Regex.IsMatch(value,"^[a-f0-9]{64}$");
    public ComponentUpdate[] Inspect(Snapshot snapshot, string? kit) => snapshot.Inventory.Components
        .Where(c => WorkerManager.Files.ContainsKey(c.Id) || c.Id=="CodexWebBrowser")
        .Where(c => c.Installed || !c.Known || c.Id!="CodexWebCompanionPersistent")
        .Select(c => Inspect(c, snapshot.Inventory.Sid==settings.Sid && DateTimeOffset.Now-snapshot.CheckedAt<TimeSpan.FromSeconds(45), kit,
            snapshot.Components.ElementAtOrDefault(Array.IndexOf(snapshot.Inventory.Components,c)))).ToArray();

    public ComponentUpdate Inspect(Component c, bool fresh, string? kit, ComponentView? health)
    {
        ComponentUpdate Status(string state,string detail,bool repair=false,bool elevation=false)=>new(c.Id,state,detail,repair,elevation);
        if(!fresh || !c.Known || c.Installed && !c.Owned) return Status("unknown","Версия пока не подтверждена: обнови состояние");
        if(!c.Installed) return Status("missing","Компонент пакета ещё не установлен",true);
        if(c.State=="Disabled") return Status("disabled","Выключен в Windows; автоматический переход приостановлен",true);
        if(kit is null) return Status("unknown","Ожидаем проверку подписанного пакета Companion");
        try {
            SettingsStore.NoLinks(kit);
            if(c.Id=="CodexWebBrowser") return Browser(c,kit,health);
            var journalPath=Path.Combine(settings.Directory,"workers","state",c.Id+".json");
            SettingsStore.NoLinks(journalPath);
            if(!File.Exists(journalPath)) return Status("pending","Ожидает перехода на версию пакета",true);
            using var journal=Read(journalPath); var j=journal.RootElement;
            if(Field(j,"sid")!=settings.Sid || Field(j,"componentId")!=c.Id) throw new IOException();
            var config=Path.GetFullPath(Path.Combine(settings.Directory,"..",c.Folder,"config.json"));
            SettingsStore.NoLinks(config);
            var state=Field(j,"state");
            if(state=="needsElevation") {
                var original=Field(j,"originalXml");
                var originalHash=Convert.ToHexStringLower(System.Security.Cryptography.SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(original)));
                if(originalHash!=c.TaskDigest || Field(j,"configHash")!=ReleaseVerifier.HashFile(config)) throw new IOException();
                return Status("needsElevation","Для ремонта задачи нужно подтверждение Windows",true,c.Id!="CodexWebCompanionPersistent");
            }
            if(state=="rolledBack") return Status("rolledBack","Сохранена предыдущая версия; доступен повторный ремонт",true);
            if(state!="installed") return Status("pending",state=="waitingIdle" ? "Переход ждёт завершения работы" : "Переключение не подтверждено; доступен ремонт",true);
            var digest=Field(j,"release"); if(!Digest(digest)) throw new IOException();
            var directory=Path.Combine(settings.Directory,"workers","releases",digest);
            var manifestPath=Path.Combine(directory,"worker.json"); SettingsStore.NoLinks(manifestPath);
            if(ReleaseVerifier.HashFile(manifestPath)!=digest) throw new IOException();
            using var manifest=Read(manifestPath); var m=manifest.RootElement;
            if(Field(m,"componentId")!=c.Id || m.GetProperty("format").GetInt32()!=1) throw new IOException();
            var files=m.GetProperty("files");
            var expected=WorkerManager.Files[c.Id].Append("Start-ManagedWorker.ps1").ToArray();
            if(files.EnumerateObject().Count()!=expected.Length+1) throw new IOException();
            var matches=true;
            foreach(var source in expected) {
                var name=Path.GetFileName(source);var installed=Path.Combine(directory,name);var supplied=Path.Combine(kit,source);
                SettingsStore.NoLinks(installed);SettingsStore.NoLinks(supplied);
                var hash=Field(files,name);
                if(!Digest(hash) || ReleaseVerifier.HashFile(installed)!=hash) throw new IOException();
                matches &= ReleaseVerifier.HashFile(supplied)==hash;
            }
            var package=Path.Combine(directory,"package.json");SettingsStore.NoLinks(package);
            if(ReleaseVerifier.HashFile(package)!=Field(files,"package.json") || File.ReadAllText(package)!="{\"type\":\"module\"}") throw new IOException();
            if(!matches) return Status("pending","Установлена предыдущая версия; переход ожидает простоя",true);
            if(Field(j,"taskDigest")!=c.TaskDigest || Field(j,"configHash")!=ReleaseVerifier.HashFile(config) || !c.ExecutableExists) throw new IOException();
            if(c.Id=="CodexWebCompanionPersistent" && File.Exists(Path.Combine(settings.Directory,"workers","native-operation.json")))
                return Status("pending","Версия установлена; ждём подтверждения Hub");
            return health is {Attention:false} && health.State is "Запущен" or "Занято" or "Готов по запросу"
                ? Status("current","✓ Версия пакета и готовность подтверждены") : Status("unavailable","Версия пакета установлена; готовность требует проверки",true);
        } catch {return Status("repair","Версия или результат переключения требует ремонта",true);}
    }
    ComponentUpdate Browser(Component c,string kit,ComponentView? health) {
        var directory=Path.GetFullPath(Path.Combine(settings.Directory,"..","browser"));
        using var installed=Read(Path.Combine(directory,"current.json"));using var target=Read(Path.Combine(kit,"browser-package","release.json"));
        var old=installed.RootElement;var desired=target.RootElement;
        var release=Field(old,"release"); if(!Digest(release))throw new IOException();
        var label=Field(old,"version")+" → "+Field(desired,"version");
        var expected=desired.GetProperty("files");var files=old.GetProperty("files");
        if(files.EnumerateObject().Count()!=expected.EnumerateObject().Count())throw new IOException();
        var matches=true;
        foreach(var entry in expected.EnumerateObject()) {
            if(!Regex.IsMatch(entry.Name,"^[A-Za-z0-9_.-]+$"))throw new IOException();
            var path=Path.Combine(directory,"runtime",release,entry.Name);SettingsStore.NoLinks(path);
            if(ReleaseVerifier.HashFile(path)!=Field(files,entry.Name))throw new IOException();
            matches &= Field(files,entry.Name)==entry.Value.GetString();
        }
        if(!matches) return new(c.Id,"pending", "Браузер "+label+" · "+(Field(old,"version")=="1.0.0"
            ? "первый переход требует завершения старого браузера; вкладки остаются открытыми"
            : "обновится после закрытия вкладок"),true);
        var launcher=Path.Combine(directory,"Start-Browser.ps1");SettingsStore.NoLinks(launcher);
        if(ReleaseVerifier.HashFile(launcher)!=Field(files,"Start-Browser.ps1") || !c.ExecutableExists)throw new IOException();
        return health is {Attention:false,State:"Запущен"} && c.ToolReady==true
            ? new(c.Id,"current","✓ Браузер "+Field(desired,"version")+" · версия и подключение проверены")
            : new(c.Id,"unavailable","Версия браузера установлена; подключение требует ремонта",true);
    }
    public static string Summary(IReadOnlyList<ComponentUpdate> components) => components.Count==0 ? "Проверяем версии компонентов"
        : $"Версии пакета · {components.Count(c=>c.Current)} из {components.Count} подтверждены"
            +(components.All(c=>c.Current) ? "" : components.Any(c=>c.Repair) ? " · есть незавершённые компоненты" : " · ожидаем проверку");
}
