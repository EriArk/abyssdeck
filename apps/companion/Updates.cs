using System.Diagnostics;
using System.IO.Compression;
using System.Reflection;
using System.Security.Cryptography;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;

namespace CodexWeb.Companion;

public static class CompanionVersion { public const string Current = "0.5.1"; }
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record SignedUpdate(int Format, string Payload, string Signature);
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record UpdateRelease(int Format, string Product, string Platform, string Version, long Sequence,
    int MinWindowsBuild, int Protocol, string ManifestSha256, string PackageSha256, long PackageBytes,
    string SourceRevision, DateTimeOffset PublishedAt);
public sealed record UpdateState(long HighestSequence = 0, DateTimeOffset CheckedAt = default, string Nonce = "",
    string State = "idle", string Version = "", string Error = "");
public sealed record UpdateActivation(string Sid, string Nonce, int ParentPid, long ParentStart,
    string ParentExecutable, string PreviousPointer, int SelectedPage = 0, double[]? ScrollOffsets = null);

public static class ReleaseVerifier
{
    public static string PublicKey() {
        using var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("CodexWeb.Companion.Assets.update-public.pem")!;
        using var reader = new StreamReader(stream); return reader.ReadToEnd();
    }
    public static string HashFile(string path) { SettingsStore.NoLinks(path); using var input = File.OpenRead(path); return Convert.ToHexStringLower(SHA256.HashData(input)); }
    public static bool Digest(string value) => Regex.IsMatch(value ?? "", "^[a-f0-9]{64}$");
    public static UpdateRelease Verify(SignedUpdate signed, long minimumSequence = 0, string? testPublicKey = null)
    {
        if (signed is null || signed.Payload is null || signed.Signature is null || signed.Format != 1 || signed.Payload.Length > 16384 || signed.Signature.Length > 1024) throw new IOException("Неверный manifest обновления.");
        var bytes = Convert.FromBase64String(signed.Payload);
        using var rsa = RSA.Create(); rsa.ImportFromPem(testPublicKey ?? PublicKey());
        if (!rsa.VerifyData(bytes, Convert.FromBase64String(signed.Signature), HashAlgorithmName.SHA256, RSASignaturePadding.Pss))
            throw new IOException("Подпись обновления не подтверждена.");
        var release = JsonSerializer.Deserialize<UpdateRelease>(bytes, SettingsStore.Json) ?? throw new IOException("Неверный manifest.");
        if (release.Format != 1 || release.Product != "codexweb-companion-ui" || release.Platform != "win-x64"
            || release.Protocol != 1 || release.Sequence < Math.Max(1, minimumSequence) || release.Sequence > 9_007_199_254_740_991
            || release.MinWindowsBuild is < 19045 or > 99999 || !Regex.IsMatch(release.Version, @"^\d+\.\d+\.\d+$")
            || !Version.TryParse(release.Version, out var version) || version < Version.Parse(CompanionVersion.Current)
            || !Digest(release.ManifestSha256) || !Digest(release.PackageSha256) || !Regex.IsMatch(release.SourceRevision, "^[a-f0-9]{40}$")
            || release.PackageBytes is < 1 or > 128 * 1024 * 1024) throw new IOException("Обновление несовместимо или устарело.");
        if (OperatingSystem.IsWindows() && Environment.OSVersion.Version.Build < release.MinWindowsBuild) throw new IOException("Обновлению нужна более новая Windows.");
        return release;
    }
    public static void VerifyPackage(string folder, UpdateRelease release)
    {
        SettingsStore.NoLinks(folder);
        var manifest = Path.Combine(folder, "release.json");
        if (new FileInfo(manifest).Length > 128 * 1024 || HashFile(manifest) != release.ManifestSha256) throw new IOException("Manifest пакета изменился.");
        using var document = JsonDocument.Parse(File.ReadAllBytes(manifest)); var data = document.RootElement;
        if (data.GetProperty("format").GetInt32() != 1 || data.GetProperty("product").GetString() != release.Product
            || data.GetProperty("platform").GetString() != release.Platform || data.GetProperty("version").GetString() != release.Version
            || data.GetProperty("sourceRevision").GetString() != release.SourceRevision || data.GetProperty("sourceDirty").GetBoolean()) throw new IOException("Пакет не соответствует релизу.");
        var entries = data.GetProperty("files").EnumerateObject().ToArray();
        if (entries.Length is < 2 or > 300 || !entries.Any(x => x.Name == "CodexWeb.Companion.exe")) throw new IOException("Неверный список файлов.");
        var expected = new HashSet<string>(StringComparer.OrdinalIgnoreCase) { "release.json" }; long total = 0;
        foreach (var entry in entries) {
            if (!SafeName(entry.Name) || !expected.Add(entry.Name) || !Digest(entry.Value.GetString()!)) throw new IOException("Неверный файл обновления.");
            var path = Path.Combine(folder, entry.Name.Replace('/', Path.DirectorySeparatorChar)); SettingsStore.NoLinks(path);
            total += new FileInfo(path).Length;
            if (total > 512 * 1024 * 1024 || HashFile(path) != entry.Value.GetString()) throw new IOException("Файл обновления изменился.");
        }
        var actual = Directory.EnumerateFiles(folder, "*", SearchOption.AllDirectories).Select(x => Path.GetRelativePath(folder,x).Replace('\\','/'));
        if (!expected.SetEquals(actual)) throw new IOException("В пакете есть лишние файлы.");
    }
    public static bool SafeName(string value) => Regex.IsMatch(value, @"^[a-zA-Z0-9_.-]+(?:/[a-zA-Z0-9_.-]+)*$") && !value.Split('/').Any(x => x is "." or "..");
    public static void Extract(string zipPath, string folder, UpdateRelease release)
    {
        if (new FileInfo(zipPath).Length != release.PackageBytes || HashFile(zipPath) != release.PackageSha256) throw new IOException("Архив обновления не прошёл проверку.");
        SettingsStore.NoLinks(folder); Directory.CreateDirectory(folder);
        using var zip = ZipFile.OpenRead(zipPath); var names = new HashSet<string>(StringComparer.OrdinalIgnoreCase); long total = 0;
        if (zip.Entries.Count is < 3 or > 301) throw new IOException("Неверный архив обновления.");
        foreach (var entry in zip.Entries) {
            total += entry.Length;
            if (!SafeName(entry.FullName) || !names.Add(entry.FullName) || total > 512 * 1024 * 1024
                || ((entry.ExternalAttributes >> 16) & 0xf000) == 0xa000 || (entry.ExternalAttributes & (int)FileAttributes.ReparsePoint) != 0)
                throw new IOException("Неверный путь архива.");
            var path = Path.Combine(folder, entry.FullName.Replace('/', Path.DirectorySeparatorChar)); SettingsStore.NoLinks(path);
            Directory.CreateDirectory(Path.GetDirectoryName(path)!); using var input=entry.Open();using var output=new FileStream(path,FileMode.CreateNew,FileAccess.Write);
            var buffer=new byte[65536];long written=0;int count;
            while((count=input.Read(buffer))>0){written+=count;if(written>entry.Length)throw new IOException("Размер файла в архиве не совпадает.");output.Write(buffer,0,count);}
            if(written!=entry.Length)throw new IOException("Размер файла в архиве не совпадает.");
        }
        VerifyPackage(folder, release);
    }
    public static void Atomic(string path, byte[] bytes) {
        SettingsStore.NoLinks(path); var next = path + ".next"; SettingsStore.NoLinks(next);
        File.WriteAllBytes(next, bytes); File.Move(next, path, true);
    }
}

