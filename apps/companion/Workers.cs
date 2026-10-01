using System.Diagnostics;
using System.Reflection;
using System.Text;
using System.Text.Json;

namespace CodexWeb.Companion;

public sealed record WorkerRelease(int Format, string ComponentId, SortedDictionary<string,string> Files, string Repair = "");
public sealed record WorkerResult(string State, string ComponentId, string Release);

// The authenticated signed UI package supplies public code. Accounts, configs,
// mailbox receipts and task principals remain at their existing private paths.
public sealed class WorkerManager(SettingsStore settings, HubConnection? hub = null)
{
    public static readonly IReadOnlyDictionary<string,string[]> Files = new Dictionary<string,string[]> {
        ["CodexWebCompanionPersistent"] = ["managed-native/CodexWebCompanion.exe"],
        ["CodexWebDelivery"] = ["DeliveryWorker.cjs", "deliveryProbe.js", "githubWorkProbe.js"],
        ["CodexWebProjectSetup"] = ["ProjectSetupWorker.cjs", "setupProbe.js"],
        ["CodexWebGitHubReleases"] = ["GitHubReleases.cjs"],
        ["CodexWebFileLaunch"] = ["FileLaunchWorker.cjs", "NativeFileLaunch.ps1", "ExactFileLaunch.cs"],
        ["CodexWebGuiPreview"] = ["GuiPreviewWorker.cjs", "NativePreview.ps1", "PreviewWindow.cs"]
    };
    public bool Running { get; private set; }
    public string State { get; private set; } = "";
    public static bool Candidate(Component component) => Files.ContainsKey(component.Id)
        && component.Known && component.Installed && component.Owned && component.TaskDigest.Length == 64
        && component.State is "Ready" or "Running";
    readonly Dictionary<string,DateTimeOffset> attempts = [];
    public string Description(Component component) {
        try {
            var path=Path.Combine(settings.Directory,"workers","state",component.Id+".json"); SettingsStore.NoLinks(path);
            if(!File.Exists(path)) return component.Id=="CodexWebCompanionPersistent" && File.Exists(Path.Combine(settings.Directory,"workers","native-operation.json"))
                ? "Обновление Codex ждёт подтверждённого простоя" : "";
            if(new FileInfo(path).Length>65536)throw new IOException();
            using var json=JsonDocument.Parse(File.ReadAllBytes(path));var value=json.RootElement;
            if(value.GetProperty("sid").GetString()!=settings.Sid || value.GetProperty("componentId").GetString()!=component.Id)throw new IOException();
            return value.GetProperty("state").GetString() switch {
                "installed"=>"✓ Версия управляется Companion",
                "rolledBack"=>"Возвращена предыдущая версия; повторное переключение отложено",
                "waitingIdle"=>"Обновление ждёт завершения работы",
                _=>"Проверяем результат переключения"
            };
        } catch { return "Журнал переключения требует проверки"; }
    }
    public static (string Directory,string Digest) Prepare(string appDirectory,string verifiedKit,string componentId) {
        if(!Files.TryGetValue(componentId,out var names))throw new IOException("Этот компонент требует отдельного перехода.");
        SettingsStore.NoLinks(verifiedKit); SettingsStore.NoLinks(appDirectory);
        var contents=new SortedDictionary<string,byte[]>(StringComparer.Ordinal);
        foreach(var name in names.Append("Start-ManagedWorker.ps1")) {
            var path=Path.Combine(verifiedKit,name); SettingsStore.NoLinks(path);
            if(new FileInfo(path).Length is <1 or >8*1024*1024)throw new IOException("Неверный компонент пакета.");
            contents.Add(Path.GetFileName(name),File.ReadAllBytes(path));
        }
        contents.Add("package.json", Encoding.UTF8.GetBytes("{\"type\":\"module\"}"));
        var hashes=new SortedDictionary<string,string>(StringComparer.Ordinal);
        foreach(var (name,bytes) in contents) hashes.Add(name,Convert.ToHexStringLower(System.Security.Cryptography.SHA256.HashData(bytes)));
        var release=new WorkerRelease(1,componentId,hashes);
        var manifest=JsonSerializer.SerializeToUtf8Bytes(release,SettingsStore.Json);
        static string Hash(byte[] bytes)=>Convert.ToHexStringLower(System.Security.Cryptography.SHA256.HashData(bytes));
        var sourceDigest=Hash(manifest);var digest=sourceDigest;
        var aliases=Path.Combine(appDirectory,"workers","repairs");SettingsStore.NoLinks(aliases);Directory.CreateDirectory(aliases);
        var alias=Path.Combine(aliases,sourceDigest+".json");SettingsStore.NoLinks(alias);
        if(File.Exists(alias)) {
            if(new FileInfo(alias).Length>1024)throw new IOException("Журнал восстановления повреждён.");
            var repair=JsonSerializer.Deserialize<string>(File.ReadAllBytes(alias),SettingsStore.Json);
            if(!Guid.TryParse(repair,out _))throw new IOException("Журнал восстановления повреждён.");
            release=release with {Repair=repair!};manifest=JsonSerializer.SerializeToUtf8Bytes(release,SettingsStore.Json);digest=Hash(manifest);
        }
        var directory=Path.Combine(appDirectory,"workers","releases",digest);SettingsStore.NoLinks(directory);
        bool Damaged()=>contents.Append(new KeyValuePair<string,byte[]>("worker.json",manifest)).Any(entry=> {
            var file=Path.Combine(directory,entry.Key);SettingsStore.NoLinks(file);
            return File.Exists(file) && !File.ReadAllBytes(file).SequenceEqual(entry.Value);
        });
        if(Damaged()) {
            // Rebuild exact signed bytes at a fresh immutable address. Never overwrite
            // the old address, which an active client may still be using.
            release=release with {Repair=Guid.NewGuid().ToString()};manifest=JsonSerializer.SerializeToUtf8Bytes(release,SettingsStore.Json);digest=Hash(manifest);
            directory=Path.Combine(appDirectory,"workers","releases",digest);SettingsStore.NoLinks(directory);
            ReleaseVerifier.Atomic(alias,JsonSerializer.SerializeToUtf8Bytes(release.Repair,SettingsStore.Json));
        }
        Directory.CreateDirectory(directory);
        foreach(var (name,bytes) in contents.Append(new KeyValuePair<string,byte[]>("worker.json",manifest))) {
            var path=Path.Combine(directory,name);SettingsStore.NoLinks(path);
            if(File.Exists(path)) {if(!File.ReadAllBytes(path).SequenceEqual(bytes))throw new IOException("Неизменяемая версия компонента повреждена.");}
            else {using var output=new FileStream(path,FileMode.CreateNew,FileAccess.Write);output.Write(bytes);output.Flush(true);}
        }
        return (directory,digest);
    }
    public async Task Migrate(Component component, Inventory inventory, string verifiedKit, bool rollback = false) {
        if(Running || !Candidate(component) || inventory.Sid!=settings.Sid)throw new IOException("Сначала проверь компоненты этого пользователя.");
        Running=true;
        try {
            State="Обновляем компонент: "+component.Title;
            var release=Prepare(settings.Directory,verifiedKit,component.Id);
            var config=Path.GetFullPath(Path.Combine(settings.Directory,"..",component.Folder,"config.json"));SettingsStore.NoLinks(config);
            if(new FileInfo(config).Length>65536)throw new IOException("Неверная конфигурация компонента.");
            var configHash=ReleaseVerifier.HashFile(config);
            var leasePath=Path.Combine(settings.Directory,"workers","native-operation.json");SettingsStore.NoLinks(leasePath);
            var journalPath=Path.Combine(settings.Directory,"workers","state",component.Id+".json");SettingsStore.NoLinks(journalPath);
            if(!rollback && File.Exists(journalPath) && (component.Id!="CodexWebCompanionPersistent" || !File.Exists(leasePath))) {
                if(new FileInfo(journalPath).Length>65536)throw new IOException("Журнал перехода повреждён.");
                using var existing=JsonDocument.Parse(File.ReadAllBytes(journalPath));var value=existing.RootElement;
                if(value.GetProperty("sid").GetString()==settings.Sid && value.GetProperty("release").GetString()==release.Digest
                    && value.GetProperty("state").GetString()=="rolledBack") {State="Сохранена предыдущая версия; обновление отложено";return;}
                if(value.GetProperty("sid").GetString()==settings.Sid && value.GetProperty("release").GetString()==release.Digest
                    && value.GetProperty("state").GetString()=="installed" && value.GetProperty("taskDigest").GetString()==component.TaskDigest
                    && value.GetProperty("configHash").GetString()==configHash) {State="✓ Компонент обновлён";return;}
            }
            string nativeLease="";
            if(component.Id=="CodexWebCompanionPersistent") {
                if(hub is null || rollback)throw new IOException("Исполнитель Codex требует подтверждения простоя Hub.");
                SettingsStore.NoLinks(leasePath);
                if(File.Exists(leasePath)) {using var prior=JsonDocument.Parse(File.ReadAllBytes(leasePath));
                    if(prior.RootElement.GetProperty("sid").GetString()!=settings.Sid)throw new IOException("Привязка перехода изменилась.");
                    if(prior.RootElement.GetProperty("userId").GetString()!=hub.Session?.UserId || prior.RootElement.GetProperty("hubOrigin").GetString()!=hub.Session?.HubOrigin)throw new IOException("Войди в аккаунт, начавший переход.");
                    nativeLease=prior.RootElement.GetProperty("operationId").GetString()!;
                    if(!Guid.TryParse(nativeLease,out _))throw new IOException("Журнал перехода повреждён.");
                } else {nativeLease=Guid.NewGuid().ToString();ReleaseVerifier.Atomic(leasePath,JsonSerializer.SerializeToUtf8Bytes(new {sid=settings.Sid,userId=hub.Session?.UserId,hubOrigin=hub.Session?.HubOrigin,operationId=nativeLease},SettingsStore.Json));}
                var admission=await hub.Request("/api/companion/maintenance",new {operationId=nativeLease,action="acquire"});
                if(admission.GetProperty("state").GetString()=="released") {File.Delete(leasePath);State="✓ Codex проверен Hub";return;}
                if(admission.GetProperty("state").GetString()!="drained") {State="Обновление Codex ждёт подтверждённого простоя";return;}
            }
            using var stream=Assembly.GetExecutingAssembly().GetManifestResourceStream("CodexWeb.Companion.Migrate-CompanionWorker.ps1")!;
            using var reader=new StreamReader(stream);var script=await reader.ReadToEndAsync();
            static string Quoted(string value)=>"'"+value.Replace("'","''")+"'";
            var prefix="$componentId="+Quoted(component.Id)+";$expectedSid="+Quoted(settings.Sid)+";$expectedTaskDigest="+Quoted(component.TaskDigest)
                +";$expectedConfigHash="+Quoted(ReleaseVerifier.HashFile(config))+";$releaseDirectory="+Quoted(release.Directory)
                +";$releaseDigest="+Quoted(release.Digest)+";$nativeLease="+Quoted(nativeLease)+";$rollback="+(rollback?"$true":"$false")+";";
            var start=new ProcessStartInfo(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System),@"WindowsPowerShell\v1.0\powershell.exe")) {
                UseShellExecute=false,CreateNoWindow=true,RedirectStandardOutput=true,RedirectStandardError=true,StandardOutputEncoding=Encoding.UTF8
            };
            foreach(var argument in new[]{"-NoLogo","-NoProfile","-NonInteractive","-EncodedCommand",Convert.ToBase64String(Encoding.Unicode.GetBytes(prefix+script))})start.ArgumentList.Add(argument);
            using var process=Process.Start(start)??throw new IOException("Переключение не запустилось.");
            var output=process.StandardOutput.ReadToEndAsync();var error=process.StandardError.ReadToEndAsync();
            // Do not kill an uncertain installer or replay it after a timeout.
            await process.WaitForExitAsync();await error;var text=await output;
            if(process.ExitCode!=0 || text.Length>4096)throw new IOException("Переключение не подтверждено. Работа и прежняя конфигурация сохранены; проверим результат.");
            var result=JsonSerializer.Deserialize<WorkerResult>(text,SettingsStore.Json);
            if(result?.ComponentId!=component.Id || result.Release!=release.Digest)throw new IOException("Неверный результат переключения.");
            if(nativeLease.Length>0 && result.State is "installed" or "rolledBack") {
                var confirmed=await hub!.Request("/api/companion/maintenance",new {operationId=nativeLease,action="release"});
                if(confirmed.GetProperty("state").GetString()!="released")throw new IOException("Hub проверяет новый исполнитель.");
                File.Delete(leasePath);
            }
            State=result.State switch {"installed"=>"✓ Компонент обновлён", "busy"=>"Обновление ждёт завершения работы", "rolledBack"=>"Сохранена предыдущая версия", _=>"Компонент отключён пользователем"};
        } finally {Running=false;}
    }
    public async Task Update(Snapshot snapshot, string verifiedKit) {
        if(Running || snapshot.Inventory.Sid!=settings.Sid || DateTimeOffset.Now-snapshot.CheckedAt>TimeSpan.FromSeconds(45))return;
        foreach(var component in snapshot.Inventory.Components.Where(Candidate)) {
            if(attempts.TryGetValue(component.Id,out var last) && DateTimeOffset.UtcNow-last<TimeSpan.FromMinutes(2))continue;
            attempts[component.Id]=DateTimeOffset.UtcNow;
            try {await Migrate(component,snapshot.Inventory,verifiedKit);} catch {State="Обновление компонента ждёт подтверждения состояния";}
        }
    }
}
