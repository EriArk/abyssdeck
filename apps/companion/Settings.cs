using System.Security.Principal;
using System.Text.Json;
using Microsoft.Win32;

namespace CodexWeb.Companion;

public sealed record Profile(string Sid, string HubOrigin, string DeviceId, string Route,
    string Theme = "classic-dark", bool AutoStart = true);

public sealed class SettingsStore(string directory, string sid)
{
    public static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web) { WriteIndented = true };
    public static string CurrentSid => OperatingSystem.IsWindows()
        ? WindowsIdentity.GetCurrent().User!.Value : Environment.UserName;
    public static string DirectoryPath => Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "CodexWeb", "companion-app");
    public string Directory { get; } = Path.GetFullPath(directory);
    public string Sid { get; } = sid;
    public string FilePath => Path.Combine(Directory, "profile.json");

    public static bool ValidOrigin(string text) => !text.Any(char.IsControl) && Uri.TryCreate(text, UriKind.Absolute, out var uri)
        && uri.Scheme == "https" && uri.UserInfo.Length == 0 && uri.AbsolutePath == "/"
        && uri.Query.Length == 0 && uri.Fragment.Length == 0;

    public static void NoLinks(string path)
    {
        for (var current = Path.GetFullPath(path); current is not null; current = Path.GetDirectoryName(current))
            if ((File.Exists(current) || System.IO.Directory.Exists(current))
                && (File.GetAttributes(current) & FileAttributes.ReparsePoint) != 0)
                throw new IOException("Папка Companion содержит ссылку.");
    }

    public Profile Load()
    {
        NoLinks(FilePath);
        if (!File.Exists(FilePath)) return new(Sid, "", "", "Не настроен", AutoStart: false);
        if (new FileInfo(FilePath).Length > 16_384) throw new IOException("Настройки слишком велики.");
        var profile = JsonSerializer.Deserialize<Profile>(File.ReadAllText(FilePath), Json)
            ?? throw new IOException("Не удалось прочитать настройки.");
        Validate(profile);
        return profile;
    }

    public void Validate(Profile profile)
    {
        if (profile.Sid != Sid) throw new IOException("Настройки принадлежат другой Windows-сессии.");
        if (profile.HubOrigin.Length != 0 && !ValidOrigin(profile.HubOrigin))
            throw new IOException("Адрес Hub должен быть HTTPS origin без пути, пароля и параметров.");
        if (profile.DeviceId.Length > 100 || profile.Route.Length > 100
            || !Themes.Ids.Contains(profile.Theme)) throw new IOException("Неверные настройки Companion.");
    }

    public void Save(Profile profile)
    {
        Validate(profile);
        NoLinks(FilePath);
        System.IO.Directory.CreateDirectory(Directory);
        var temporary = FilePath + ".tmp";
        NoLinks(temporary);
        File.WriteAllText(temporary, JsonSerializer.Serialize(profile, Json));
        File.Move(temporary, FilePath, true);
    }

    public bool SetAutoStart(bool enabled)
    {
        if (!OperatingSystem.IsWindows()) return false;
        var launcher = Path.Combine(Directory, "Start-CompanionApp.ps1");
        NoLinks(launcher);
        if (!File.Exists(launcher)) return false;
        using var key = Registry.CurrentUser.CreateSubKey(@"Software\Microsoft\Windows\CurrentVersion\Run");
        if (enabled)
        {
            var powershell = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System), @"WindowsPowerShell\v1.0\powershell.exe");
            key.SetValue("CodexWebCompanionApp", $"\"{powershell}\" -NoLogo -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File \"{launcher}\" -Tray");
        }
        else key.DeleteValue("CodexWebCompanionApp", false);
        return true;
    }
}
