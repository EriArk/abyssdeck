using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;
using Microsoft.Win32.SafeHandles;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Layout;
using Avalonia.Media;
using Avalonia.Threading;
using Avalonia.Input.Platform;
using Avalonia.Styling;

namespace CodexWeb.Companion;

public sealed class LocalTerminal : IDisposable
{
    [StructLayout(LayoutKind.Sequential)] struct Coord { public short X, Y; }
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)] struct Startup {
        public int cb; public string? reserved, desktop, title; public int x,y,xSize,ySize,xCount,yCount,fill,flags;
        public short show,reservedSize; public IntPtr reservedBytes,stdIn,stdOut,stdError;
    }
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)] struct StartupEx { public Startup Info; public IntPtr Attributes; }
    [StructLayout(LayoutKind.Sequential)] struct ProcessInfo { public IntPtr Process,Thread; public int Pid,Tid; }
    [DllImport("kernel32.dll",SetLastError=true)] static extern bool CreatePipe(out IntPtr read,out IntPtr write,IntPtr security,int size);
    [DllImport("kernel32.dll")] static extern int CreatePseudoConsole(Coord size,IntPtr input,IntPtr output,uint flags,out IntPtr console);
    [DllImport("kernel32.dll")] static extern void ClosePseudoConsole(IntPtr console);
    [DllImport("kernel32.dll",SetLastError=true)] static extern bool InitializeProcThreadAttributeList(IntPtr list,int count,int flags,ref IntPtr size);
    [DllImport("kernel32.dll",SetLastError=true)] static extern bool UpdateProcThreadAttribute(IntPtr list,uint flags,IntPtr attribute,IntPtr value,IntPtr size,IntPtr previous,IntPtr returned);
    [DllImport("kernel32.dll")] static extern void DeleteProcThreadAttributeList(IntPtr list);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
    [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool CreateProcess(string? application,StringBuilder command,IntPtr processAttributes,IntPtr threadAttributes,bool inherit,uint flags,IntPtr environment,string? cwd,ref StartupEx startup,out ProcessInfo process);
    IntPtr console;
    readonly StreamWriter input;
    readonly StreamReader output;
    public LocalTerminal()
    {
        IntPtr inputRead=IntPtr.Zero,inputWrite=IntPtr.Zero,outputRead=IntPtr.Zero,outputWrite=IntPtr.Zero,attributes=IntPtr.Zero;
        bool initialized=false;
        try {
            if(!CreatePipe(out inputRead,out inputWrite,IntPtr.Zero,0) || !CreatePipe(out outputRead,out outputWrite,IntPtr.Zero,0)) throw new IOException();
            if(CreatePseudoConsole(new(){X=100,Y=30},inputRead,outputWrite,0,out console)!=0) throw new IOException();
            var size=IntPtr.Zero; InitializeProcThreadAttributeList(IntPtr.Zero,1,0,ref size);
            attributes=Marshal.AllocHGlobal(size);
            initialized=InitializeProcThreadAttributeList(attributes,1,0,ref size);
            if(!initialized || !UpdateProcThreadAttribute(attributes,0,(IntPtr)0x20016,console,(IntPtr)IntPtr.Size,IntPtr.Zero,IntPtr.Zero)) throw new IOException();
            // Null standard handles with STARTF_USESTDHANDLES prevent inherited redirected
            // handles from bypassing ConPTY (microsoft/terminal discussion #15814).
            var start=new StartupEx{Info=new(){cb=Marshal.SizeOf<StartupEx>(),flags=0x100},Attributes=attributes};
            var command=new StringBuilder('"'+SetupOperations.PowerShell+"\" -NoLogo -NoProfile");
            if(!CreateProcess(null,command,IntPtr.Zero,IntPtr.Zero,false,0x80000,IntPtr.Zero,Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),ref start,out var process)) throw new IOException();
            CloseHandle(process.Thread);CloseHandle(process.Process);
            input=new(new FileStream(new SafeFileHandle(inputWrite,true),FileAccess.Write),new UTF8Encoding(false)){AutoFlush=true};inputWrite=IntPtr.Zero;
            output=new(new FileStream(new SafeFileHandle(outputRead,true),FileAccess.Read),Encoding.UTF8);outputRead=IntPtr.Zero;
        } catch { if(console!=IntPtr.Zero){ClosePseudoConsole(console);console=IntPtr.Zero;} throw new IOException("Локальный терминал Windows не запустился."); }
        finally { if(attributes!=IntPtr.Zero){if(initialized)DeleteProcThreadAttributeList(attributes);Marshal.FreeHGlobal(attributes);} foreach(var handle in new[]{inputRead,inputWrite,outputRead,outputWrite})if(handle!=IntPtr.Zero)CloseHandle(handle); }
    }
    readonly SemaphoreSlim writer=new(1,1);
    public async Task Write(string text) { await writer.WaitAsync();try { await input.WriteAsync(text);await input.FlushAsync(); }finally{writer.Release();} }
    public async Task Read(Action<string> append) { var bytes=new char[2048];while(true){var n=await output.ReadAsync(bytes);if(n==0)break;append(new string(bytes,0,n));} }
    public void Dispose() { input.Dispose(); if(console!=IntPtr.Zero){ClosePseudoConsole(console);console=IntPtr.Zero;}output.Dispose(); }
}

