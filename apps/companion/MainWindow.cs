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
    const string Version = CompanionVersion.Current;
    readonly CompanionApp app;
    readonly SettingsStore store;
    readonly ReadinessService readiness;
    readonly HubConnection hub;
    readonly SetupOperations setup;
    readonly UpdateManager updates;
    readonly RecoveryManager recovery;
    readonly WorkerManager workers;
    bool maintaining;
    double[]? restoreOffsets;
    TextBlock updateText = new();
    Button updateApply = new();
    JsonElement? account;
    bool loginRequired, operating, accountReady;
    string? accountError;
    Border connectionCard = new();
    TextBox connectionAddress = new(), loginField = new(), passwordField = new();
    StackPanel loginControls = new();
    TextBlock connectionState = new();
    Button connectButton = new(), setupButton = new(), adminButton = new(), logoutButton = new();
    Button terminalButton = new();
    Grid connectionActions = new();
    StackPanel setupChecklist = new();
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
        hub = new(store); setup = new(store, hub); updates=new(store,hub);recovery=new(store);workers=new(store,hub);
        try { hub.Restore(profile); } catch { notice = "Сохранённое подключение недоступно. Войди снова."; }
        Title = "CodexWeb Companion";
        Width = 840; Height = 690; MinWidth = 650; MinHeight = 520;
        WindowStartupLocation = WindowStartupLocation.CenterScreen;
        FontFamily = new FontFamily("Segoe UI"); FontSize = 14;
        Closing += (_, e) => { if (!app.Exiting) { e.Cancel = true; Hide(); ShowInTaskbar = false; } };
        Activated += (_, _) => { if (snapshot is null || DateTimeOffset.Now - snapshot.CheckedAt > TimeSpan.FromSeconds(15)) _ = Refresh(); };
        timer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(30) };
        timer.Tick += (_, _) => { if (operating || setup.Running || maintaining) RenderSnapshot(); if (!operating || snapshot is null || DateTimeOffset.Now - snapshot.CheckedAt > TimeSpan.FromSeconds(30)) _ = Refresh(); }; timer.Start();
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
        // Reuse the scroll panes, but detach them before attaching the new shell.
        // Avalonia rejects a second parent; a failed theme rebuild otherwise
        // leaves old header colours around newly themed settings.
        pageHost.Children.Clear();
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
        BuildConnection();
        foreach (var page in pages)
        {
            page.HorizontalScrollBarVisibility = Avalonia.Controls.Primitives.ScrollBarVisibility.Disabled;
            page.VerticalScrollBarVisibility = Avalonia.Controls.Primitives.ScrollBarVisibility.Auto;
            pageHost.Children.Add(page);
        }
        Grid.SetRow(pageHost, 2); shell.Children.Add(pageHost);
        checkedText = Text(refreshing ? "Обновляем состояние…" : snapshot is null
            ? "Проверяем состояние…" : "Проверено " + snapshot.CheckedAt.ToString("HH:mm:ss"), muted: true);
        progress = new ProgressBar { IsIndeterminate = true, Height = 3, IsVisible = refreshing, Foreground = Themes.Brush(palette.Accent) };
        refreshButton = Button("Проверить состояние", () => _ = Refresh());
        refreshButton.IsEnabled = !refreshing;
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
    public void RestoreView(int index,double[]? offsets) {
        SelectPage(Math.Clamp(index,0,2));
        restoreOffsets=offsets is {Length:3} && offsets.All(x=>double.IsFinite(x) && x>=0 && x<=1_000_000) ? offsets : null;
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
                if (operating || setup.Running) throw new IOException("Дождись текущего шага настройки перед сменой Hub.");
                store.Save(next); profile = next; generation++; account = null; accountReady = false; hub.Restore(profile); notice = null; Build(); _ = Refresh();
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
        updateText=Text(updates.Description);
        updateApply=Button("Установить проверенное обновление",()=>ApplyUpdate());
        var autoUpdates=new CheckBox {Content="Автоматически обновлять Companion",IsChecked=profile.AutoUpdates,MinHeight=44};
        var autoRecovery=new CheckBox {Content="Автоматически восстанавливать остановленные вспомогательные компоненты",IsChecked=profile.AutoRecovery,MinHeight=44};
        autoUpdates.Click+=(_,_)=>{try {var next=profile with {AutoUpdates=autoUpdates.IsChecked==true};store.Save(next);profile=next;}catch {autoUpdates.IsChecked=profile.AutoUpdates;} };
        autoRecovery.Click+=(_,_)=>{try {var next=profile with {AutoRecovery=autoRecovery.IsChecked==true};store.Save(next);profile=next;}catch {autoRecovery.IsChecked=profile.AutoRecovery;} };
        return Stack(
            Section(Stack(Text("Подключение к Hub", 18, bold: true), Text("Вход — в Обзоре Companion. Пользователи и приглашения — в вебе.", muted: true), address, save)),
            Section(Stack(Text("Приложение", 18, bold: true), Text("Тема", muted: true), theme, autoStart,
                Text("Крестик скрывает окно в трей. Выход из интерфейса оставляет работающие компоненты запущенными.", muted: true))),
            Section(Stack(Text("Обновления и восстановление",18,bold:true),updateText,
                Row(Button("Проверить обновление",()=>_ = CheckUpdates()),updateApply),autoUpdates,autoRecovery,
                Text("Подпись и файлы проверяются до установки. Автообновление ждёт скрытия окна и завершения личных шагов. Проекты и входы сохраняются.",muted:true),
                Text("Компоненты переходят на проверенные версии после завершения работы. Для Codex Hub отдельно подтверждает простой и прежний аккаунт; активный ход не прерывается. Выключенные и неизвестные задачи требуют твоего действия.",muted:true))),
            Section(Stack(Text("Companion " + Version + " · Windows x64", 16, bold: true),
                Row(Button("Сохранить отчёт", () => _ = SaveReport()), Button("Выйти из интерфейса", app.Exit)))),
            new Expander
            {
                Header = "Как пользоваться Companion",
                Content = Section(Stack(
                Text("Значок в трее открывает это окно. Крестик скрывает его, а выход завершает только интерфейс."),
                Text("Обзор показывает связь с Hub и рабочие папки. Компоненты проверяются раз в 30 секунд; кнопка проверки обновляет состояние сразу."),
                Text("Готов по запросу — нормальное состояние: компонент запустится, когда понадобится. Занято — текущая работа продолжается."),
                Text("После восстановления сети связь проверяется автоматически. Известный остановленный вспомогательный компонент может восстановиться сам; после повторных сбоев попытки замедляются. Сообщения, команды и действия не отправляются повторно."),
                Text("Управляемые компоненты отмечены отдельной галочкой. Их программы хранятся по версиям, а настройки и квитанции остаются на прежнем месте. Кнопка возврата восстанавливает предыдущую версию вспомогательного компонента, когда он свободен. Codex переключается отдельно после проверки Hub."),
                Text("Кнопка CodexWeb открывает веб. Аккаунты, приглашения и управление Hub остаются там; полная справка доступна в настройках веба."),
                Text("Отчёт сохраняется в выбранный локальный файл. Он не содержит паролей, токенов или текста чатов.")))
            });
    }

    void BuildConnection()
    {
        var previousLogin = loginField.Text; var previousPassword = passwordField.Text;
        connectionAddress = new TextBox { Text = profile.HubOrigin, PlaceholderText = "https://hub.example", MinHeight = 44 };
        loginField = new TextBox { Text = previousLogin, PlaceholderText = "Логин Hub", MinHeight = 44 };
        passwordField = new TextBox { Text = previousPassword, PlaceholderText = "Пароль Hub", PasswordChar = '●', MinHeight = 44 };
        connectButton = Button("Войти и настроить", () => _ = Connect(), true);
        loginControls = Stack(Text("Сначала войди в свой Hub. Пароль не сохраняется.", muted: true), connectionAddress, Row(loginField, passwordField), connectButton);
        connectionState = Text("Проверяем подключение…");
        setupButton = Button("Продолжить настройку", () => _ = RunOperation(async () => { await setup.Start(); await Refresh(); }));
        adminButton = Button("Управление Hub", OpenWeb);
        terminalButton = Button("Локальный терминал", () => OpenTerminal());
        connectionActions = new Grid { ColumnSpacing = 12 };
        setupChecklist = new StackPanel { Spacing = 8 };
        logoutButton = Button("Выйти из аккаунта Hub", () => _ = RunOperation(async () => { await hub.Logout(); account = null; accountReady = false; loginRequired = false; accountError = null; }));
        connectionCard = Section(Stack(Text("Подключение и настройка", 20, bold: true), loginControls, connectionState,
            setupChecklist, connectionActions,
            logoutButton,
            new Expander { Header = "Первый запуск и помощь", Content = Stack(
                Text("1. Войди в Hub. Companion получает доступ только к состоянию и подключению твоего ПК; роли проверяет сервер."),
                Text("2. Дождись установки. Личные входы, папка проектов и подтверждение Windows потребуют твоего действия. Галочки появляются после проверки готовности."),
                Text("3. При подтверждении администратора открой Подключения в вебе и активируй свой ПК. Существующий LAN-профиль владельца остаётся на месте."),
                Text("Если настройка прервана, нажми Продолжить: тот же пакет и точный отчёт будут проверены заново. Уже работающий мастер второй раз не запускается."),
                Text("В Компонентах доступен ремонт остановленных собственных модулей, включая восстановление файлов из Hub. Работающий Codex не перезапускается; переход самого исполнителя выполняется отдельно."),
                Text("Локальный терминал имеет Вставить и отдельную отправку, включая маскированное поле пароля. Вставка сама ничего не выполняет. Текст ввода не сохраняется и не воспроизводится после закрытия."),
                Row(Button("Войти в Codex", () => OpenTerminal("--login-codex")), Button("Войти в GitHub", () => OpenTerminal("--login-github")))) }));
    }
    async Task Connect() => await RunOperation(async () => {
        var origin = (connectionAddress.Text ?? "").Trim().TrimEnd('/');
        if (!SettingsStore.ValidOrigin(origin)) throw new IOException("Введите HTTPS-адрес Hub.");
        var changed = origin != profile.HubOrigin;
        var next = profile with { HubOrigin = origin, DeviceId = changed ? "" : profile.DeviceId, Route = changed ? "Не привязан" : profile.Route };
        var password = passwordField.Text ?? ""; passwordField.Text = "";
        var candidate = await hub.Login(next, (loginField.Text ?? "").Trim(), password);
        next = next with { Theme = profile.Theme, AutoStart = profile.AutoStart, AutoUpdates = profile.AutoUpdates, AutoRecovery = profile.AutoRecovery };
        store.Save(next);
        try { hub.Accept(candidate); } catch { store.Save(profile); throw; }
        profile = next; generation++; loginRequired = false; account = null; accountReady = false; hubDraft = origin;
        await Refresh();
        if (profile.DeviceId.Length == 0) { await setup.Start(); await Refresh(); }
    });
    async Task RunOperation(Func<Task> action)
    {
        if (operating || setup.Running) return;
        operating = true; timer.Interval = TimeSpan.FromSeconds(2); notice = null; RenderSnapshot();
        try { await action(); } catch (Exception e) { notice = e is IOException ? e.Message : "Действие не подтверждено. Проверь состояние; автоматического повтора не будет."; }
        finally { operating = false; timer.Interval = TimeSpan.FromSeconds(30); if (!disposed) RenderSnapshot(); }
    }
    void OpenTerminal(string? login = null)
    {
        try { var start = new ProcessStartInfo(Environment.ProcessPath!) { UseShellExecute = false, CreateNoWindow = true };
            start.ArgumentList.Add("--terminal"); if (login is not null) start.ArgumentList.Add(login); Process.Start(start); }
        catch { notice = "Локальный терминал не открылся."; RenderSnapshot(); }
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
            var accountTask = hub.Session is not null && hub.Session.HubOrigin == profile.HubOrigin ? ReadAccount(expected) : Task.CompletedTask;
            var result = await readiness.Refresh(profile);
            await accountTask;
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
                else _ = Maintain();
            }
        }
    }
    bool UpdateIdle => !operating && !setup.Running && !recovery.Running && !workers.Running && !refreshing
        && string.IsNullOrEmpty(passwordField.Text) && hubDraft.Trim().TrimEnd('/')==profile.HubOrigin
        && (!loginControls.IsVisible || string.IsNullOrEmpty(loginField.Text)) && connectionAddress.Text==profile.HubOrigin;
    public async Task CheckUpdates() {await updates.Check(true);if(!disposed)RenderSnapshot();}
    void ApplyUpdate() {
        if(!UpdateIdle || !accountReady){notice="Дождись настройки и сохрани ввод перед обновлением.";RenderSnapshot();return;}
        try {updates.StartActivation(selectedPage,pages.Select(p=>p.Offset.Y).ToArray());app.Exit();}catch(Exception e){notice=e is IOException?e.Message:"Обновление пока не запустилось.";RenderSnapshot();}
    }
    async Task Maintain() {
        if(maintaining || disposed || !accountReady || profile.DeviceId.Length==0 || operating || setup.Running)return;
        maintaining=true;var expected=generation;
        try {
            if(profile.AutoUpdates)await updates.Check();
            if(expected!=generation || disposed || !accountReady)return;
            if(profile.AutoUpdates && snapshot is not null) {
                string? workerKit=null;try {workerKit=updates.VerifiedHelpers;}catch { }
                if(workerKit is not null){await workers.Update(snapshot,workerKit);snapshot=await readiness.Refresh(profile);}
            }
            if(profile.AutoRecovery && snapshot is not null) {
                string? kit=null;
                if(snapshot.Inventory.Components.Any(c=>!c.ExecutableExists && recovery.Due(c)))try {kit=updates.VerifiedHelpers;}catch { }
                var recovered=await recovery.Recover(snapshot,accountReady,kit,(c,inventory,source)=>setup.Repair(c,inventory,source,true),()=>readiness.Refresh(profile));
                if(expected!=generation || disposed)return;
                snapshot=recovered;
            }
            if(expected!=generation || disposed)return;
            RenderSnapshot();
            if(profile.AutoUpdates && updates.State.State=="ready" && !IsVisible && UpdateIdle)ApplyUpdate();
        } catch { /* A maintenance failure never owns or restarts a native turn. */ }
        finally {maintaining=false;}
    }
    async Task ReadAccount(int expected)
    {
        try { var result = await hub.Request("/api/companion/status");
            if (expected != generation || disposed) return;
            if (result.GetProperty("user").GetProperty("id").GetString() != hub.Session?.UserId) throw new IOException("Изменился аккаунт Hub.");
            account = result; accountReady = true; accountError = null; loginRequired = false;
            var device = result.GetProperty("deviceId").GetString()!;
            if (device != profile.DeviceId) { var next = profile with { DeviceId = device, Route = device.Length > 0 ? result.GetProperty("route").GetString()! : "Не привязан" }; store.Save(next); profile = next; }
        } catch (HubConnectionException e) when (e.Status is 401 or 403) { if (expected == generation) { loginRequired = true; accountReady = false; account = null; accountError = null; } }
        catch { if (expected == generation) { accountReady = false; accountError = "Связь с аккаунтом Hub пока не подтверждена. Настройки и текущая работа сохранены."; } }
    }
    void RenderSnapshot()
    {
        updateText.Text=updates.Description;
        updateApply.IsEnabled=updates.State.State=="ready" && !updates.Running && !operating && !setup.Running;
        overview.Children.Clear(); components.Children.Clear();
        overview.Children.Add(connectionCard);
        loginControls.IsVisible = hub.Session is null || loginRequired;
        logoutButton.IsVisible = hub.Session is not null;
        logoutButton.IsEnabled = !operating;
        connectButton.IsEnabled = !operating; passwordField.IsEnabled = !operating; loginField.IsEnabled = !operating; connectionAddress.IsEnabled = !operating;
        setupButton.IsVisible = hub.Session is not null && !loginRequired && profile.DeviceId.Length == 0;
        setupButton.IsEnabled = accountReady && !operating && !setup.Running;
        adminButton.IsVisible = accountReady && account?.GetProperty("user").GetProperty("role").GetString() == "admin";
        connectionActions.Children.Clear();
        var actions = new[] { setupButton, terminalButton, adminButton }.Where(b => b.IsVisible).ToArray();
        connectionActions.ColumnDefinitions = new ColumnDefinitions(string.Join(",", actions.Select(_ => "*")));
        for (var i = 0; i < actions.Length; i++) { Grid.SetColumn(actions[i], i); connectionActions.Children.Add(actions[i]); }
        setupChecklist.Children.Clear();
        var confirmed = accountReady && account?.GetProperty("enrollments").EnumerateArray().Any(e =>
            e.GetProperty("id").GetString() == hub.Session?.EnrollmentId && e.GetProperty("state").GetString() is "reported" or "approved") == true;
        foreach (var step in setup.Checklist(confirmed)) {
            var row = new Grid { ColumnDefinitions = new("*,170"), ColumnSpacing = 12 };
            row.Children.Add(Text(step.Title)); var state = Text(step.State, bold: true); Grid.SetColumn(state, 1); row.Children.Add(state); setupChecklist.Children.Add(row);
        }
        setupChecklist.IsVisible = setupChecklist.Children.Count > 0;
        connectionState.Text = operating || setup.Running ? (setup.Progress().Length > 0 ? setup.Progress() : "Подключаемся…")
            : accountReady && account is { } a ? "✓ Hub · " + a.GetProperty("user").GetProperty("name").GetString() + (profile.DeviceId.Length > 0 ? " · ПК привязан" : " · ожидаем подготовку/подтверждение ПК")
            : hub.Session is null || loginRequired ? "Ожидаем вход в Hub" : "Вход сохранён · проверяем связь с Hub";
        if (notice is not null) overview.Children.Add(Section(Text(notice)));
        if (probeError is not null) overview.Children.Add(Section(Text(probeError)));
        if (accountError is not null) overview.Children.Add(Section(Text(accountError)));
        if (snapshot is null)
        {
            overview.Children.Add(Section(Stack(Text("Проверяем этот компьютер", 20, bold: true), Text("Подхватываем установленный Companion и выбранные рабочие папки.", muted: true)))); return;
        }
        var s = snapshot;
        var dependencies = Stack(Text("Программы и личные входы", 18, bold: true));
        foreach (var requirement in s.Inventory.Requirements ?? []) {
            var line = new Grid { ColumnDefinitions = new("*,200"), ColumnSpacing = 12 };
            line.Children.Add(Text(requirement.Title));
            Control action = requirement.Ready ? Text("✓ Установлен", bold: true) : Button("Установить", () => {
                if (profile.DeviceId.Length == 0) { _ = RunOperation(async () => { await setup.Start(); await Refresh(); }); }
                else OpenTerminal("--install-" + requirement.Id);
            }); Grid.SetColumn(action, 1); line.Children.Add(action); dependencies.Children.Add(line);
        }
        dependencies.Children.Add(Row(Button("Логин Codex", () => OpenTerminal("--login-codex")), Button("Логин GitHub", () => OpenTerminal("--login-github"))));
        dependencies.Children.Add(Text("Личные входы сохраняют сами Codex и GitHub. Повторный вход требуется только при выходе из аккаунта или истечении доступа.", muted: true));
        overview.Children.Add(Section(dependencies));
        overview.Children.Add(Section(Stack(Text("Hub · " + s.HubState, 20, bold: true), Text(profile.HubOrigin.Length == 0 ? "Адрес Hub не настроен" : profile.HubOrigin),
            Text("Windows: " + s.Inventory.User, muted: true),
            Text("Маршрут: " + profile.Route + (profile.DeviceId.Length > 0 ? " · " + profile.DeviceId : ""), muted: true))));
        var readyCount = s.Components.Count(x => !x.Attention && x.State is "Запущен" or "Занято" or "Готов по запросу");
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
        for (var i = 0; i < s.Components.Length; i++)
        {
            var c = s.Components[i]; var source = s.Inventory.Components[i];
            var row = new Grid { ColumnDefinitions = new ColumnDefinitions("*,170"), ColumnSpacing = 12 };
            row.Children.Add(Stack(Text(c.Title, 16, bold: true), Text(c.Detail, muted: true)));
            var state = Text(!c.Attention && c.State is "Запущен" or "Занято" or "Готов по запросу" ? "✓ " + c.State : c.State, bold: true); state.VerticalAlignment = VerticalAlignment.Center;
            state.Foreground = Themes.Brush(c.Attention ? palette.Danger : palette.Accent); Grid.SetColumn(state, 1); row.Children.Add(state);
            var content = Stack(row);
            var managed=workers.Description(source);if(managed.Length>0)content.Children.Add(Text(managed,muted:true));
            var recovering=recovery.Description(source);if(recovering.Length>0)content.Children.Add(Text(recovering,muted:true));
            if (c.Attention || c.State == "Выключен" || c.State == "Не используется" && source.Id == "CodexWebComputerUse") {
                var repair = Button("Исправить и проверить", () => _ = RunOperation(async () => {
                    if (profile.DeviceId.Length == 0 && (!source.Installed || !source.ExecutableExists)) {
                        if (!accountReady) { SelectPage(0); throw new IOException("Сначала войди в Hub в Обзоре."); }
                        await setup.Start();
                    } else if(WorkerManager.Candidate(source) && updates.VerifiedHelpers is { } kit) await workers.Migrate(source,s.Inventory,kit);
                    else await setup.Repair(source, s.Inventory);
                    await Refresh(); })); repair.IsEnabled = !operating && !setup.Running && source.State != "Running"; content.Children.Add(repair);
            }
            if(managed.StartsWith("✓") && WorkerManager.Candidate(source) && source.Id!="CodexWebCompanionPersistent") {
                var restore=Button("Вернуть предыдущую версию",()=>_ = RunOperation(async()=> {
                    var kit=updates.VerifiedHelpers??throw new IOException("Сначала проверь подписанное обновление.");
                    await workers.Migrate(source,s.Inventory,kit,true);notice=workers.State;await Refresh();
                }));restore.IsEnabled=!operating && !workers.Running && source.State=="Ready";content.Children.Add(restore);
            }
            components.Children.Add(Section(content));
        }
        app.UpdateTray(!s.HubReady ? "Hub недоступен" : s.Components.Any(x => x.Attention) ? "есть компоненты, требующие внимания" : "компоненты доступны");
        if(restoreOffsets is { } offsets) {restoreOffsets=null;Dispatcher.UIThread.Post(()=>{for(var i=0;i<3;i++)pages[i].Offset=new Vector(0,offsets[i]);},DispatcherPriority.Loaded);}
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
            var documents = await StorageProvider.TryGetFolderFromPathAsync(
                Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments));
            var file = await StorageProvider.SaveFilePickerAsync(new()
            {
                Title = "Сохранить отчёт Companion", SuggestedFileName = "companion-status.json",
                DefaultExtension = "json", SuggestedStartLocation = documents
            });
            if (file is null) return;
            await using var stream = await file.OpenWriteAsync();
            stream.SetLength(0); await JsonSerializer.SerializeAsync(stream, report, SettingsStore.Json);
        }
        catch { notice = "Не удалось сохранить отчёт."; RenderSnapshot(); }
    }
    public void Dispose() { disposed = true; timer.Stop(); readiness.Dispose(); hub.Dispose(); passwordField.Text = ""; }
}
