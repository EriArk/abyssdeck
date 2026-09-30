using System.Diagnostics;
using System.IO.Pipes;
using System.Text;
using System.Text.Json;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Controls.ApplicationLifetimes;
using Avalonia.Platform;
using Avalonia.Themes.Fluent;
using Avalonia.Threading;

namespace CodexWeb.Companion;

public static class Program
{
    public static string[] Arguments = [];
    public static readonly string InstancePipe = "codex-web-companion-ui-" + SettingsStore.CurrentSid + "-" + Process.GetCurrentProcess().SessionId;
    [STAThread]
    public static int Main(string[] args)
    {
        Arguments = args;
        if (args.Length > 0 && args.Any(x => x != "--tray" && x != "--inventory")) return 2;
        if (args.Contains("--inventory"))
        {
            var store = new SettingsStore(SettingsStore.DirectoryPath, SettingsStore.CurrentSid);
            using var readiness = new ReadinessService(store);
            try { Console.WriteLine(JsonSerializer.Serialize(readiness.Refresh(store.Load()).GetAwaiter().GetResult(), SettingsStore.Json)); return 0; }
            catch { Console.Error.WriteLine("COMPANION_INVENTORY_UNAVAILABLE"); return 1; }
        }
        using var instance = new Mutex(true, "Local\\" + InstancePipe, out var created);
        if (!created)
        {
            // A second launch only raises the existing UI, never starts workers.
            if (args.Contains("--tray")) return 0;
            try
            {
                using var pipe = new NamedPipeClientStream(".", InstancePipe, PipeDirection.Out);
                pipe.Connect(3000); pipe.Write(Encoding.UTF8.GetBytes("SHOW\n")); return 0;
            }
            catch { return 3; }
        }
        return AppBuilder.Configure<CompanionApp>().UsePlatformDetect().LogToTrace()
            .StartWithClassicDesktopLifetime(args, ShutdownMode.OnExplicitShutdown);
    }
}

public sealed class CompanionApp : Application
{
    public MainWindow? Window { get; private set; }
    public bool Exiting { get; private set; }
    TrayIcon? tray;
    readonly CancellationTokenSource shutdown = new();
    public override void Initialize() => Styles.Add(new FluentTheme());
    public override void OnFrameworkInitializationCompleted()
    {
        if (ApplicationLifetime is IClassicDesktopStyleApplicationLifetime desktop)
        {
            var store = new SettingsStore(SettingsStore.DirectoryPath, SettingsStore.CurrentSid);
            Profile profile;
            string? error = null;
            try { profile = store.Load(); }
            catch (Exception e) { profile = new(store.Sid, "", "", "Не настроен", AutoStart: false); error = e is IOException ? e.Message : "Не удалось прочитать настройки."; }
            Window = new MainWindow(this, store, profile, error);
            var icon = new WindowIcon(AssetLoader.Open(new Uri("avares://CodexWeb.Companion/Assets/icon.png")));
            Window.Icon = icon;
            var menu = new NativeMenu();
            AddMenu(menu, "Открыть Companion", () => ShowWindow());
            AddMenu(menu, "Открыть CodexWeb", Window.OpenWeb);
            AddMenu(menu, "Проверить состояние", () => { ShowWindow(); _ = Window.Refresh(); });
            AddMenu(menu, "Настройки", () => { ShowWindow(); Window.SelectPage(2); });
            menu.Items.Add(new NativeMenuItemSeparator());
            AddMenu(menu, "Выйти из интерфейса", Exit);
            tray = new TrayIcon { Icon = icon, ToolTipText = "CodexWeb Companion · проверяем состояние", Menu = menu, IsVisible = true };
            tray.Clicked += (_, _) => ShowWindow();
            TrayIcon.SetIcons(this, new TrayIcons { tray });
            desktop.Exit += (_, _) => { shutdown.Cancel(); tray.Dispose(); Window.Dispose(); };
            if (!Program.Arguments.Contains("--tray")) ShowWindow();
            _ = Listen();
            _ = Window.Refresh();
        }
        base.OnFrameworkInitializationCompleted();
    }
    static void AddMenu(NativeMenu menu, string text, Action action)
    {
        var item = new NativeMenuItem(text); item.Click += (_, _) => action(); menu.Items.Add(item);
    }
    public void UpdateTray(string status) { if (tray is not null) tray.ToolTipText = "CodexWeb Companion · " + status; }
    public void ShowWindow()
    {
        if (Window is null) return;
        Window.ShowInTaskbar = true; Window.Show();
        if (Window.WindowState == WindowState.Minimized) Window.WindowState = WindowState.Normal;
        Window.Activate();
    }
    public void Exit()
    {
        Exiting = true;
        (ApplicationLifetime as IClassicDesktopStyleApplicationLifetime)?.Shutdown();
    }
    async Task Listen()
    {
        while (!shutdown.IsCancellationRequested)
        {
            try
            {
                using var pipe = new NamedPipeServerStream(Program.InstancePipe, PipeDirection.In, 1,
                    PipeTransmissionMode.Byte, PipeOptions.Asynchronous | PipeOptions.CurrentUserOnly);
                await pipe.WaitForConnectionAsync(shutdown.Token);
                using var timeout = CancellationTokenSource.CreateLinkedTokenSource(shutdown.Token);
                timeout.CancelAfter(TimeSpan.FromSeconds(2));
                var bytes = new byte[5]; var count = 0;
                while (count < bytes.Length)
                {
                    var read = await pipe.ReadAsync(bytes.AsMemory(count), timeout.Token);
                    if (read == 0) break; count += read;
                }
                if (count == 5 && Encoding.UTF8.GetString(bytes) == "SHOW\n") Dispatcher.UIThread.Post(ShowWindow);
            }
            catch (OperationCanceledException) { }
            catch (IOException) { await Task.Delay(1000, shutdown.Token).ConfigureAwait(false); }
        }
    }
}
