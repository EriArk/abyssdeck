using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.Win32;

namespace CodexWeb.Companion;

public sealed record DeviceSession(string HubOrigin, string Sid, string MachineGuid, string Token,
    string UserId, string EnrollmentId = "", string EnrollmentToken = "", string Stage = "connected", string BootstrapHash = "");
public sealed class DeviceSessionStore(SettingsStore settings)
{
    string PathName => Path.Combine(settings.Directory, "device-session.bin");
    public DeviceSession? Load(string origin)
    {
        SettingsStore.NoLinks(PathName);
        if (!File.Exists(PathName)) return null;
        if (new FileInfo(PathName).Length > 32768) throw new IOException("Неверные данные подключения.");
        var bytes = Protect(File.ReadAllBytes(PathName), false);
        try {
            var result = JsonSerializer.Deserialize<DeviceSession>(bytes, SettingsStore.Json);
            return result is not null && result.Sid == settings.Sid && result.HubOrigin == origin
                && result.MachineGuid == MachineGuid() ? result : null;
        } finally { CryptographicOperations.ZeroMemory(bytes); }
    }
    public void Save(DeviceSession value)
    {
        if (value.Sid != settings.Sid || !SettingsStore.ValidOrigin(value.HubOrigin)
            || value.MachineGuid != MachineGuid()) throw new IOException("Подключение принадлежит другому ПК.");
        SettingsStore.NoLinks(PathName); Directory.CreateDirectory(settings.Directory);
        var bytes = JsonSerializer.SerializeToUtf8Bytes(value, SettingsStore.Json);
        try { var next = PathName + ".tmp"; SettingsStore.NoLinks(next);
            File.WriteAllBytes(next, Protect(bytes, true)); File.Move(next, PathName, true);
        } finally { CryptographicOperations.ZeroMemory(bytes); }
    }
    public void Clear() { SettingsStore.NoLinks(PathName); if (File.Exists(PathName)) File.Delete(PathName); }
    public static string MachineGuid() {
        if (!OperatingSystem.IsWindows()) throw new IOException("Требуется Windows.");
        return (Registry.GetValue(@"HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Cryptography", "MachineGuid", null)
            as string ?? throw new IOException("Windows identity недоступна.")).ToLowerInvariant();
    }
    [StructLayout(LayoutKind.Sequential)] struct Blob { public int Size; public IntPtr Data; }
    [DllImport("crypt32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    static extern bool CryptProtectData(ref Blob input, string? description, IntPtr entropy, IntPtr reserved, IntPtr prompt, int flags, out Blob output);
    [DllImport("crypt32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    static extern bool CryptUnprotectData(ref Blob input, IntPtr description, IntPtr entropy, IntPtr reserved, IntPtr prompt, int flags, out Blob output);
    [DllImport("kernel32.dll")] static extern IntPtr LocalFree(IntPtr memory);
    static byte[] Protect(byte[] bytes, bool encrypt)
    {
        var input = new Blob { Size = bytes.Length, Data = Marshal.AllocHGlobal(bytes.Length) };
        Marshal.Copy(bytes, 0, input.Data, bytes.Length); Blob output = default;
        try {
            var ok = encrypt ? CryptProtectData(ref input, "CodexWeb Companion", IntPtr.Zero, IntPtr.Zero, IntPtr.Zero, 1, out output)
                : CryptUnprotectData(ref input, IntPtr.Zero, IntPtr.Zero, IntPtr.Zero, IntPtr.Zero, 1, out output);
            if (!ok) throw new IOException("Windows не смог открыть сохранённое подключение. Войди снова.");
            var result = new byte[output.Size]; Marshal.Copy(output.Data, result, 0, result.Length); return result;
        } finally { for (int i = 0; i < bytes.Length; i++) Marshal.WriteByte(input.Data, i, 0);
            Marshal.FreeHGlobal(input.Data); if (output.Data != IntPtr.Zero) { for (int i = 0; i < output.Size; i++) Marshal.WriteByte(output.Data, i, 0); LocalFree(output.Data); } }
    }
}

public sealed class HubConnection(SettingsStore settings) : IDisposable
{
    public DeviceSessionStore Sessions { get; } = new(settings);
    readonly HttpClient http = new(new HttpClientHandler { AllowAutoRedirect = false, UseCookies = false })
        { Timeout = TimeSpan.FromSeconds(35) };
    public DeviceSession? Session { get; private set; }
    public void Restore(Profile profile) { Session = Sessions.Load(profile.HubOrigin); }
    static async Task<JsonElement> Body(HttpResponseMessage response)
    {
        using var stream = await response.Content.ReadAsStreamAsync();
        using var buffer = new MemoryStream(); var bytes = new byte[8192];
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(15));
        while (true) { var n = await stream.ReadAsync(bytes, timeout.Token); if (n == 0) break;
            if (buffer.Length + n > 16 * 1024 * 1024) throw new IOException("Ответ Hub слишком велик."); buffer.Write(bytes, 0, n); }
        using var doc = JsonDocument.Parse(buffer.ToArray());
        if (!response.IsSuccessStatusCode) {
            var message = doc.RootElement.TryGetProperty("error", out var e) && e.TryGetProperty("message", out var m) ? m.GetString() : "Hub пока не ответил.";
            throw new HubConnectionException((int)response.StatusCode, message ?? "Проверь подключение Hub.");
        }
        return doc.RootElement.Clone();
    }
    public async Task<DeviceSession> Login(Profile profile, string login, string password)
    {
        settings.Validate(profile); if (!SettingsStore.ValidOrigin(profile.HubOrigin)) throw new IOException("Укажи адрес Hub.");
        // Browser cookies/password are ephemeral; only the scoped native token is saved with DPAPI.
        using var client = new HttpClient(new HttpClientHandler { AllowAutoRedirect = false, UseCookies = true, CookieContainer = new CookieContainer() })
            { BaseAddress = new Uri(profile.HubOrigin), Timeout = TimeSpan.FromSeconds(35) };
        client.DefaultRequestHeaders.Add("Origin", profile.HubOrigin);
        using var signed = await client.PostAsJsonAsync("/api/auth/login", new { login, password });
        var result = await Body(signed);
        client.DefaultRequestHeaders.Add("X-CSRF-Token", result.GetProperty("csrf").GetString());
        var userId = result.GetProperty("user").GetProperty("id").GetString()!;
        using var bound = await client.PostAsJsonAsync("/api/team/companion", new { sid = settings.Sid,
            machineGuid = DeviceSessionStore.MachineGuid(), computer = Environment.MachineName, deviceId = profile.DeviceId });
        var grant = await Body(bound);
        var candidate = new DeviceSession(profile.HubOrigin, settings.Sid, DeviceSessionStore.MachineGuid(), grant.GetProperty("token").GetString()!, userId);
        return candidate;
    }
    public void Accept(DeviceSession candidate) { Sessions.Save(candidate); Session = candidate; }
    public async Task DownloadUpdate(string digest, string destination, long size, DeviceSession expected)
    {
        if (!System.Text.RegularExpressions.Regex.IsMatch(digest, "^[a-f0-9]{64}$") || size is < 1 or > 128 * 1024 * 1024) throw new IOException("Неверный пакет обновления.");
        var session = Session ?? throw new IOException("Сначала войди в Hub.");
        if(session.UserId!=expected.UserId || session.HubOrigin!=expected.HubOrigin)throw new IOException("Подключение Hub изменилось; проверим обновление заново.");
        using var client = new HttpClient(new HttpClientHandler { AllowAutoRedirect = false, UseCookies = false }) { Timeout = TimeSpan.FromMinutes(3) };
        using var request = new HttpRequestMessage(HttpMethod.Get, new Uri(new Uri(session.HubOrigin), "/api/companion/update/" + digest + "/bundle"));
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", session.Token);
        using var response = await client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead);
        if (!response.IsSuccessStatusCode) { await Body(response); return; }
        if (response.Content.Headers.ContentLength != size) throw new IOException("Размер обновления изменился.");
        SettingsStore.NoLinks(destination);
        using var timeout = new CancellationTokenSource(TimeSpan.FromMinutes(3));
        await using var source = await response.Content.ReadAsStreamAsync(timeout.Token);
        await using var output = new FileStream(destination, FileMode.CreateNew, FileAccess.Write);
        var bytes = new byte[65536]; long total = 0;
        while (true) { var n = await source.ReadAsync(bytes, timeout.Token); if (n == 0) break;
            total += n; if (total > size) throw new IOException("Пакет обновления слишком велик."); await output.WriteAsync(bytes.AsMemory(0,n), timeout.Token); }
        if (total != size) throw new IOException("Обновление загружено не полностью.");
    }
    public async Task<JsonElement> Request(string path, object? body = null)
    {
        var session = Session ?? throw new IOException("Сначала войди в Hub.");
        if (!path.StartsWith("/api/companion/", StringComparison.Ordinal)) throw new IOException("Недоступная операция Companion.");
        using var request = new HttpRequestMessage(body is null ? HttpMethod.Get : HttpMethod.Post, new Uri(new Uri(session.HubOrigin), path));
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", session.Token);
        if (body is not null) request.Content = JsonContent.Create(body);
        using var response = await http.SendAsync(request, HttpCompletionOption.ResponseHeadersRead);
        return await Body(response);
    }
    public DeviceSession Checkpoint(string stage, string? bootstrapHash = null)
    {
        var current = Session ?? throw new IOException("Сначала войди в Hub.");
        var next = current with { Stage = stage, BootstrapHash = bootstrapHash ?? current.BootstrapHash }; Sessions.Save(next); Session = next; return next;
    }
    public DeviceSession Enrollment()
    {
        var current = Session ?? throw new IOException("Сначала войди в Hub.");
        if (current.EnrollmentId.Length != 0) return current;
        var next = current with { EnrollmentId = Guid.NewGuid().ToString(), EnrollmentToken = Convert.ToBase64String(RandomNumberGenerator.GetBytes(32)).TrimEnd('=').Replace('+', '-').Replace('/', '_'), Stage = "enrollment_requested" };
        Sessions.Save(next); Session = next; return next;
    }
    public async Task Logout() { try { await Request("/api/companion/logout", new { }); }
        catch (HubConnectionException e) when (e.Status is 401 or 403) { }
        Sessions.Clear(); Session = null; }
    public void Dispose() => http.Dispose();
}
public sealed class HubConnectionException(int status, string message) : IOException(message) { public int Status { get; } = status; }
