using System;
using System.IO;
using System.Diagnostics;
using System.Security.Cryptography;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;

public sealed class ExactFileLaunch : IDisposable {
    public Process Process { get; private set; }
    FileStream file;
    readonly List<SafeFileHandle> directories = new List<SafeFileHandle>();
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
    static extern SafeFileHandle CreateFile(string path, uint access, uint share, IntPtr security, uint disposition, uint flags, IntPtr template);
    static void Fail(string code) { throw new Exception(code); }
    static string Quote(string value) { return "\"" + value.Replace("\"", "\\\"") + "\""; }
    public ExactFileLaunch(string root, string relative, string sha256, long bytes, long expiresAt) {
      try {
        if (!System.Text.RegularExpressions.Regex.IsMatch(root.Replace('\\','/'), @"^[a-zA-Z]:/") || root.Substring(2).Contains(":") || relative.IndexOfAny(new char[]{'\\',':','\r','\n','\0','"','<','>','|','?','*'})>=0) Fail("LAUNCH_PATH");
        foreach(string part in relative.Split('/')) if(part=="" || part=="." || part==".." || part.EndsWith(".") || part.EndsWith(" ")) Fail("LAUNCH_PATH");
        root=Path.GetFullPath(root).TrimEnd('\\');
        string target=Path.GetFullPath(Path.Combine(root,relative));
        if(!target.StartsWith(root+"\\",StringComparison.OrdinalIgnoreCase)) Fail("LAUNCH_PATH");
        string ext=Path.GetExtension(target).ToLowerInvariant();
        if(ext!=".exe" && ext!=".cmd" && ext!=".bat" && ext!=".ps1") Fail("LAUNCH_FORMAT");
        if((ext==".cmd" || ext==".bat") && target.IndexOfAny(new char[]{'%','!','&','^','(',')'})>=0) Fail("LAUNCH_PATH");
        // Keep parents from being renamed while the exact file is validated and opened.
        var parents = new List<string>(); var d=Path.GetDirectoryName(target);
        while(!String.IsNullOrEmpty(d)){parents.Add(d);var next=Path.GetDirectoryName(d);if(next==d)break;d=next;}
        parents.Reverse();
        foreach(var parent in parents){
          var h=CreateFile(parent,0x80,3,IntPtr.Zero,3,0x02200000,IntPtr.Zero);
          if(h.IsInvalid){h.Dispose();Fail("LAUNCH_PATH");} directories.Add(h);
          if((File.GetAttributes(parent)&FileAttributes.ReparsePoint)!=0) Fail("LAUNCH_PATH");
        }
        if((File.GetAttributes(target)&(FileAttributes.ReparsePoint|FileAttributes.Directory))!=0) Fail("LAUNCH_PATH");
        file=new FileStream(target,FileMode.Open,FileAccess.Read,FileShare.Read);
        if(file.Length!=bytes) Fail("LAUNCH_CHANGED");
        using(var hash=SHA256.Create()) if(BitConverter.ToString(hash.ComputeHash(file)).Replace("-","").ToLowerInvariant()!=sha256) Fail("LAUNCH_CHANGED");
        file.Position=0;
        if(ext==".exe" && (file.ReadByte()!=77 || file.ReadByte()!=90)) Fail("LAUNCH_FORMAT");
        if(DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()>expiresAt) Fail("LAUNCH_EXPIRED");
        var start=new ProcessStartInfo { WorkingDirectory=Path.GetDirectoryName(target), UseShellExecute=false, CreateNoWindow=false };
        start.EnvironmentVariables.Remove("PSExecutionPolicyPreference");
        if(ext==".exe") start.FileName=target;
        else if(ext==".ps1") {
          start.FileName=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System),@"WindowsPowerShell\v1.0\powershell.exe");
          // Respect the target user's script execution policy. Only the fixed helper uses Bypass.
          start.Arguments="-NoLogo -NoProfile -File "+Quote(target);
        } else {
          start.FileName=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System),"cmd.exe");
          start.Arguments="/d /v:off /s /c \""+Quote(target)+"\"";
        }
        Process=Process.Start(start);
        if(Process==null) Fail("LAUNCH_FAILED");
      } catch { Dispose(); throw; }
    }
    public void Dispose(){ if(file!=null){file.Dispose();file=null;} foreach(var h in directories)h.Dispose();directories.Clear();if(Process!=null)Process.Dispose(); }
}
