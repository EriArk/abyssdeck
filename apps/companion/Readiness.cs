using System.Diagnostics;
using System.IO.Pipes;
using System.Reflection;
using System.Text;
using System.Text.Json;

namespace CodexWeb.Companion;

public sealed record Component(string Id, string Title, string Folder, bool Installed,
    bool Owned, bool Known, string State, string Executable, bool ExecutableExists, string TaskDigest = "");
public sealed record NativeProcess(int Pid, string Started);
public sealed record Requirement(string Id, string Title, bool Ready);
public sealed record Inventory(string Sid, string User, string Computer, int Session,
    Component[] Components, NativeProcess[] NativeProcesses, Requirement[]? Requirements = null);
public sealed record ComponentView(string Title, string State, string Detail, bool Attention);
public sealed record Snapshot(DateTimeOffset CheckedAt, Inventory Inventory, ComponentView[] Components,
    string HubState, bool HubReady, string[] Roots, string Runtime, string? Notice);

public static class StatusProjection
{
    public static ComponentView Project(Component c, bool? pipe = null)
    {
        if (!c.Known) return new(c.Title, "Неизвестно", "Windows не вернул сведения о задаче.", true);
        if (!c.Installed) return new(c.Title, "Не установлен", "Компонент не найден на этом ПК.", true);
        if (!c.Owned) return new(c.Title, "Неизвестно", "Задача не подтверждена для текущей Windows-сессии.", true);
        if (!c.ExecutableExists) return new(c.Title, "Требуется действие", "Файл зарегистрированной задачи отсутствует.", true);
        if (c.State == "Disabled") return new(c.Title, "Выключен", "Задача отключена в Windows.", false);
        if (c.State == "Running" && pipe == false) return new(c.Title, "Недоступен", "Процесс запущен, но локальный статус не отвечает.", true);
        if (c.State == "Running") return new(c.Title, "Запущен", pipe == true ? "Локальное соединение отвечает." : "Работает в этой Windows-сессии.", false);
        if (c.State == "Ready" && c.Id is "CodexWebCompanion" or "CodexWebCompanionPersistent" or "CodexWebComputerUse")
            return new(c.Title, "Остановлен", "Компонент установлен, но его локальный процесс не запущен.", true);
        if (c.State == "Ready") return new(c.Title, "Готов по запросу", "Windows запускает этот компонент при необходимости.", false);
        return new(c.Title, "Неизвестно", "Состояние Windows: " + c.State, true);
    }
}

