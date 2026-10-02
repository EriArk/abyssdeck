using System.Reflection;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Media.Imaging;
using Avalonia.Themes.Fluent;
using Avalonia.Threading;
using CodexWeb.Companion;

// Render the real window with fixture state. No application lifetime, tray,
// activation, live inventory, task changes or maintenance is started.
public sealed class FixtureApplication : Application {
    public override void Initialize()=>Styles.Add(new FluentTheme());
}
static class CompanionWindowChecks {
    static FieldInfo Field(string name)=>typeof(MainWindow).GetField(name,BindingFlags.Instance|BindingFlags.NonPublic)!;
    public static void Render(string output) {
        AppBuilder.Configure<FixtureApplication>().UsePlatformDetect().SetupWithoutStarting();
        Directory.CreateDirectory(output);
        var temporary=Path.Combine(Path.GetTempPath(),"companion-render-"+Guid.NewGuid());Directory.CreateDirectory(temporary);
        try {
            foreach(var theme in Themes.Ids) {
                var store=new SettingsStore(Path.Combine(temporary,theme),"fixture-sid");
                using var window=new MainWindow(new CompanionApp(),store,new("fixture-sid","","","LAN",Theme:theme,AutoUpdates:false,AutoRecovery:false),null);
                ((DispatcherTimer)Field("timer").GetValue(window)!).Stop();
                var source=new[]{
                    new Component("CodexWebFileLaunch","Открытие файлов","file-launch",true,true,true,"Ready","fixture",true),
                    new Component("CodexWebBrowser","Встроенный браузер","browser",true,true,true,"Running","fixture",true),
                    new Component("CodexWebDelivery","Файлы и результаты","delivery",true,true,true,"Ready","fixture",true)
                };
                var snapshot=new Snapshot(DateTimeOffset.Now,new("fixture-sid","Fixture","Fixture",1,source,[]),source.Select(c=>StatusProjection.Project(c,true)).ToArray(),"На связи",true,[],"Fixture",null);
                Field("snapshot").SetValue(window,snapshot);
                Field("componentUpdates").SetValue(window,new ComponentUpdate[]{
                    new(source[0].Id,"needsElevation","Для ремонта задачи нужно подтверждение Windows",true,true),
                    new(source[1].Id,"pending","Браузер 1.0.0 → 1.0.1 · первый переход требует завершения старого браузера; вкладки остаются открытыми",true),
                    new(source[2].Id,"current","✓ Версия пакета и готовность подтверждены")
                });
                typeof(MainWindow).GetMethod("RenderSnapshot",BindingFlags.Instance|BindingFlags.NonPublic)!.Invoke(window,null);
                window.SelectPage(1);
                window.ShowInTaskbar=false;window.ShowActivated=false;window.Position=new PixelPoint(-20000,-20000);
                window.Show();Dispatcher.UIThread.RunJobs();
                foreach(var width in new[]{650,840}) {
                    var control=(Control)window.Content!;((Panel)control).Background=window.Background;var size=new Size(width,690);
                    control.Measure(size);control.Arrange(new Rect(size));Dispatcher.UIThread.RunJobs();
                    control.Measure(size);control.Arrange(new Rect(size));
                    using var image=new RenderTargetBitmap(new PixelSize(width,690),new Vector(96,96));image.Render(control);
                    image.Save(Path.Combine(output,theme+"-"+width+".png"),new PngBitmapEncoderOptions());
                }
                window.Hide();
            }
            Console.WriteLine("PASS rendered fixture component cards in every Companion theme at 650 and 840 pixels; no installed app launched");
        } finally {Directory.Delete(temporary,true);}
    }
}
