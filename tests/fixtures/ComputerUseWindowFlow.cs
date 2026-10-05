// Standalone acceptance runner compiled with the production adapter. Every
// input is scoped by that adapter to these disposable fixture windows.
using System;
using System.Collections.Generic;
using System.Drawing;
using System.IO;
using System.Reflection;
using System.Threading;
using System.Windows.Forms;

public class ComputerUseWindowFlow {
    [System.Runtime.InteropServices.DllImport("user32.dll")] static extern bool ShowWindow(IntPtr window, int command);
    static Form main, second;
    static TextBox editor;
    static int selected;
    static string selectedPath, file;
    static readonly Type Adapter = typeof(CodexWeb.ComputerUse.Program);
    static readonly BindingFlags Flags = BindingFlags.NonPublic | BindingFlags.Static;
    static readonly string Client = Guid.NewGuid().ToString("N");
    static readonly ManualResetEvent Ready = new ManualResetEvent(false);
    static object Private(string name, params object[] values) { return Adapter.GetMethod(name, Flags).Invoke(null, values); }
    static Dictionary<string, object> Call(string name, params object[] pairs) {
        Private("SetThreadDpiAwarenessContext", new IntPtr(-4));
        Adapter.GetField("Deadline", Flags).SetValue(null, DateTime.UtcNow.AddSeconds(8));
        var args = new Dictionary<string, object>();
        for (int i = 0; i < pairs.Length; i += 2) args[(string)pairs[i]] = pairs[i+1];
        var result = Private("Dispatch", Client, name, args);
        var json = new System.Web.Script.Serialization.JavaScriptSerializer { MaxJsonLength = 16000000 };
        var wire = json.Deserialize<Dictionary<string, object>>(json.Serialize(result));
        var blocks = (System.Collections.IList)wire["content"];
        return json.Deserialize<Dictionary<string, object>>((string)((Dictionary<string,object>)blocks[0])["text"]);
    }
    static void Check(bool yes, string message) { if (!yes) throw new Exception(message); }
    static void Reject(Action action, string code) {
        try { action(); } catch (Exception e) { if (e.ToString().Contains(code)) return; throw; }
        throw new Exception("Expected " + code);
    }
    static void Ui(Action action) { main.Invoke(action); }
    static Dictionary<string,object> Observe(string id) {
        try { return Call("observe", "window", id); }
        catch { Console.Error.WriteLine("Observe failed; foreground class: " + Private("Class", Private("GetForegroundWindow"))); throw; }
    }
    static void Key(Dictionary<string,object> o, string key) { Call("act", "observation", o["observation"], "kind", "key", "key", key); }
    static void ChooseFile() {
        using (var dialog = new OpenFileDialog { Title = "AbyssDeck fixture file picker", InitialDirectory = Path.GetDirectoryName(file), FileName = "", CheckFileExists = true }) {
            if (dialog.ShowDialog(main) == DialogResult.OK) { selectedPath = dialog.FileName; Interlocked.Increment(ref selected); }
        }
        editor.Focus();
    }
    static void RunUi() {
        Application.EnableVisualStyles();
        main = new Form { Text = "AbyssDeck Computer Use fixture", StartPosition = FormStartPosition.CenterScreen, Size = new Size(640, 400), KeyPreview = true };
        editor = new TextBox { Multiline = true, Dock = DockStyle.Fill, Text = "Fixture only. No user data." };
        main.Controls.Add(editor);
        main.KeyDown += delegate(object s, KeyEventArgs e) { if (e.Control && e.KeyCode == Keys.O) { e.Handled = true; e.SuppressKeyPress = true; main.BeginInvoke((Action)ChooseFile); } };
        main.Shown += delegate { main.BeginInvoke((Action)delegate { ShowWindow(main.Handle, 5); editor.Focus(); Ready.Set(); }); };
        Application.Run(main);
    }
    [STAThread]
    public static int Main(string[] args) {
        Private("SetProcessDpiAwarenessContext", new IntPtr(-4));
        file = Path.Combine(args[0], "fixture-\u0442\u0435\u0441\u0442.txt");
        File.WriteAllText(file, "Disposable local picker fixture.");
        var ui = new Thread(RunUi); ui.IsBackground = true; ui.SetApartmentState(ApartmentState.STA); ui.Start();
        try {
            Check(Ready.WaitOne(10000), "Fixture startup timed out");
            var windows = (System.Collections.IList)Call("list_windows")["windows"];
            string id = null;
            foreach (Dictionary<string,object> w in windows) if ((string)w["title"] == "AbyssDeck Computer Use fixture") id = (string)w["id"];
            Check(id != null, "Fixture not listed");
            for (int round = 0; round < 3; round++) {
                Console.WriteLine("Opening picker round " + (round + 1));
                var parent = Observe(id); Key(parent, "CTRL+O");
                Dictionary<string,object> picker = null;
                for (int wait = 0; wait < 40; wait++) {
                    Thread.Sleep(100);
                    picker = Observe(id); // Same app ID must follow its modal picker.
                    if ((string)picker["title"] == "AbyssDeck fixture file picker") break;
                }
                Check((string)picker["title"] == "AbyssDeck fixture file picker", "Picker handoff failed");
                var dialogId = (string)picker["window"];
                Check((string)picker["owner"] == id, "Wrong picker owner");
                Key(picker, "ALT+N");
                picker = Observe("active");
                Call("act", "observation", picker["observation"], "kind", "type", "text", file);
                picker = Observe(dialogId); Key(picker, "ENTER");
                for (int wait = 0; wait < 40 && selected <= round; wait++) Thread.Sleep(100);
                Check(selected == round + 1 && selectedPath == file, "Picker lost Unicode path or failed to accept");
                var returned = Observe(dialogId); // Closed dialog ID returns to remembered app.
                Check((string)returned["window"] == id, "Did not return from closed picker");
                Console.WriteLine("PASS file picker round " + (round + 1));
            }
            var old = Observe(id);
            Ui(delegate {
                second = new Form { Text = "AbyssDeck second fixture", Size = new Size(320, 200), StartPosition = FormStartPosition.CenterScreen };
                second.Controls.Add(new TextBox { Dock = DockStyle.Fill }); second.Show(); second.Activate();
            });
            Thread.Sleep(150);
            Reject(delegate { Key(old, "A"); }, "FOCUS_CHANGED");
            Reject(delegate { Key(old, "A"); }, "OBSERVATION_EXPIRED");
            var other = Observe("active"); Check((string)other["title"] == "AbyssDeck second fixture", "Active app switch failed");
            var otherId = (string)other["window"];
            Observe(id); Check((string)Observe(otherId)["title"] == "AbyssDeck second fixture", "Explicit app switching failed");
            Ui(delegate { second.Close(); });
            Observe(id);
            Form overlay = null;
            Ui(delegate { overlay = new PassiveOverlay { Location = new Point(main.Left + 80, main.Top + 80), Size = new Size(80,80), StartPosition = FormStartPosition.Manual, FormBorderStyle = FormBorderStyle.None, BackColor = Color.Orange, TopMost = true }; overlay.Show(); });
            try {
                var covered = Observe(id); // Real foreign overlay must not prohibit capture.
                var observations = Adapter.GetField("Observations",Flags).GetValue(null);
                var saved = observations.GetType().GetProperty("Item").GetValue(observations,new object[] {covered["observation"]});
                var bounds = saved.GetType().GetField("Bounds").GetValue(saved);
                int left = (int)bounds.GetType().GetField("Left").GetValue(bounds), top = (int)bounds.GetType().GetField("Top").GetValue(bounds);
                Point p = Point.Empty; Ui(delegate { p = overlay.PointToScreen(new Point(20,20)); });
                Reject(delegate { Call("act","observation",covered["observation"],"kind","click","x",p.X-left,"y",p.Y-top); }, "POINT_NOT_IN_TARGET");
                Check((string)Observe(id)["title"] == "AbyssDeck Computer Use fixture", "Cannot observe after rejected covered-point click");
            } finally { Ui(delegate { overlay.Close(); }); }
            Ui(delegate { Check(editor.Text == "Fixture only. No user data.", "Unexpected text entered in parent"); });
            Console.WriteLine("PASS app switching, stale-input rejection, visible overlapping capture and covered-point rejection");
            return 0;
        } catch (Exception e) { Console.Error.WriteLine(e); return 1; }
        finally { if (Ready.WaitOne(0)) { try { main.BeginInvoke((Action)delegate { foreach (Form f in new List<Form>(OpenForms())) if (f != main) f.Close(); main.Close(); }); } catch {} } ui.Join(1000); }
    }
    static IEnumerable<Form> OpenForms() { foreach (Form f in Application.OpenForms) yield return f; }
    class PassiveOverlay : Form { protected override bool ShowWithoutActivation { get { return true; } } protected override CreateParams CreateParams { get { var c = base.CreateParams; c.ExStyle |= 0x08000000; return c; } } }
}