public sealed class ReadinessService(SettingsStore settings, Func<Task<Inventory>>? inventoryReader = null,
    Func<Profile, Task<Snapshot>>? customReader = null) : IDisposable
{
    readonly object gate = new();
    Task<Snapshot>? pending;
    readonly HttpClient http = new(new HttpClientHandler { AllowAutoRedirect = false, UseCookies = false })
    { Timeout = TimeSpan.FromSeconds(6) };
    public Task<Snapshot> Refresh(Profile profile)
    {
        // One slow probe finishes; polling/focus does not cancel or starve it.
        lock (gate)
        {
            if (pending is { IsCompleted: false }) return pending;
            pending = customReader is null ? Read(profile) : customReader(profile);
            return pending;
        }
    }

    async Task<Snapshot> Read(Profile profile)
    {
        settings.Validate(profile);
        var hub = Hub(profile);
        var inventory = await (inventoryReader?.Invoke() ?? ReadInventory());
        if (inventory.Sid != settings.Sid) throw new IOException("Windows identity изменилась.");
        var views = new List<ComponentView>();
        foreach (var component in inventory.Components)
        {
            bool? pipe = null;
            if (component.Owned && component.State == "Running")
            {
                if (component.Id is "CodexWebCompanionPersistent" or "CodexWebCompanion")
                    pipe = await Ping((component.Id.EndsWith("Persistent") ? "codex-web-persistent-" : "codex-web-") + settings.Sid);
                if (component.Id == "CodexWebComputerUse")
                {
                    pipe = await ComputerUseStatus(inventory.Session);
                    if (pipe is null)
                    {
                        views.Add(new(component.Title, "Занято", "Computer Use выполняет действие.", false));
                        continue;
                    }
                }
            }
            views.Add(StatusProjection.Project(component, pipe));
        }
        var healthyWriter = inventory.Components.Any(c => c.Id is "CodexWebCompanionPersistent" or "CodexWebCompanion"
            && c.Installed && c.Owned && c.ExecutableExists && c.State == "Running");
        for (int i = 0; i < inventory.Components.Length; i++) {
            var c = inventory.Components[i];
            if (!c.Installed && c.Known && (c.Id is "CodexWebComputerUse" or "CodexWebDesktopRestart"
                || healthyWriter && c.Id is "CodexWebCompanion" or "CodexWebCompanionPersistent"))
                views[i] = new(c.Title, "Не используется", "Дополнительный компонент; включается при необходимости.", false);
        }
        var (roots, runtime, configNotice) = ReadWorkerConfig();
        var (ready, state) = await hub;
        return new(DateTimeOffset.Now, inventory, views.ToArray(), state, ready, roots, runtime, configNotice);
    }

    public async Task<Inventory> ReadInventory()
    {
        if (!OperatingSystem.IsWindows()) throw new IOException("Эта версия Companion предназначена для Windows.");
        using var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("CodexWeb.Companion.Read-CompanionInventory.ps1")
            ?? throw new IOException("Не найден модуль проверки Windows.");
        using var reader = new StreamReader(stream);
        var script = await reader.ReadToEndAsync();
        var executable = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System), @"WindowsPowerShell\v1.0\powershell.exe");
        var start = new ProcessStartInfo(executable)
        {
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            StandardOutputEncoding = Encoding.UTF8
        };
        foreach (var arg in new[] { "-NoLogo", "-NoProfile", "-NonInteractive", "-EncodedCommand", Convert.ToBase64String(Encoding.Unicode.GetBytes(script)) }) start.ArgumentList.Add(arg);
        using var process = Process.Start(start) ?? throw new IOException("Проверка Windows не запустилась.");
        var output = process.StandardOutput.ReadToEndAsync();
        var error = process.StandardError.ReadToEndAsync();
        using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(20));
        try { await process.WaitForExitAsync(deadline.Token); }
        catch (OperationCanceledException) { try { process.Kill(true); } catch { } throw new IOException("Проверка Windows не ответила вовремя."); }
        await error; // Never surface raw PowerShell output, paths or secrets as diagnostics.
        var text = await output;
        if (process.ExitCode != 0 || text.Length > 262_144) throw new IOException("Не удалось прочитать состояние компонентов Windows.");
        return JsonSerializer.Deserialize<Inventory>(text, SettingsStore.Json) ?? throw new IOException("Нет ответа Windows.");
    }

    public (string[] Roots, string Runtime, string? Notice) ReadWorkerConfig()
    {
        var directory = Path.GetFullPath(Path.Combine(settings.Directory, "..", "companion-persistent"));
        if (!File.Exists(Path.Combine(directory, "config.json"))) directory = Path.GetFullPath(Path.Combine(settings.Directory, "..", "companion"));
        var path = Path.Combine(directory, "config.json");
        try
        {
            SettingsStore.NoLinks(path);
            if (!File.Exists(path)) return ([], "Не настроен", null);
            if (new FileInfo(path).Length > 65_536) throw new IOException();
            using var json = JsonDocument.Parse(File.ReadAllText(path));
            var roots = json.RootElement.GetProperty("workingDirectories").EnumerateArray()
                .Select(x => x.GetString()!).Where(x => !string.IsNullOrEmpty(x)).Take(128).ToArray();
            var runtime = json.RootElement.GetProperty("codexCommand").GetString() ?? "Не настроен";
            return (roots, runtime, File.Exists(runtime) ? null : "Настроенный файл Codex не найден.");
        }
        catch { return ([], "Неизвестно", "Не удалось прочитать конфигурацию постоянного Companion."); }
    }

    async Task<(bool Ready, string State)> Hub(Profile profile)
    {
        if (profile.HubOrigin.Length == 0) return (false, "Адрес не настроен");
        try
        {
            using var response = await http.GetAsync(new Uri(new Uri(profile.HubOrigin), "/api/health"), HttpCompletionOption.ResponseHeadersRead);
            if (!response.IsSuccessStatusCode) return (false, "Hub не ответил; повторим проверку автоматически");
            using var stream = await response.Content.ReadAsStreamAsync();
            using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(3));
            var bytes = new byte[4097]; var count = 0;
            while (count < bytes.Length)
            {
                var read = await stream.ReadAsync(bytes.AsMemory(count), deadline.Token);
                if (read == 0) break; count += read;
            }
            if (count > 4096) return (false, "Неизвестный ответ Hub");
            using var body = JsonDocument.Parse(bytes.AsMemory(0, count));
            return body.RootElement.TryGetProperty("ok", out var ok) && ok.ValueKind == JsonValueKind.True
                ? (true, "На связи") : (false, "Неизвестный ответ Hub");
        }
        catch { return (false, "Нет связи; повторим проверку автоматически"); }
    }

    static async Task<string> Exchange(string pipeName, string frame)
    {
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(2));
        using var pipe = new NamedPipeClientStream(".", pipeName, PipeDirection.InOut,
            PipeOptions.Asynchronous, System.Security.Principal.TokenImpersonationLevel.Impersonation);
        await pipe.ConnectAsync(timeout.Token);
        await pipe.WriteAsync(Encoding.UTF8.GetBytes(frame + "\n"), timeout.Token);
        var result = new List<byte>(); var next = new byte[1];
        while (result.Count < 4096)
        {
            if (await pipe.ReadAsync(next, timeout.Token) == 0) throw new IOException();
            if (next[0] == 10) return Encoding.UTF8.GetString(result.ToArray()).TrimEnd('\r');
            result.Add(next[0]);
        }
        throw new IOException();
    }
    static async Task<bool> Ping(string name) { try { return await Exchange(name, "PING") == "OK"; } catch { return false; } }
    async Task<bool?> ComputerUseStatus(int session)
    {
        try
        {
            var frame = JsonSerializer.Serialize(new { client = Guid.NewGuid().ToString("N"), name = "status", arguments = new { } });
            using var reply = JsonDocument.Parse(await Exchange("codex-web-computer-use-" + settings.Sid, frame));
            var text = reply.RootElement.GetProperty("content")[0].GetProperty("text").GetString()!;
            if (text.StartsWith("DESKTOP_BUSY:", StringComparison.Ordinal)) return null;
            using var body = JsonDocument.Parse(text);
            return body.RootElement.GetProperty("ready").GetBoolean() && body.RootElement.GetProperty("session").GetInt32() == session;
        }
        catch { return false; }
    }
    public void Dispose() => http.Dispose();
}
