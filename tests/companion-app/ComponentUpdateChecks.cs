using System.Text.Json;
using CodexWeb.Companion;

static class ComponentUpdateChecks
{
    public static void Run(string temporary,Action<bool,string> check) {
        var store=new SettingsStore(Path.Combine(temporary,"version-checks","companion-app"),"fixture-sid");
        var kit=Path.Combine(temporary,"version-kit");Directory.CreateDirectory(kit);
        foreach(var file in WorkerManager.Files["CodexWebDelivery"].Append("Start-ManagedWorker.ps1"))File.WriteAllText(Path.Combine(kit,file),"fixture-"+file);
        var staged=WorkerManager.Prepare(store.Directory,kit,"CodexWebDelivery");
        var module=Path.GetFullPath(Path.Combine(store.Directory,"..","delivery"));Directory.CreateDirectory(module);
        var config=Path.Combine(module,"config.json");File.WriteAllText(config,"{\"private\":\"preserve\"}");
        var original="fixture original XML";
        var taskHash=Convert.ToHexStringLower(System.Security.Cryptography.SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(original)));
        var component=new Component("CodexWebDelivery","Files","delivery",true,true,true,"Ready","powershell.exe",true,taskHash);
        var health=StatusProjection.Project(component);
        var inspector=new ComponentUpdates(store);
        var journal=Path.Combine(store.Directory,"workers","state",component.Id+".json");Directory.CreateDirectory(Path.GetDirectoryName(journal)!);
        void Save(string state,string id="CodexWebDelivery",string sid="fixture-sid")=>File.WriteAllBytes(journal,JsonSerializer.SerializeToUtf8Bytes(new {
            sid,componentId=id,release=staged.Digest,state,taskDigest=taskHash,configHash=ReleaseVerifier.HashFile(config),originalXml=original
        },SettingsStore.Json));
        ComponentUpdate Inspect()=>inspector.Inspect(component,true,kit,health);
        check(Inspect().State=="pending","unmanaged component is pending despite operational readiness");
        Save("installed");
        var before=Directory.GetFiles(store.Directory,"*",SearchOption.AllDirectories).Order().ToArray();
        var journalBytes=File.ReadAllBytes(journal);
        check(Inspect().Current && before.SequenceEqual(Directory.GetFiles(store.Directory,"*",SearchOption.AllDirectories).Order()) && journalBytes.SequenceEqual(File.ReadAllBytes(journal)),
            "version verification is read-only and confirms exact current package");
        check(!inspector.Inspect(component,false,kit,health).Current && !inspector.Inspect(component,true,null,health).Current,
            "stale inventory or unverified package cannot claim component completion");
        check(inspector.Inspect(component with {TaskDigest=new string('0',64)},true,kit,health).Repair,
            "changed task invalidates installed receipt");
        check(inspector.Inspect(component,true,kit,health with {Attention=true}).State=="unavailable",
            "matching version does not hide readiness failure");
        Save("installed",id:"another-component");check(Inspect().State=="repair","foreign component journal cannot confirm release");
        Save("installed",sid:"another-user");check(Inspect().State=="repair","foreign user journal cannot confirm release");
        Save("needsElevation");check(Inspect().Elevation && Inspect().Repair,"permission failure exposes explicit Windows repair");
        check(!inspector.Inspect(component with {TaskDigest=new string('0',64)},true,kit,health).Elevation,"changed task invalidates elevation action");
        Save("disabling");check(Inspect().Repair && !Inspect().Current,"interrupted disabling stays repairable instead of a permanent success check");
        Save("rolledBack");check(Inspect().Repair && !Inspect().Current,"rollback exposes manual retry without claiming current release");
        Save("installed");
        File.WriteAllText(Path.Combine(kit,"DeliveryWorker.cjs"),"next version");
        check(Inspect().State=="pending","installed old release cannot pass the new package check");
        File.WriteAllText(Path.Combine(kit,"DeliveryWorker.cjs"),"fixture-DeliveryWorker.cjs");
        File.WriteAllText(Path.Combine(staged.Directory,"DeliveryWorker.cjs"),"corrupted");
        check(Inspect().State=="repair","damaged installed bytes invalidate version check");
        staged=WorkerManager.Prepare(store.Directory,kit,component.Id);Save("installed");
        check(Inspect().Current,"immutable repair alias passes exact signed source comparison");
        File.WriteAllText(config,"changed");check(!Inspect().Current,"changed configuration invalidates migration receipt");

        var browserDir=Path.GetFullPath(Path.Combine(store.Directory,"..","browser"));
        var browserKit=Path.Combine(kit,"browser-package");Directory.CreateDirectory(browserKit);
        var release=new string('b',64);var runtime=Path.Combine(browserDir,"runtime",release);Directory.CreateDirectory(runtime);
        var names=new[]{"CodexWebBrowser.exe","CodexWebBrowserHost.exe","Start-Browser.ps1","WebView2Loader.dll","Microsoft.Web.WebView2.Core.dll","Microsoft.Web.WebView2.WinForms.dll"};
        var files=new Dictionary<string,string>();
        foreach(var name in names){File.WriteAllText(Path.Combine(runtime,name),"fixture-"+name);files[name]=ReleaseVerifier.HashFile(Path.Combine(runtime,name));}
        File.Copy(Path.Combine(runtime,"Start-Browser.ps1"),Path.Combine(browserDir,"Start-Browser.ps1"));
        byte[] Manifest(string version)=>JsonSerializer.SerializeToUtf8Bytes(new {version,release,files},SettingsStore.Json);
        File.WriteAllBytes(Path.Combine(browserKit,"release.json"),Manifest("1.0.1"));
        File.WriteAllBytes(Path.Combine(browserDir,"current.json"),Manifest("1.0.1"));
        var browser=new Component("CodexWebBrowser","Browser","browser",true,true,true,"Running",Path.Combine(runtime,"CodexWebBrowserHost.exe"),true,taskHash,true);
        ComponentUpdate Browser()=>inspector.Inspect(browser,true,kit,StatusProjection.Project(browser,true));
        check(Browser().Current,"browser needs exact package files and responding connected tools");
        files["CodexWebBrowser.exe"]=new string('c',64);
        File.WriteAllBytes(Path.Combine(browserKit,"release.json"),Manifest("1.0.1"));
        check(Browser().State=="pending","older healthy browser keeps aggregate release incomplete");
        files["CodexWebBrowser.exe"]=ReleaseVerifier.HashFile(Path.Combine(runtime,"CodexWebBrowser.exe"));
        File.WriteAllBytes(Path.Combine(browserKit,"release.json"),Manifest("1.0.1"));
        File.WriteAllText(Path.Combine(browserDir,"Start-Browser.ps1"),"corrupted");
        check(Browser().Repair,"damaged stable browser launcher is repairable");
        check(ComponentUpdates.Summary([new("one","current",""),new("two","pending","",true)]).Contains("1 из 2"),"aggregate cannot call partial package migration complete");
    }
}