public sealed class TerminalWindow : Window
{
    public void SetCommand(string command) { if(string.IsNullOrWhiteSpace(field.Text))field.Text=command;
        else Append("\nКоманда для выбранного действия: " + command + "\nТекущий ввод сохранён.\n"); }
    LocalTerminal? terminal;
    readonly TextBlock output=new(){FontFamily=new FontFamily("Consolas"),TextWrapping=TextWrapping.Wrap};
    readonly ScrollViewer scroll=new();
    readonly TextBox field=new(){MinHeight=44,PlaceholderText="Команда или ответ текущему процессу"};
    readonly TextBox password=new(){MinHeight=44,PasswordChar='●',PlaceholderText="Пароль — только в текущий запрос терминала"};
    string tail="";int pasteGeneration;bool closed;
    public TerminalWindow(Palette palette)
    {
        Title="Локальный терминал · CodexWeb";Width=900;Height=650;MinWidth=650;MinHeight=450;
        Background=Themes.Brush(palette.Canvas);Foreground=Themes.Brush(palette.Ink);output.Foreground=Foreground;
        RequestedThemeVariant=palette.Dark?ThemeVariant.Dark:ThemeVariant.Light;
        scroll.Content=output;
        var layout=new Grid{RowDefinitions=new("Auto,*,Auto,Auto,Auto"),Margin=new Thickness(16),RowSpacing=10};
        layout.Children.Add(new TextBlock{Text="Этот пользователь Windows · закрытие завершает только этот терминал",TextWrapping=TextWrapping.Wrap});
        Grid.SetRow(scroll,1);layout.Children.Add(scroll);
        Button Key(string title,Func<Task> action){var b=new Button{Content=title,MinHeight=44,HorizontalAlignment=HorizontalAlignment.Stretch,Background=Themes.Brush(palette.Surface),Foreground=Themes.Brush(palette.Ink),BorderBrush=Themes.Brush(palette.Line),BorderThickness=new Thickness(1)};b.Click+=async(_,_)=>{try{await action();}catch{output.Text+="\nВвод не подтверждён. Проверь экран; автоматического повтора не будет.";}};return b;}
        Grid Input(TextBox box,string label){var row=new Grid{ColumnDefinitions=new("*,110,110"),ColumnSpacing=8};row.Children.Add(box);
            var paste=Key("Вставить",async()=>{var generation=++pasteGeneration;var original=box.Text;var start=box.SelectionStart;var end=box.SelectionEnd;
                var text=Clipboard is null?null:await Clipboard.TryGetTextAsync();
                if(generation!=pasteGeneration||!IsVisible||box.Text!=original||box.SelectionStart!=start||box.SelectionEnd!=end||text is null)return;
                var a=Math.Min(start,end);var b=Math.Max(start,end);box.Text=(original??"").Remove(a,b-a).Insert(a,text);box.SelectionStart=box.SelectionEnd=a+text.Length;});
            Grid.SetColumn(paste,1);row.Children.Add(paste);
            var send=Key(label,async()=>{pasteGeneration++;var value=box.Text??"";box.Text="";if(terminal is not null)await terminal.Write(value+"\r");});Grid.SetColumn(send,2);row.Children.Add(send);return row;}
        Grid.SetRow(field,2);var commands=Input(field,"Отправить");Grid.SetRow(commands,2);layout.Children.Add(commands);
        var secrets=Input(password,"Ввести пароль");Grid.SetRow(secrets,3);layout.Children.Add(secrets);
        var keys=new Grid{ColumnDefinitions=new("*,*,*,*,*,*"),ColumnSpacing=8};
        var entries=new[]{("Enter","\r"),("Esc","\u001b"),("Tab","\t"),("Ctrl+C","\u0003"),("↑","\u001b[A"),("↓","\u001b[B")};
        for(var i=0;i<entries.Length;i++){var value=entries[i];var key=Key(value.Item1,async()=>{if(terminal is not null)await terminal.Write(value.Item2);});Grid.SetColumn(key,i);keys.Children.Add(key);}
        Grid.SetRow(keys,4);layout.Children.Add(keys);Content=layout;
        field.TextChanged+=(_,_)=>pasteGeneration++;password.TextChanged+=(_,_)=>pasteGeneration++;
        Opened+=async(_,_)=>{try{terminal=new();await terminal.Read(text=>Dispatcher.UIThread.Post(()=>Append(text)));}catch{ }
            finally { if(!closed){Append("\nТерминал завершён. Закрой это окно и открой новый терминал.");field.IsEnabled=false;password.IsEnabled=false;commands.IsEnabled=false;secrets.IsEnabled=false;keys.IsEnabled=false;} }};
        Deactivated+=(_,_)=>pasteGeneration++;
        Closed+=(_,_)=>{closed=true;pasteGeneration++;field.Text="";password.Text="";terminal?.Dispose();};
    }
    void Append(string text)
    {
        if(closed)return;
        var following=scroll.Extent.Height-scroll.Viewport.Height-scroll.Offset.Y<30;
        // Bounded transient output, no disk logging. Keep partial ANSI sequences until complete.
        text=tail+text;tail="";var last=text.LastIndexOf('\u001b');
        if(last>=0 && !Regex.IsMatch(text[last..],@"^\x1b(?:\[[0-?]*[ -/]*[@-~]|\][^\a]*(?:\a|\x1b\\))")){tail=text[last..];text=text[..last];if(tail.Length>8192)tail="";}
        text=Regex.Replace(text,@"\x1b(?:\[[0-?]*[ -/]*[@-~]|\][^\a]*(?:\a|\x1b\\))","");
        var combined=(output.Text??"")+text.Replace("\r\n","\n").Replace('\r','\n');
        output.Text=combined.Length>100000?combined[^100000..]:combined;
        if(following)Dispatcher.UIThread.Post(()=>{if(!closed)scroll.ScrollToEnd();},DispatcherPriority.Loaded);
    }
}