public sealed class UpdateManager(SettingsStore settings, HubConnection hub)
{
    public bool Running { get; private set; }
    UpdateRelease? verifiedInstalled;
    DateTimeOffset lastAttempt;
    public string? VerifiedHelpers {
        get {
            if (verifiedInstalled is null || UpdateManager.InstalledRelease(settings)!=verifiedInstalled.ManifestSha256) return null;
            var folder=Path.Combine(settings.Directory,"releases",verifiedInstalled.ManifestSha256);
            ReleaseVerifier.VerifyPackage(folder,verifiedInstalled);
            var helpers=Path.Combine(folder,"helpers");return Directory.Exists(helpers)?helpers:null;
        }
    }
    public UpdateState State { get; private set; } = LoadState(settings);
    public string Description => State.State switch {
        "downloading" => "Загружаем обновление " + State.Version,
        "ready" => "Проверено " + State.Version + " · установим после закрытия окна и завершения настройки",
        "activating" => "Переключаем интерфейс Companion",
        "failed" => "Обновление отложено · " + State.Error,
        "committed" => "✓ Companion " + CompanionVersion.Current + " · обновление подтверждено",
        _ => "Companion " + CompanionVersion.Current + " · " + (State.CheckedAt == default ? "ожидаем проверку обновлений" : "проверено " + State.CheckedAt.ToLocalTime().ToString("HH:mm"))
    };
    static string StatePath(SettingsStore settings) => Path.Combine(settings.Directory,"update-state.json");
    public static UpdateState LoadState(SettingsStore settings) {
        try { var path=StatePath(settings);SettingsStore.NoLinks(path);return !File.Exists(path)?new():new FileInfo(path).Length<16384
            ? JsonSerializer.Deserialize<UpdateState>(File.ReadAllBytes(path),SettingsStore.Json) ?? throw new IOException() : throw new IOException(); } catch { return new(long.MaxValue,State:"failed",Error:"Состояние обновления не прочитано; проверь установку."); }
    }
    public static void SaveState(SettingsStore settings, UpdateState state) => ReleaseVerifier.Atomic(StatePath(settings),JsonSerializer.SerializeToUtf8Bytes(state,SettingsStore.Json));
    public async Task Check(bool force = false)
    {
        if (Running || hub.Session is null || !force && DateTimeOffset.UtcNow-lastAttempt < TimeSpan.FromMinutes(10)
            || verifiedInstalled is not null && !force && DateTimeOffset.UtcNow-State.CheckedAt < TimeSpan.FromHours(6)) return;
        Running = true;lastAttempt=DateTimeOffset.UtcNow;var account=hub.Session;
        try {
            var response = await hub.Request("/api/companion/update");
            if (!response.GetProperty("available").GetBoolean()) { State=State with { CheckedAt=DateTimeOffset.UtcNow };SaveState(settings,State);return; }
            if(hub.Session?.UserId!=account.UserId || hub.Session.HubOrigin!=account.HubOrigin)throw new IOException("Подключение Hub изменилось; проверим обновление заново.");
            var signed = response.GetProperty("signed").Deserialize<SignedUpdate>(SettingsStore.Json)!;
            var release = ReleaseVerifier.Verify(signed,State.HighestSequence);
            var installed=InstalledRelease(settings);
            if (installed == release.ManifestSha256) { ReleaseVerifier.VerifyPackage(Path.Combine(settings.Directory,"releases",installed),release);verifiedInstalled=release;
                State = new(Math.Max(State.HighestSequence,release.Sequence),DateTimeOffset.UtcNow,State:"committed",Version:release.Version); SaveState(settings,State);return; }
            if (!force && State.State is "ready" or "failed" && State.HighestSequence == release.Sequence) { State=State with {CheckedAt=DateTimeOffset.UtcNow};SaveState(settings,State);return; }
            PruneStaging(settings,State.Nonce);
            var nonce=Guid.NewGuid().ToString("N");var folder=Folder(settings,nonce);Directory.CreateDirectory(folder);
            State=new(release.Sequence,DateTimeOffset.UtcNow,nonce,"downloading",release.Version);SaveState(settings,State);
            ReleaseVerifier.Atomic(Path.Combine(folder,"signed.json"),JsonSerializer.SerializeToUtf8Bytes(signed,SettingsStore.Json));
            var zip=Path.Combine(folder,"update.zip"); await hub.DownloadUpdate(release.PackageSha256,zip,release.PackageBytes,account);
            if(hub.Session?.UserId!=account.UserId || hub.Session.HubOrigin!=account.HubOrigin)throw new IOException("Подключение Hub изменилось; проверим обновление заново.");
            await Task.Run(()=>ReleaseVerifier.Extract(zip,Path.Combine(folder,"package"),release));
            State=State with {State="ready",Error=""};SaveState(settings,State);
        } catch (Exception e) { State=State with {State="failed",CheckedAt=DateTimeOffset.UtcNow,Error=e is IOException ? e.Message : "Проверим при следующем подключении."};SaveState(settings,State); }
        finally { Running=false; }
    }
    public static void PruneStaging(SettingsStore settings,string retainedNonce) {
        var root=Path.Combine(settings.Directory,"updates");SettingsStore.NoLinks(root);if(!Directory.Exists(root))return;
        var old=Directory.EnumerateDirectories(root).Where(p=>Regex.IsMatch(Path.GetFileName(p),"^[a-f0-9]{32}$") && Path.GetFileName(p)!=retainedNonce)
            .OrderByDescending(p=>Directory.GetLastWriteTimeUtc(p)).ToArray();
        foreach(var folder in old.Skip(1)){SettingsStore.NoLinks(folder);foreach(var child in Directory.EnumerateFileSystemEntries(folder,"*",SearchOption.AllDirectories))SettingsStore.NoLinks(child);
            Directory.Delete(folder,true);}
    }
    public static string Folder(SettingsStore settings,string nonce) {
        if (!Regex.IsMatch(nonce,"^[a-f0-9]{32}$")) throw new IOException("Неверный receipt обновления.");
        var folder=Path.Combine(settings.Directory,"updates",nonce);SettingsStore.NoLinks(folder);return folder;
    }
    public static string InstalledRelease(SettingsStore settings) {
        var path=Path.Combine(settings.Directory,"current.json");SettingsStore.NoLinks(path);
        using var doc=JsonDocument.Parse(File.ReadAllBytes(path));
        if(doc.RootElement.GetProperty("sid").GetString()!=settings.Sid)throw new IOException("Другая Windows identity.");
        var release=doc.RootElement.GetProperty("release").GetString()!;if(!ReleaseVerifier.Digest(release))throw new IOException("Установленный пакет нужно проверить.");return release;
    }
    public void StartActivation(int selectedPage, double[]? offsets = null)
    {
        if(Running || State.State!="ready")throw new IOException("Обновление ещё не подготовлено.");
        var folder=Folder(settings,State.Nonce); using var current=Process.GetCurrentProcess();
        var activation=new UpdateActivation(settings.Sid,State.Nonce,current.Id,current.StartTime.ToUniversalTime().Ticks,Environment.ProcessPath!,
            Convert.ToBase64String(File.ReadAllBytes(Path.Combine(settings.Directory,"current.json"))),selectedPage,offsets);
        ReleaseVerifier.Atomic(Path.Combine(folder,"activation.json"),JsonSerializer.SerializeToUtf8Bytes(activation,SettingsStore.Json));
        var start=new ProcessStartInfo(Environment.ProcessPath!) {UseShellExecute=false,CreateNoWindow=true};
        start.ArgumentList.Add("--apply-update");start.ArgumentList.Add(State.Nonce);
        if(Process.Start(start) is null)throw new IOException("Обновление не запустилось.");
        State=State with {State="activating"};SaveState(settings,State);
    }
}

