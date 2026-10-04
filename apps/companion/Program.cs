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
    public static string InstancePipe => "codex-web-companion-ui-" + SettingsStore.CurrentSid + "-" + Process.GetCurrentProcess().SessionId + (Arguments.Contains("--terminal") ? "-terminal" : "");
    [STAThread]
    public static int Main(string[] args)
    {
        Arguments = args;
        if(args.Length==1 && args[0]=="--version") { Console.WriteLine(CompanionVersion.Current); return 0; }
        if(args.Length==2 && args[0]=="--apply-update") {
            var result=UpdateActivationWorker.Run(args[1]);
            if(result!=0)try {var restart=new ProcessStartInfo(Environment.ProcessPath!){UseShellExecute=false,CreateNoWindow=true};restart.ArgumentList.Add("--tray");Process.Start(restart);}catch { }
            return result;
        }
        if(args.Contains("--update-health") && (args.Length!=3 || args[0]!="--tray" || args[1]!="--update-health" || !System.Text.RegularExpressions.Regex.IsMatch(args[2],"^[a-f0-9]{32}$")))return 2;
        var normalArgs=args.Contains("--update-health")?new[]{"--tray"}:args;
        if (normalArgs.Length > 0 && normalArgs.Any(x => x != "--tray" && x != "--inventory" && x != "--terminal" && x != "--login-codex" && x != "--login-github" && x != "--install-node" && x != "--install-git" && x != "--install-gh")) return 2;
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
                var command = args.Contains("--login-codex") ? "CODEX" : args.Contains("--login-github") ? "GITHUB"
                    : args.Contains("--install-node") ? "NODE" : args.Contains("--install-git") ? "GIT" : args.Contains("--install-gh") ? "GH" : "SHOW";
                pipe.Connect(3000); pipe.Write(Encoding.UTF8.GetBytes(command + "\n")); return 0;
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
    TerminalWindow? terminalWindow;
    SettingsStore? terminalStore;
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
            if (Program.Arguments.Contains("--terminal")) {
                var terminal = new TerminalWindow(Themes.Get(profile.Theme));
                terminalWindow = terminal;
                terminalStore = store;
                using var readiness = new ReadinessService(store);
                if (Program.Arguments.Contains("--login-codex")) {
                    var command = readiness.ReadWorkerConfig().Runtime;
                    terminal.SetCommand(File.Exists(command) ? "& '" + command.Replace("'", "''") + "' login" : "codex login");
                } else if (Program.Arguments.Contains("--login-github")) terminal.SetCommand("gh auth login --hostname github.com --git-protocol https --web");
                else {
                    var package = Program.Arguments.Contains("--install-node") ? "OpenJS.NodeJS.LTS" : Program.Arguments.Contains("--install-git") ? "Git.Git" : Program.Arguments.Contains("--install-gh") ? "GitHub.cli" : null;
                    if (package is not null) terminal.SetCommand("winget install --id " + package + " --exact --source winget --accept-source-agreements --accept-package-agreements");
                }
                desktop.MainWindow = terminal; desktop.ShutdownMode = ShutdownMode.OnMainWindowClose; terminal.Show();
                desktop.Exit += (_, _) => shutdown.Cancel();
                _ = Listen();
                base.OnFrameworkInitializationCompleted(); return;
            }
            Window = new MainWindow(this, store, profile, error);
            var icon = new WindowIcon(AssetLoader.Open(new Uri("avares://CodexWeb.Companion/Assets/icon.png")));
            Window.Icon = icon;
            var menu = new NativeMenu();
            AddMenu(menu, "Открыть Companion", () => ShowWindow());
            AddMenu(menu, "Открыть AbyssDeck", Window.OpenWeb);
            AddMenu(menu, "Проверить состояние", () => { ShowWindow(); _ = Window.Refresh(); });
            AddMenu(menu, "Обновления", () => { ShowWindow(); Window.SelectPage(2); _ = Window.CheckUpdates(); });
            AddMenu(menu, "Настройки", () => { ShowWindow(); Window.SelectPage(2); });
            menu.Items.Add(new NativeMenuItemSeparator());
            AddMenu(menu, "Выйти из интерфейса", Exit);
            tray = new TrayIcon { Icon = icon, ToolTipText = "AbyssDeck Companion · проверяем состояние", Menu = menu, IsVisible = true };
            tray.Clicked += (_, _) => ShowWindow();
            TrayIcon.SetIcons(this, new TrayIcons { tray });
            desktop.Exit += (_, _) => { shutdown.Cancel(); tray.Dispose(); Window.Dispose(); };
            if (!Program.Arguments.Contains("--tray")) ShowWindow();
            _ = Listen();
            if(Program.Arguments.Contains("--update-health"))UpdateActivationWorker.WriteHealth(Window,Program.Arguments[2]);
            _ = Window.Refresh();
        }
        base.OnFrameworkInitializationCompleted();
    }
    static void AddMenu(NativeMenu menu, string text, Action action)
    {
        var item = new NativeMenuItem(text); item.Click += (_, _) => action(); menu.Items.Add(item);
    }
    public void UpdateTray(string status) { if (tray is not null) tray.ToolTipText = "AbyssDeck Companion · " + status; }
    public void ShowWindow()
    {
        if (terminalWindow is { } terminal) { terminal.Show(); if (terminal.WindowState == WindowState.Minimized) terminal.WindowState = WindowState.Normal; terminal.Activate(); return; }
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
    void TerminalAction(string command)
    {
        if (terminalWindow is null || terminalStore is null) { if (command == "SHOW") ShowWindow(); return; }
        var value = command switch { "GITHUB" => "gh auth login --hostname github.com --git-protocol https --web",
            "NODE" => "winget install --id OpenJS.NodeJS.LTS --exact --source winget --accept-source-agreements --accept-package-agreements",
            "GIT" => "winget install --id Git.Git --exact --source winget --accept-source-agreements --accept-package-agreements",
            "GH" => "winget install --id GitHub.cli --exact --source winget --accept-source-agreements --accept-package-agreements", _ => null };
        if (command == "CODEX") { using var readiness = new ReadinessService(terminalStore); var path = readiness.ReadWorkerConfig().Runtime;
            value = File.Exists(path) ? "& '" + path.Replace("'", "''") + "' login" : "codex login"; }
        if (value is not null) terminalWindow.SetCommand(value);
        ShowWindow();
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
                var bytes = new byte[16]; var count = 0;
                while (count < bytes.Length)
                {
                    var read = await pipe.ReadAsync(bytes.AsMemory(count), timeout.Token);
                    if (read == 0) break; count += read; if (bytes[count - 1] == 10) break;
                }
                var command = Encoding.UTF8.GetString(bytes, 0, count).TrimEnd('\n');
                if (command is "SHOW" or "CODEX" or "GITHUB" or "NODE" or "GIT" or "GH") Dispatcher.UIThread.Post(() => TerminalAction(command));
            }
            catch (OperationCanceledException) { }
            catch (IOException) { await Task.Delay(1000, shutdown.Token).ConfigureAwait(false); }
        }
    }
}
