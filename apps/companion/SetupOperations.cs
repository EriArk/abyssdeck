using System.Diagnostics;
using System.IO.Compression;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Reflection;

namespace CodexWeb.Companion;

public sealed class SetupOperations(SettingsStore settings, HubConnection hub)
{
    public bool Running { get; private set; }
    public string State { get; private set; } = "";
    public async Task Start()
    {
        if (Running) return;
        Running = true;
        try {
            var session = hub.Enrollment();
            State = "Готовим личное подключение…";
            var created = await hub.Request("/api/companion/enrollment", new { id = session.EnrollmentId, token = session.EnrollmentToken });
            var nativeState = created.GetProperty("enrollment").GetProperty("state").GetString();
            if (nativeState is "reported" or "approved") { State = nativeState == "approved" ? "Подключение подтверждено в Hub" : "Ожидаем подтверждение подключения в Hub"; hub.Checkpoint(nativeState); return; }
            var folder = Path.Combine(settings.Directory, "setup", session.EnrollmentId); SettingsStore.NoLinks(folder);
            Directory.CreateDirectory(folder);
            var bootstrap = Path.Combine(folder, "Connect-CodexWeb.ps1");
            SettingsStore.NoLinks(bootstrap);
            if (!File.Exists(bootstrap) || session.BootstrapHash.Length != 64) {
                var bundle = await hub.Request($"/api/companion/enrollment/{session.EnrollmentId}/bundle", new { token = session.EnrollmentToken });
                var bytes = Convert.FromBase64String(bundle.GetProperty("base64").GetString()!);
                if (bytes.Length > 12 * 1024 * 1024 || Convert.ToHexStringLower(SHA256.HashData(bytes)) != bundle.GetProperty("sha256").GetString()) throw new IOException("Пакет подключения не прошёл проверку.");
                using var zip = new ZipArchive(new MemoryStream(bytes));
                var entry = zip.GetEntry("Connect-CodexWeb.ps1") ?? throw new IOException("Нет мастера в пакете.");
                if (entry.Length > 8 * 1024 * 1024) throw new IOException("Пакет слишком велик.");
                SettingsStore.NoLinks(bootstrap);
                var next = bootstrap + ".tmp"; SettingsStore.NoLinks(next);
                using (var input = entry.Open()) using (var output = new FileStream(next, FileMode.Create, FileAccess.Write)) await input.CopyToAsync(output);
                var digest = Convert.ToHexStringLower(SHA256.HashData(File.ReadAllBytes(next)));
                File.Move(next, bootstrap, true);
                session = hub.Checkpoint("downloaded", digest);
            }
            SettingsStore.NoLinks(bootstrap);
            if (new FileInfo(bootstrap).Length > 8 * 1024 * 1024 || Convert.ToHexStringLower(SHA256.HashData(File.ReadAllBytes(bootstrap))) != session.BootstrapHash)
                throw new IOException("Пакет настройки изменился. Войди снова для получения проверенного пакета.");
            using var mutex = new Mutex(false, "Local\\CodexWebEnrollment-" + session.EnrollmentId);
            var acquired = false; try { acquired = mutex.WaitOne(0); } catch (AbandonedMutexException) { acquired = true; }
            if (!acquired) { State = "Настройка уже выполняется. Заверши текущий личный шаг."; return; }
            mutex.ReleaseMutex();
            hub.Checkpoint("setup_running"); State = "Настраиваем ПК. Заверши личные входы и запросы Windows.";
            var start = new ProcessStartInfo(PowerShell) { UseShellExecute = false, CreateNoWindow = true };
            foreach (var arg in new[] { "-NoLogo", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", bootstrap, "-Companion", "-ExpectedSid", settings.Sid }) start.ArgumentList.Add(arg);
            using var process = Process.Start(start) ?? throw new IOException("Мастер не запустился.");
            await process.WaitForExitAsync();
            // No process termination on window hiding, no automatic retry after uncertain effects.
            State = process.ExitCode == 0 ? "Проверяем подготовленное подключение…" : "Настройка приостановлена. Продолжи после личного действия.";
            hub.Checkpoint(process.ExitCode == 0 ? "checking" : "user_step");
        } finally { Running = false; }
    }
    public static string PowerShell => Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System), @"WindowsPowerShell\v1.0\powershell.exe");
    public string Progress()
    {
        var id = hub.Session?.EnrollmentId;
        if (string.IsNullOrEmpty(id)) return State;
        try {
            var path = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "CodexWeb", "enrollment", id, "setup-state.json");
            SettingsStore.NoLinks(path); if (!File.Exists(path) || new FileInfo(path).Length > 8192) return State;
            using var doc = JsonDocument.Parse(File.ReadAllBytes(path)); var data = doc.RootElement;
            if (data.GetProperty("id").GetString() != id || data.GetProperty("sid").GetString() != settings.Sid
                || data.GetProperty("machineGuid").GetString()?.ToLowerInvariant() != DeviceSessionStore.MachineGuid()) return State;
            var labels = new[] { "Подготовка", "Приватная сеть", "Рабочие папки", "Программы и входы", "Приватный SSH", "Подтверждение Hub" };
            var step = data.GetProperty("lastStep").GetInt32();
            return step is >= 1 and <= 5 ? $"{step} из 5 · {labels[step]}" : State;
        } catch { return State; }
    }
    async Task<string> RepairKit()
    {
        var kit = await hub.Request("/api/companion/repair-kit");
        var files = kit.GetProperty("files").EnumerateArray().ToArray();
        if (files.Length is < 1 or > 100) throw new IOException("Неверный пакет ремонта.");
        var folder = Path.Combine(settings.Directory, "repair", Guid.NewGuid().ToString("N"));
        SettingsStore.NoLinks(folder); Directory.CreateDirectory(folder);
        long total = 0;
        foreach (var file in files) {
            var name = file.GetProperty("name").GetString()!;
            if (!System.Text.RegularExpressions.Regex.IsMatch(name, @"^[A-Za-z0-9_-]+(?:/[A-Za-z0-9_-]+)*\.(ps1|cjs|js|cs)$")) throw new IOException("Неверный файл ремонта.");
            var bytes = Convert.FromBase64String(file.GetProperty("data").GetString()!);
            total += bytes.Length; if (bytes.Length > 1024 * 1024 || total > 8 * 1024 * 1024) throw new IOException("Неверный размер пакета ремонта.");
            var target = Path.Combine(folder, name.Replace('/', Path.DirectorySeparatorChar));
            SettingsStore.NoLinks(target); Directory.CreateDirectory(Path.GetDirectoryName(target)!);
            using var output = new FileStream(target, FileMode.CreateNew, FileAccess.Write); await output.WriteAsync(bytes);
        }
        return folder;
    }
    public async Task Repair(Component component, Inventory inventory)
    {
        if (Running) return;
        if (!component.Known || component.Installed && (!component.Owned || component.TaskDigest.Length != 64))
            throw new IOException("Windows не подтвердил задачу этого пользователя. Сначала проверь состояние.");
        if (component.State == "Running") throw new IOException("Компонент работает. Проверим состояние, не прерывая его.");
        if (component.Id is "CodexWebCompanion" or "CodexWebCompanionPersistent" && inventory.NativeProcesses.Length > 0)
            throw new IOException("Codex выполняет работу; запуск другого исполнителя отложен.");
        Running = true;
        try {
            var reinstall = !component.Installed || !component.ExecutableExists;
            if (reinstall && component.Id is "CodexWebCompanion" or "CodexWebCompanionPersistent")
                throw new IOException("Исполнитель Codex требует отдельного перехода с сохранением конфигурации. Другие компоненты можно ремонтировать независимо.");
            SettingsStore.NoLinks(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "CodexWeb", component.Folder));
            var source = reinstall ? await RepairKit() : "";
            using var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("CodexWeb.Companion.Repair-CompanionComponent.ps1")!;
            using var reader = new StreamReader(stream);
            var script = await reader.ReadToEndAsync();
            var prefix = "$componentId='" + component.Id.Replace("'", "''") + "';$expectedSid='" + settings.Sid.Replace("'", "''")
                + "';$expectedDigest='" + component.TaskDigest.Replace("'", "''") + "';$repairSource='" + source.Replace("'", "''") + "';";
            var elevate = reinstall && component.Id == "CodexWebDesktopRestart";
            var start = new ProcessStartInfo(PowerShell) { UseShellExecute = elevate, CreateNoWindow = !elevate,
                WindowStyle = ProcessWindowStyle.Hidden, RedirectStandardError = !elevate, RedirectStandardOutput = !elevate };
            if (elevate) start.Verb = "runas"; // The elevated child rechecks the same SID and exact task definition.
            foreach(var arg in new[] { "-NoLogo", "-NoProfile", "-NonInteractive", "-EncodedCommand", Convert.ToBase64String(Encoding.Unicode.GetBytes(prefix + script)) }) start.ArgumentList.Add(arg);
            using var process = Process.Start(start) ?? throw new IOException("Ремонт не запустился.");
            var drainOut = elevate ? Task.FromResult("") : process.StandardOutput.ReadToEndAsync();
            var drainError = elevate ? Task.FromResult("") : process.StandardError.ReadToEndAsync();
            State = "Ремонт компонента…";
            await process.WaitForExitAsync(); // UI stays responsive; no uncertain timeout replay or child termination.
            await Task.WhenAll(drainOut, drainError);
            if (process.ExitCode != 0) throw new IOException("Windows не подтвердил ремонт. Проверь состояние компонента.");
            State = "Ремонт выполнен; проверяем результат.";
        } finally { Running = false; }
    }
}