public static class UpdateActivationWorker
{
    public static int Run(string nonce)
    {
        var settings=new SettingsStore(SettingsStore.DirectoryPath,SettingsStore.CurrentSid);
        using var installation=new Mutex(false,"Local\\codex-web-companion-ui-install-"+settings.Sid);
        bool acquired=false; byte[]? previous=null; Process? child=null; long childStart=0; string? executable=null; bool switched=false;
        try {
            try {acquired=installation.WaitOne(0);}catch(AbandonedMutexException){acquired=true;}
            if(!acquired)throw new IOException("Другая установка уже выполняется.");
            var folder=UpdateManager.Folder(settings,nonce);var activationPath=Path.Combine(folder,"activation.json");
            SettingsStore.NoLinks(activationPath);if(new FileInfo(activationPath).Length>32768)throw new IOException();
            var activation=JsonSerializer.Deserialize<UpdateActivation>(File.ReadAllBytes(activationPath),SettingsStore.Json)!;
            if(activation.Sid!=settings.Sid || activation.Nonce!=nonce || activation.ParentPid<=0)throw new IOException();
            var state=UpdateManager.LoadState(settings);if(state.Nonce!=nonce || state.State is not ("ready" or "activating"))throw new IOException();
            var signedPath=Path.Combine(folder,"signed.json");SettingsStore.NoLinks(signedPath);
            if(new FileInfo(signedPath).Length>32768)throw new IOException();
            var signed=JsonSerializer.Deserialize<SignedUpdate>(File.ReadAllBytes(signedPath),SettingsStore.Json)!;
            var release=ReleaseVerifier.Verify(signed,state.HighestSequence);
            previous=Convert.FromBase64String(activation.PreviousPointer);
            var pointerPath=Path.Combine(settings.Directory,"current.json");SettingsStore.NoLinks(pointerPath);
            if(!File.ReadAllBytes(pointerPath).SequenceEqual(previous))throw new IOException("Установка уже изменилась.");
            using(var old=JsonDocument.Parse(previous)) {
                if(old.RootElement.GetProperty("sid").GetString()!=settings.Sid)throw new IOException();
                var oldRelease=old.RootElement.GetProperty("release").GetString()!;if(!ReleaseVerifier.Digest(oldRelease))throw new IOException();
                var expected=Path.Combine(settings.Directory,"releases",oldRelease,"CodexWeb.Companion.exe");
                if(!string.Equals(expected,activation.ParentExecutable,StringComparison.OrdinalIgnoreCase)|| !string.Equals(expected,Environment.ProcessPath,StringComparison.OrdinalIgnoreCase))throw new IOException();
            }
            try {using var parent=Process.GetProcessById(activation.ParentPid);
                if(parent.StartTime.ToUniversalTime().Ticks!=activation.ParentStart || !string.Equals(parent.MainModule?.FileName,activation.ParentExecutable,StringComparison.OrdinalIgnoreCase))throw new IOException("Процесс интерфейса изменился.");
                if(!parent.WaitForExit(60000))throw new IOException("Окно ещё занято; обновление отложено.");
            }catch(ArgumentException){ /* Original UI already exited after launching this worker. */ }
            if(!File.ReadAllBytes(pointerPath).SequenceEqual(previous))throw new IOException("Установка уже изменилась.");
            var package=Path.Combine(folder,"package");ReleaseVerifier.VerifyPackage(package,release);
            var target=Path.Combine(settings.Directory,"releases",release.ManifestSha256);SettingsStore.NoLinks(target);Directory.CreateDirectory(target);
            foreach(var file in Directory.EnumerateFiles(package,"*",SearchOption.AllDirectories)) {
                var dest=Path.Combine(target,Path.GetRelativePath(package,file));SettingsStore.NoLinks(dest);Directory.CreateDirectory(Path.GetDirectoryName(dest)!);
                if(File.Exists(dest)) {if(ReleaseVerifier.HashFile(dest)!=ReleaseVerifier.HashFile(file))throw new IOException("Immutable release изменился.");}
                else File.Copy(file,dest);
            }
            ReleaseVerifier.VerifyPackage(target,release);
            settings.Load(); // Never overwrite profile, account, helpers or launcher.
            executable=Path.Combine(target,"CodexWeb.Companion.exe");
            ReleaseVerifier.Atomic(Path.Combine(folder,"previous.json"),previous);
            ReleaseVerifier.Atomic(pointerPath,JsonSerializer.SerializeToUtf8Bytes(new {sid=settings.Sid,release=release.ManifestSha256,version=release.Version,
                executableSha256=ReleaseVerifier.HashFile(executable),installedAt=DateTimeOffset.UtcNow},SettingsStore.Json));switched=true;
            var start=new ProcessStartInfo(executable){UseShellExecute=false,CreateNoWindow=true,WorkingDirectory=target};
            start.ArgumentList.Add("--tray");start.ArgumentList.Add("--update-health");start.ArgumentList.Add(nonce);
            child=Process.Start(start)??throw new IOException("Новый интерфейс не запустился.");childStart=child.StartTime.ToUniversalTime().Ticks;
            var healthPath=Path.Combine(folder,"health.json");var deadline=DateTimeOffset.UtcNow+TimeSpan.FromSeconds(45);
            while(DateTimeOffset.UtcNow<deadline && !child.HasExited) {
                SettingsStore.NoLinks(healthPath);
                if(File.Exists(healthPath)) {
                    using var health=JsonDocument.Parse(File.ReadAllBytes(healthPath));var data=health.RootElement;
                    if(data.GetProperty("nonce").GetString()==nonce && data.GetProperty("pid").GetInt32()==child.Id
                        && data.GetProperty("started").GetInt64()==childStart && data.GetProperty("release").GetString()==release.ManifestSha256
                        && data.GetProperty("version").GetString()==release.Version) {
                        UpdateManager.SaveState(settings,state with {State="committed",CheckedAt=DateTimeOffset.UtcNow,Version=release.Version,Error=""});return 0;
                    }
                }
                Thread.Sleep(250);
            }
            throw new IOException("Новая версия не подтвердила запуск; вернули предыдущую.");
        } catch(Exception e) {
            if(!acquired)return 1;
            if(switched && previous is not null) {
                if(child is not null && !child.HasExited && child.StartTime.ToUniversalTime().Ticks==childStart
                    && string.Equals(child.MainModule?.FileName,executable,StringComparison.OrdinalIgnoreCase)) {child.Kill();child.WaitForExit(10000);}
                ReleaseVerifier.Atomic(Path.Combine(settings.Directory,"current.json"),previous);
                using var old=JsonDocument.Parse(previous);
                var oldExe=Path.Combine(settings.Directory,"releases",old.RootElement.GetProperty("release").GetString()!,"CodexWeb.Companion.exe");
                var start=new ProcessStartInfo(oldExe){UseShellExecute=false,CreateNoWindow=true};start.ArgumentList.Add("--tray");Process.Start(start);
            }
            var state=UpdateManager.LoadState(settings);UpdateManager.SaveState(settings,state with {State="failed",Error=e is IOException?e.Message:"Не удалось подтвердить обновление."});return 1;
        } finally {child?.Dispose();if(acquired)installation.ReleaseMutex();}
    }
    public static int WriteHealth(MainWindow window,string nonce)
    {
        var settings=new SettingsStore(SettingsStore.DirectoryPath,SettingsStore.CurrentSid);var folder=UpdateManager.Folder(settings,nonce);
        var activation=JsonSerializer.Deserialize<UpdateActivation>(File.ReadAllBytes(Path.Combine(folder,"activation.json")),SettingsStore.Json)!;
        if(activation.Sid!=settings.Sid || activation.Nonce!=nonce)throw new IOException();
        var profile=settings.Load();_ = new DeviceSessionStore(settings).Load(profile.HubOrigin);
        var release=UpdateManager.InstalledRelease(settings);
        if(!string.Equals(Environment.ProcessPath,Path.Combine(settings.Directory,"releases",release,"CodexWeb.Companion.exe"),StringComparison.OrdinalIgnoreCase))throw new IOException();
        using var current=Process.GetCurrentProcess();
        ReleaseVerifier.Atomic(Path.Combine(folder,"health.json"),JsonSerializer.SerializeToUtf8Bytes(new {nonce,pid=current.Id,started=current.StartTime.ToUniversalTime().Ticks,release,version=CompanionVersion.Current},SettingsStore.Json));
        window.RestoreView(activation.SelectedPage,activation.ScrollOffsets);return 0;
    }
}
