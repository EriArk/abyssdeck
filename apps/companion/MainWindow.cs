using System.Diagnostics;
using System.Text.Json;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Layout;
using Avalonia.Media;
using Avalonia.Platform.Storage;
using Avalonia.Styling;
using Avalonia.Threading;

namespace CodexWeb.Companion;

public sealed class MainWindow : Window, IDisposable
{
    const string Version = "0.2.0";
    readonly CompanionApp app;
    readonly SettingsStore store;
    readonly ReadinessService readiness;
    readonly DispatcherTimer timer;
    Profile profile;
    Snapshot? snapshot;
    Palette palette;
    string? notice, probeError;
    string hubDraft;
    int selectedPage;
    int generation;
    bool refreshing, refreshAgain, disposed;
    TextBlock checkedText = new();
    ProgressBar progress = new();
    StackPanel overview = new(), components = new();
    readonly ScrollViewer[] pages = [new(), new(), new()];
    Grid pageHost = new();
    readonly Button[] navigation = new Button[3];
    Button refreshButton = new();

    public MainWindow(CompanionApp app, SettingsStore store, Profile profile, string? error)
    {
        this.app = app; this.store = store; this.profile = profile; notice = error;
        hubDraft = profile.HubOrigin; palette = Themes.Get(profile.Theme); readiness = new(store);
        Title = "CodexWeb Companion";
        Width = 840; Height = 690; MinWidth = 650; MinHeight = 520;
        WindowStartupLocation = WindowStartupLocation.CenterScreen;
        FontFamily = new FontFamily("Segoe UI"); FontSize = 14;
        Closing += (_, e) => { if (!app.Exiting) { e.Cancel = true; Hide(); ShowInTaskbar = false; } };
        Activated += (_, _) => { if (snapshot is null || DateTimeOffset.Now - snapshot.CheckedAt > TimeSpan.FromSeconds(15)) _ = Refresh(); };
        timer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(60) };
        timer.Tick += (_, _) => _ = Refresh(); timer.Start();
        Build();
    }

    TextBlock Text(string value, double size = 14, bool muted = false, bool bold = false) => new()
    {
        Text = value,
        FontSize = size,
        Foreground = Themes.Brush(muted ? palette.Muted : palette.Ink),
        FontWeight = bold ? FontWeight.SemiBold : FontWeight.Normal,
        TextWrapping = TextWrapping.Wrap
    };
    Button Button(string title, Action action, bool primary = false)
    {
        var button = new Button
        {
            Content = title,
            MinHeight = 44,
            HorizontalAlignment = HorizontalAlignment.Stretch,
            HorizontalContentAlignment = HorizontalAlignment.Center,
            Padding = new Thickness(14, 8),
            Background = Themes.Brush(primary ? palette.Accent : palette.Surface),
            Foreground = Themes.Brush(primary ? palette.AccentInk : palette.Ink),
            BorderBrush = Themes.Brush(palette.Line),
            BorderThickness = new Thickness(1),
            CornerRadius = new CornerRadius(7)
        };
        button.Click += (_, _) => action(); return button;
    }
    Border Section(Control content) => new()
    {
        Child = content,
        Padding = new Thickness(18),
        CornerRadius = new CornerRadius(9),
        Background = Themes.Brush(palette.Surface),
        BorderBrush = Themes.Brush(palette.Line),
        BorderThickness = new Thickness(1)
    };
    StackPanel Stack(params Control[] controls)
    {
        var stack = new StackPanel { Spacing = 10 }; foreach (var child in controls) stack.Children.Add(child); return stack;
    }
    static Grid Row(params Control[] controls)
    {
        var grid = new Grid { ColumnDefinitions = new ColumnDefinitions(string.Join(",", controls.Select(_ => "*"))), ColumnSpacing = 12 };
        for (int i = 0; i < controls.Length; i++) { Grid.SetColumn(controls[i], i); grid.Children.Add(controls[i]); }
        return grid;
    }

    void Build()
    {
        RequestedThemeVariant = palette.Dark ? ThemeVariant.Dark : ThemeVariant.Light;
        FontFamily = new FontFamily(profile.Theme == "crt-green" ? "Consolas" : "Segoe UI");
        Background = Themes.Brush(palette.Canvas); Foreground = Themes.Brush(palette.Ink);
        var shell = new Grid { RowDefinitions = new RowDefinitions("Auto,Auto,*,Auto"), Margin = new Thickness(20), RowSpacing = 16 };
        var header = new Grid { ColumnDefinitions = new ColumnDefinitions("*,200"), ColumnSpacing = 16 };
        header.Children.Add(Stack(Text("CodexWeb Companion", 25, bold: true), Text("Этот компьютер · " + Environment.MachineName, muted: true)));
        var open = Button("Открыть CodexWeb", OpenWeb, true); Grid.SetColumn(open, 1); header.Children.Add(open); shell.Children.Add(header);
        var tabs = new Grid { ColumnDefinitions = new ColumnDefinitions("*,*,*"), ColumnSpacing = 10 };
        var titles = new[] { "Обзор", "Компоненты", "Настройки" };
        for (int i = 0; i < 3; i++)
        {
            var index = i; navigation[i] = Button(titles[i], () => SelectPage(index));
            Grid.SetColumn(navigation[i], i); tabs.Children.Add(navigation[i]);
        }
        Grid.SetRow(tabs, 1); shell.Children.Add(tabs);
        pageHost = new Grid();
        overview = new StackPanel { Spacing = 14 }; components = new StackPanel { Spacing = 10 };
        pages[0].Content = overview; pages[1].Content = components; pages[2].Content = SettingsPage();
        foreach (var page in pages)
        {
            page.HorizontalScrollBarVisibility = Avalonia.Controls.Primitives.ScrollBarVisibility.Disabled;
            page.VerticalScrollBarVisibility = Avalonia.Controls.Primitives.ScrollBarVisibility.Auto;
            pageHost.Children.Add(page);
        }
        Grid.SetRow(pageHost, 2); shell.Children.Add(pageHost);
        checkedText = Text("Проверяем состояние…", muted: true);
        progress = new ProgressBar { IsIndeterminate = true, Height = 3, IsVisible = refreshing, Foreground = Themes.Brush(palette.Accent) };
        refreshButton = Button("Проверить состояние", () => _ = Refresh());
        var footer = new Grid { ColumnDefinitions = new ColumnDefinitions("*,210"), ColumnSpacing = 16 };
        footer.Children.Add(Stack(progress, checkedText)); Grid.SetColumn(refreshButton, 1); footer.Children.Add(refreshButton);
        Grid.SetRow(footer, 3); shell.Children.Add(footer);
        Content = shell; SelectPage(selectedPage); RenderSnapshot();
    }
    public void SelectPage(int index)
    {
        selectedPage = index;
        for (int i = 0; i < 3; i++)
        {
            pages[i].IsVisible = i == index;
            navigation[i].Background = Themes.Brush(i == index ? palette.Soft : palette.Surface);
            navigation[i].BorderBrush = Themes.Brush(i == index ? palette.Accent : palette.Line);
        }
    }
    Control SettingsPage()
    {
        var address = new TextBox { Text = hubDraft, PlaceholderText = "https://hub.example", MinHeight = 44 };
        address.TextChanged += (_, _) => hubDraft = address.Text ?? "";
        var save = Button("Сохранить адрес", () =>
        {
            try
            {
                var origin = hubDraft.Trim().TrimEnd('/');
                if (!SettingsStore.ValidOrigin(origin)) throw new IOException("Введите HTTPS-адрес Hub без пути и параметров.");
                var changed = origin != profile.HubOrigin;
                var next = profile with { HubOrigin = origin, DeviceId = changed ? "" : profile.DeviceId, Route = changed ? "Не привязан" : profile.Route };
                store.Save(next); profile = next; generation++; notice = null; _ = Refresh();
            }
            catch (Exception e) { notice = e is IOException ? e.Message : "Не удалось сохранить настройки."; RenderSnapshot(); }
        });
        var theme = new ComboBox
        {
            ItemsSource = Themes.Ids.Select(x => Themes.Get(x).Name).ToArray(),
            SelectedIndex = Array.IndexOf(Themes.Ids, profile.Theme),
            HorizontalAlignment = HorizontalAlignment.Stretch,
            MinHeight = 44
        };
        theme.SelectionChanged += (_, _) =>
        {
            if (theme.SelectedIndex < 0) return;
            try
            {
                var next = profile with { Theme = Themes.Ids[theme.SelectedIndex] };
                store.Save(next); profile = next; palette = Themes.Get(profile.Theme); Build();
            }
            catch { notice = "Не удалось сохранить тему."; RenderSnapshot(); }
        };
        var autoStart = new CheckBox { Content = "Запускать Companion при входе в Windows", IsChecked = profile.AutoStart, MinHeight = 44 };
        autoStart.Click += (_, _) =>
        {
            try
            {
                var enabled = autoStart.IsChecked == true;
                if (!store.SetAutoStart(enabled)) throw new IOException("Автозапуск доступен после установки приложения.");
                var next = profile with { AutoStart = enabled }; store.Save(next); profile = next;
            }
            catch (Exception e)
            {
                try { store.SetAutoStart(profile.AutoStart); } catch { }
                autoStart.IsChecked = profile.AutoStart; notice = e is IOException ? e.Message : "Не удалось изменить автозапуск."; RenderSnapshot();
            }
        };
        return Stack(
            Section(Stack(Text("Подключение к Hub", 18, bold: true), Text("Вход в аккаунт, пользователи и приглашения — в CodexWeb.", muted: true), address, save)),
            Section(Stack(Text("Приложение", 18, bold: true), Text("Тема", muted: true), theme, autoStart,
                Text("Крестик скрывает окно в трей. Выход из интерфейса оставляет работающие компоненты запущенными.", muted: true))),
            Section(Stack(Text("Companion " + Version + " · Windows x64", 16, bold: true),
                Row(Button("Сохранить отчёт", () => _ = SaveReport()), Button("Выйти из интерфейса", app.Exit)))),
            new Expander
            {
                Header = "Как пользоваться Companion",
                Content = Section(Stack(
                Text("Значок в трее открывает это окно. Крестик скрывает его, а выход завершает только интерфейс."),
                Text("Обзор показывает связь с Hub и рабочие папки. Компоненты проверяются раз в минуту; кнопка проверки обновляет состояние сразу."),
                Text("Готов по запросу — нормальное состояние: компонент запустится, когда понадобится. Занято — текущая работа продолжается."),
                Text("После восстановления сети связь проверяется автоматически. Сообщения, команды и действия не отправляются повторно."),
                Text("Кнопка CodexWeb открывает веб. Аккаунты, приглашения и управление Hub остаются там; полная справка доступна в настройках веба."),
                Text("Отчёт сохраняется в выбранный локальный файл. Он не содержит паролей, токенов или текста чатов.")))
            });
    }

    public async Task Refresh()
    {
        if (disposed) return;
        if (refreshing) { refreshAgain = true; return; }
        refreshing = true; progress.IsVisible = true; refreshButton.IsEnabled = false;
        checkedText.Text = snapshot is null ? "Проверяем состояние…" : "Обновляем состояние…";
        var expected = generation;
        try
        {
            var result = await readiness.Refresh(profile);
            if (disposed) return;
            if (expected != generation) { refreshAgain = true; return; }
            snapshot = result; probeError = null; RenderSnapshot();
        }
        catch { if (!disposed) { probeError = "Проверка недоступна. Повторим автоматически; текущее состояние сохранено."; RenderSnapshot(); } }
        finally
        {
            refreshing = false;
            if (!disposed)
            {
                progress.IsVisible = false; refreshButton.IsEnabled = true;
                checkedText.Text = snapshot is null ? "Состояние пока неизвестно" : "Проверено " + snapshot.CheckedAt.ToString("HH:mm:ss");
                if (refreshAgain) { refreshAgain = false; _ = Refresh(); }
            }
        }
    }
    void RenderSnapshot()
    {
        overview.Children.Clear(); components.Children.Clear();
        if (notice is not null) overview.Children.Add(Section(Text(notice)));
        if (probeError is not null) overview.Children.Add(Section(Text(probeError)));
        if (snapshot is null)
        {
            overview.Children.Add(Section(Stack(Text("Проверяем этот компьютер", 20, bold: true), Text("Подхватываем установленный Companion и выбранные рабочие папки.", muted: true)))); return;
        }
        var s = snapshot;
        overview.Children.Add(Section(Stack(Text("Hub · " + s.HubState, 20, bold: true), Text(profile.HubOrigin.Length == 0 ? "Адрес Hub не настроен" : profile.HubOrigin),
            Text("Windows: " + s.Inventory.User, muted: true),
            Text("Маршрут: " + profile.Route + (profile.DeviceId.Length > 0 ? " · " + profile.DeviceId : ""), muted: true))));
        var readyCount = s.Components.Count(x => !x.Attention && x.State != "Выключен");
        overview.Children.Add(Section(Stack(Text($"Компоненты · {readyCount} из {s.Components.Length} доступны", 20, bold: true),
            Text(s.Inventory.NativeProcesses.Length > 0 ? "Codex запущен независимо от интерфейса" : "Постоянный Companion работает независимо от этого окна", muted: true),
            Row(Button("Все компоненты", () => SelectPage(1)), Button("Открыть CodexWeb", OpenWeb)))));
        if (s.Notice is not null) overview.Children.Add(Section(Text(s.Notice)));
        var roots = Stack(Text("Рабочие папки", 18, bold: true));
        foreach (var root in s.Roots) roots.Children.Add(Text(root));
        if (s.Roots.Length == 0) roots.Children.Add(Text("Папки пока не настроены в постоянном Companion.", muted: true));
        roots.Children.Add(Text("Используем нынешнюю конфигурацию ПК; окно не меняет проекты или аккаунты.", muted: true));
        overview.Children.Add(Section(roots));
        var detail = new Expander { Header = "Подробности установленного Codex", Content = Text(s.Runtime, muted: true) };
        overview.Children.Add(detail);
        foreach (var c in s.Components)
        {
            var row = new Grid { ColumnDefinitions = new ColumnDefinitions("*,170"), ColumnSpacing = 12 };
            row.Children.Add(Stack(Text(c.Title, 16, bold: true), Text(c.Detail, muted: true)));
            var state = Text(c.State, bold: true); state.VerticalAlignment = VerticalAlignment.Center;
            state.Foreground = Themes.Brush(c.Attention ? palette.Danger : palette.Accent); Grid.SetColumn(state, 1); row.Children.Add(state);
            components.Children.Add(Section(row));
        }
        app.UpdateTray(!s.HubReady ? "Hub недоступен" : s.Components.Any(x => x.Attention) ? "есть компоненты, требующие внимания" : "компоненты доступны");
    }
    public void OpenWeb()
    {
        if (!SettingsStore.ValidOrigin(profile.HubOrigin)) { SelectPage(2); return; }
        try { Process.Start(new ProcessStartInfo(profile.HubOrigin) { UseShellExecute = true }); }
        catch { notice = "Не удалось открыть браузер."; RenderSnapshot(); }
    }
    async Task SaveReport()
    {
        if (snapshot is null) { await Refresh(); if (snapshot is null) return; }
        var report = new
        {
            version = Version,
            checkedAt = snapshot.CheckedAt,
            hub = new { origin = profile.HubOrigin, state = snapshot.HubState },
            computer = snapshot.Inventory.Computer,
            components = snapshot.Components,
            nativeProcesses = snapshot.Inventory.NativeProcesses,
            note = "Без паролей, токенов, текста чатов и полного содержимого конфигураций"
        };
        try
        {
            var file = await StorageProvider.SaveFilePickerAsync(new() { Title = "Сохранить отчёт Companion", SuggestedFileName = "companion-status.json", DefaultExtension = "json" });
            if (file is null) return;
            await using var stream = await file.OpenWriteAsync();
            stream.SetLength(0); await JsonSerializer.SerializeAsync(stream, report, SettingsStore.Json);
        }
        catch { notice = "Не удалось сохранить отчёт."; RenderSnapshot(); }
    }
    public void Dispose() { disposed = true; timer.Stop(); readiness.Dispose(); }
}
