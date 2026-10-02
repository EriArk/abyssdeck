using System.Diagnostics;
using System.Text;
using System.Text.Json;

namespace CodexWeb.Companion;

// Uses the same verified package for first setup, repair and ordinary upgrades.
public sealed class BrowserComponent(SettingsStore settings)
{
    public bool Running { get; private set; }
    public string State { get; private set; } = "";
    DateTimeOffset lastAttempt;
    public async Task Ensure(Component component, Inventory inventory, string kit, bool automatic)
    {
        if (Running || automatic && DateTimeOffset.UtcNow-lastAttempt < TimeSpan.FromMinutes(2)) return;
        if (inventory.Sid != settings.Sid || !component.Known || component.Installed && !component.Owned)
            throw new IOException("Сначала проверь браузер этого пользователя.");
        if (automatic && component.State == "Disabled") return;
        Running = true; lastAttempt = DateTimeOffset.UtcNow;
        try {
            var installer = Path.Combine(kit,"Install-Browser.ps1");
            var package = Path.Combine(kit,"browser-package");
            SettingsStore.NoLinks(installer); SettingsStore.NoLinks(package);
            if (!File.Exists(installer) || !File.Exists(Path.Combine(package,"release.json")))
                throw new IOException("Проверь обновление Companion: нужен пакет встроенного браузера.");
            var digest=ReleaseVerifier.HashFile(Path.Combine(package,"release.json"));
            var journal=Path.Combine(settings.Directory,"browser-setup.json");SettingsStore.NoLinks(journal);
            if(automatic && File.Exists(journal)) {
                if(new FileInfo(journal).Length>8192)throw new IOException("Журнал браузера требует проверки.");
                using var prior=JsonDocument.Parse(File.ReadAllBytes(journal));
                if(prior.RootElement.GetProperty("release").GetString()==digest && prior.RootElement.GetProperty("state").GetString()=="waitingRestart" && component.State=="Running") {
                    State="Браузер 1.0.0 ждёт завершения старого процесса для первого обновления";return;
                }
                if(prior.RootElement.GetProperty("release").GetString()==digest && prior.RootElement.GetProperty("state").GetString() is "checking" or "needsRuntime" or "failed") {
                    State="Установка браузера ожидает ручной проверки; нажми ремонт";return;
                }
            }
            void Save(string state)=>ReleaseVerifier.Atomic(journal,JsonSerializer.SerializeToUtf8Bytes(new {release=digest,state},SettingsStore.Json));
            // Record intent before setup; an interrupted installer is checked manually,
            // never launched again blindly on the next UI poll.
            Save("checking");
            State = "Проверяем установку браузера…";
            var start = new ProcessStartInfo(SetupOperations.PowerShell) { UseShellExecute=false, CreateNoWindow=true,
                RedirectStandardOutput=true, RedirectStandardError=true, StandardOutputEncoding=Encoding.UTF8 };
            foreach (var arg in new[]{"-NoLogo","-NoProfile","-NonInteractive","-ExecutionPolicy","Bypass","-File",installer,
                "-PackageDirectory",package,"-ExpectedSid",settings.Sid}) start.ArgumentList.Add(arg);
            if (component.Installed) {start.ArgumentList.Add("-ExpectedTaskDigest");start.ArgumentList.Add(component.TaskDigest);}
            using var process=Process.Start(start)??throw new IOException("Установка браузера не запустилась.");
            var output=process.StandardOutput.ReadToEndAsync();var error=process.StandardError.ReadToEndAsync();
            await process.WaitForExitAsync();await error;
            var text=await output;
            if(process.ExitCode!=0 || text.Length>8192)throw new IOException("Браузер требует проверки установки. Его профиль сохранён.");
            using var result=JsonDocument.Parse(text);
            var outcome=result.RootElement.GetProperty("state").GetString()!;Save(outcome);
            State=outcome switch {
                "installed"=>"Версия браузера проверена",
                "needsRuntime"=>"Нужен Microsoft WebView2 Runtime: заверши установку Windows и нажми ремонт",
                "waitingRestart"=>"Браузер 1.0.0 ждёт завершения старого процесса для первого обновления",
                "waitingIdle"=>"Обновление браузера ожидает завершения работы; открытые вкладки сохранены",
                _=>throw new IOException("Установка браузера ещё не подтверждена.")
            };
        } catch {State="Браузер требует проверки установки; нажми ремонт";throw;}
        finally {Running=false;}
    }
}
