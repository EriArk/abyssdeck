using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.IO.Pipes;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Runtime.InteropServices;

namespace CodexWeb {
  // The same-user, local-only Companion owns stdio. A disconnected controller
  // never closes it. Capabilities arrive over stdin/pipe, not process arguments.
  public static class RuntimeBroker {
    static readonly object RegistryLock = new object();
    static readonly Dictionary<string, Runtime> Runtimes = new Dictionary<string, Runtime>();
    static readonly Encoding Utf8 = new UTF8Encoding(false, true);
    const int MaxFrame = 16 * 1024 * 1024;
    const int MaxQuestions = 8 * 1024 * 1024;
    static JavaScriptSerializer Json() { return new JavaScriptSerializer { MaxJsonLength = MaxFrame, RecursionLimit = 100 }; }
    static string Text(Dictionary<string, object> v, string k) { object x; return v.TryGetValue(k, out x) ? x as string : null; }
    static string Key(object id) { return Json().Serialize(id); }
    static bool Token(string value) {
      if (value == null || value.Length != 64) return false;
      foreach (char c in value) if (!((c >= '0' && c <= '9') || (c >= 'a' && c <= 'f'))) return false;
      return true;
    }
    sealed class Frames {
      readonly Stream Stream;
      readonly byte[] Buffer = new byte[65536];
      int Offset, Count;
      public Frames(Stream stream) { Stream=stream; }
      public async Task<string> Next(bool drainOversized = false) {
        using(var bytes=new MemoryStream()) {
          bool oversized=false;
          for(;;) {
            if(Offset==Count) { Count=await Stream.ReadAsync(Buffer,0,Buffer.Length); Offset=0; if(Count==0)throw new EndOfStreamException(); }
            int end=Offset; while(end<Count && Buffer[end]!=10)end++;
            if(bytes.Length+end-Offset>MaxFrame) { if(!drainOversized)throw new InvalidDataException("FRAME_LIMIT"); oversized=true; }
            if(!oversized)bytes.Write(Buffer,Offset,end-Offset); Offset=end;
            if(Offset<Count) { Offset++; return oversized ? null : Utf8.GetString(bytes.ToArray()).TrimEnd('\r'); }
          }
        }
      }
    }
    sealed class Controller {
      public NamedPipeServerStream Pipe;
      public readonly SemaphoreSlim Output = new SemaphoreSlim(1);
      public bool Ready;
      public async Task Send(object value) {
        byte[] bytes = Utf8.GetBytes(Json().Serialize(value) + "\n");
        await Output.WaitAsync();
        try {
          var sending=Pipe.WriteAsync(bytes, 0, bytes.Length);
          if(await Task.WhenAny(sending,Task.Delay(5000))!=sending) { Pipe.Dispose(); throw new IOException("CONTROLLER_TIMEOUT"); }
          await sending; await Pipe.FlushAsync();
        }
        finally { Output.Release(); }
      }
    }
    sealed class Call {
      public Controller Owner;
      public object Id;
      public string Method;
    }
    sealed class Runtime {
      public string Capability, Binding, Cwd, Instance = Guid.NewGuid().ToString();
      public Process Child;
      public Controller Owner;
      public readonly object Gate = new object();
      public readonly SemaphoreSlim Input = new SemaphoreSlim(1);
      public readonly Dictionary<string, Call> Calls = new Dictionary<string, Call>();
      public readonly Dictionary<string, Dictionary<string, object>> Questions = new Dictionary<string, Dictionary<string, object>>();
      public readonly Dictionary<string,string> Active = new Dictionary<string,string>();
      public bool NativeInitialized;
      public string InitializationParams;
      public int QuestionBytes;
      public readonly Dictionary<string,int> QuestionSizes = new Dictionary<string,int>();
      public IntPtr Job;
      public Dictionary<string, object> Initialization;
      public bool Dead;
      public long Sequence;
      public DateTime DetachedAt = DateTime.UtcNow;
      public async Task Write(object frame) {
        var bytes = Utf8.GetBytes(Json().Serialize(frame) + "\n");
        await Input.WaitAsync();
        try { await Child.StandardInput.BaseStream.WriteAsync(bytes, 0, bytes.Length); await Child.StandardInput.BaseStream.FlushAsync(); }
        finally { Input.Release(); }
      }
      public Dictionary<string, object> Info() {
        lock(Gate) return new Dictionary<string, object> { {"protocol",2}, {"runtimeId",Binding}, {"instanceId",Instance}, {"pid",Child.Id}, {"active",Active.Count}, {"pending",Questions.Count}, {"turns",new Dictionary<string,string>(Active)} };
      }
      public void RemoveQuestion(string key) {
        int size; if(QuestionSizes.TryGetValue(key,out size)) { QuestionBytes-=size; QuestionSizes.Remove(key); }
        Questions.Remove(key); Monitor.PulseAll(Gate);
      }
      public void Stop() {
        lock (Gate) { Dead = true; Monitor.PulseAll(Gate); if (Owner != null) { try { Owner.Pipe.Dispose(); } catch {} } }
        try { if (!Child.HasExited) Child.StandardInput.Close(); } catch {}
        if(Job!=IntPtr.Zero) { CloseHandle(Job); Job=IntPtr.Zero; }
      }
    }
    public static async Task Serve(NamedPipeServerStream pipe, Config config, string raw) {
      var input = Json().Deserialize<Dictionary<string, object>>(raw);
      if (input.Count != 4 || !Token(Text(input,"capability")) || !Token(Text(input,"binding"))) throw new InvalidDataException();
      var cwd = Path.GetFullPath(Text(input,"cwd"));
      bool allowed = false;
      foreach (var root in config.workingDirectories)
        if (String.Equals(Path.GetFullPath(root).TrimEnd('\\'),cwd.TrimEnd('\\'),StringComparison.OrdinalIgnoreCase)) allowed = true;
      if (!allowed || !Directory.Exists(cwd) || !(input["create"] is bool)) throw new InvalidDataException();
      Runtime runtime;
      var controller = new Controller { Pipe = pipe };
      lock (RegistryLock) {
        string capability = Text(input,"capability");
        if (Runtimes.TryGetValue(capability,out runtime) && (runtime.Dead || runtime.Child.HasExited)) {
          runtime.Dead = true;
          Runtimes.Remove(capability);
          runtime = null;
        }
        if (runtime == null) {
          if (!(bool)input["create"]) throw new InvalidOperationException("RUNTIME_MISSING");
          foreach(var stale in new List<string>(Runtimes.Keys)) if(Runtimes[stale].Dead || Runtimes[stale].Child.HasExited) Runtimes.Remove(stale);
          if (Runtimes.Count >= 8) throw new InvalidOperationException("RUNTIME_LIMIT");
          runtime = new Runtime { Capability=capability, Binding=Text(input,"binding"), Cwd=cwd };
          runtime.Child = new Process { StartInfo = new ProcessStartInfo {
            FileName=config.codexCommand, Arguments="app-server --listen stdio://", WorkingDirectory=cwd,
            UseShellExecute=false, CreateNoWindow=true, RedirectStandardInput=true, RedirectStandardOutput=true, RedirectStandardError=true
          } };
          runtime.Job=CreateJob();
          if (!runtime.Child.Start() || !AssignProcessToJobObject(runtime.Job,runtime.Child.Handle)) { runtime.Stop(); throw new InvalidOperationException(); }
          Runtimes.Add(capability,runtime);
          var r = runtime;
          Task.Run(async delegate { try { await r.Child.StandardError.BaseStream.CopyToAsync(Stream.Null); } catch {} });
          Task.Run(async delegate { await ReadNative(r); });
        }
        lock (runtime.Gate) {
          if (runtime.Binding != Text(input,"binding") || !String.Equals(runtime.Cwd,cwd,StringComparison.OrdinalIgnoreCase) || runtime.Owner != null || runtime.Dead)
            throw new InvalidOperationException("RUNTIME_OWNED");
          runtime.Owner = controller;
        }
      }
      try {
        var ok=Utf8.GetBytes("OK\n"); await pipe.WriteAsync(ok,0,ok.Length);
        var frames=new Frames(pipe);
        while (true) {
          var frame=Json().Deserialize<Dictionary<string,object>>(await frames.Next());
          object id; bool hasId=frame.TryGetValue("id",out id); string method=Text(frame,"method");
          lock(runtime.Gate) { if(runtime.Owner != controller || runtime.Dead) throw new InvalidOperationException("STALE_CONTROLLER"); }
          if(method=="companion/inspect" && hasId) { await controller.Send(new {id=id,result=runtime.Info()}); continue; }
          if(method=="companion/ready" && hasId) {
            Dictionary<string,object>[] questions;
            lock(runtime.Gate) { questions=new List<Dictionary<string,object>>(runtime.Questions.Values).ToArray(); controller.Ready=true; }
            await controller.Send(new {id=id,result=new {pending=questions}}); continue;
          }
          if(method=="companion/terminate" && hasId) {
            object parameters; var p=frame.TryGetValue("params",out parameters)?parameters as Dictionary<string,object>:null;
            if(p==null || p.Count!=1 || !p.ContainsKey("confirm") || !(p["confirm"] is bool) || !(bool)p["confirm"])throw new InvalidDataException();
            await controller.Send(new {id=id,result=new {closed=true}});runtime.Stop();break;
          }
          if(method=="companion/close" && hasId) {
            bool busy; lock(runtime.Gate) { busy=runtime.Active.Count != 0 || runtime.Questions.Count != 0 || runtime.Calls.Count != 0; }
            if(busy) { await controller.Send(new {id=id,error=new {code=-32001,message="RUNTIME_BUSY"}}); continue; }
            await controller.Send(new {id=id,result=new {closed=true}}); runtime.Stop(); break;
          }
          if(method=="initialize" && hasId) {
            object parameters; var requested=Json().Serialize(frame.TryGetValue("params",out parameters)?parameters:null);
            Dictionary<string,object> initialized=null;
            lock(runtime.Gate) {
              if(runtime.InitializationParams!=null && runtime.InitializationParams!=requested) throw new InvalidOperationException("INITIALIZATION_CHANGED");
              if(runtime.InitializationParams!=null && runtime.Initialization==null) throw new InvalidOperationException("INITIALIZATION_PENDING");
              runtime.InitializationParams=requested;
              if(runtime.Initialization!=null) { initialized=new Dictionary<string,object>(runtime.Initialization); initialized["companion"]=runtime.Info(); }
            }
            if(initialized!=null) { await controller.Send(new {id=id,result=initialized}); continue; }
          }
          if(method=="initialized" && runtime.Initialization != null) {
            // Initialization is performed once per native runtime, not per Hub.
            if(!runtime.NativeInitialized) { runtime.NativeInitialized=true; await runtime.Write(frame); }
            continue;
          }
          if(method != null && hasId) {
            string nativeId;
            lock(runtime.Gate) {
              if(runtime.Calls.Count >= 128) throw new InvalidOperationException("CALL_LIMIT");
              nativeId="cw:"+runtime.Instance+":"+(++runtime.Sequence);
              runtime.Calls.Add(Key(nativeId),new Call {Owner=controller,Id=id,Method=method});
            }
            frame["id"]=nativeId;
          } else if(method==null && hasId) {
            lock(runtime.Gate) {
              if(!runtime.Questions.ContainsKey(Key(id))) throw new InvalidOperationException("REQUEST_EXPIRED");
              // Remove BEFORE write: an ambiguous response is never replayed.
              runtime.RemoveQuestion(Key(id));
            }
          }
          await runtime.Write(frame);
        }
      } finally {
        lock(runtime.Gate) { if(runtime.Owner==controller) { runtime.Owner=null; runtime.DetachedAt=DateTime.UtcNow; } }
      }
    }
    static async Task ReadNative(Runtime runtime) {
      try {
        var frames=new Frames(runtime.Child.StandardOutput.BaseStream);
        while(true) {
          var raw=await frames.Next(true);
          if(raw==null) {
            // Reject unconfirmed controller calls, not the native process. This
            // also leaves all active turns and unanswered native requests alive.
            List<Call> calls;
            lock(runtime.Gate) { calls=new List<Call>(runtime.Calls.Values); runtime.Calls.Clear(); }
            foreach(var call in calls) {
              try { await call.Owner.Send(new {id=call.Id,error=new {code=-32002,message="COMPANION_RESPONSE_TOO_LARGE"}}); } catch {}
            }
            continue;
          }
          var frame=Json().Deserialize<Dictionary<string,object>>(raw);
          object id; bool hasId=frame.TryGetValue("id",out id); string method=Text(frame,"method");
          Controller target;
          lock(runtime.Gate) {
            target=runtime.Owner;
            if(hasId && method==null) {
              Call call;
              if(!runtime.Calls.TryGetValue(Key(id),out call)) continue;
              runtime.Calls.Remove(Key(id)); frame["id"]=call.Id;
              if(call.Method=="initialize" && frame.ContainsKey("result")) {
                var result=frame["result"] as Dictionary<string,object>;
                if(result != null) { result["companion"]=runtime.Info(); runtime.Initialization=result; }
              }
              if(call.Method=="initialize" && runtime.Initialization==null) runtime.InitializationParams=null;
              if(call.Owner != target) continue;
            } else if(hasId) {
              // Pending native approvals remain unanswered across detach. Backpressure
              // bounds memory; it never fabricates a default response.
              int size=Utf8.GetByteCount(Json().Serialize(frame));
              // Leave room for the ready response envelope and JSON escaping.
              if(size>MaxQuestions) throw new InvalidDataException("REQUEST_LIMIT");
              while((runtime.Questions.Count>=64 || runtime.QuestionBytes+size>MaxQuestions) && !runtime.Dead) Monitor.Wait(runtime.Gate,1000);
              if(runtime.Dead) return;
              if(runtime.Questions.ContainsKey(Key(id))) throw new InvalidDataException("DUPLICATE_REQUEST");
              runtime.Questions[Key(id)]=frame; runtime.QuestionSizes[Key(id)]=size; runtime.QuestionBytes+=size;
              target=runtime.Owner;
              if(target==null || !target.Ready) continue;
            } else if(method != null) {
              object p; var args=frame.TryGetValue("params",out p) ? p as Dictionary<string,object> : null;
              if(args != null) {
                var thread=Text(args,"threadId");
                if(thread != null && method=="turn/started") { object turn; var t=args.TryGetValue("turn",out turn) ? turn as Dictionary<string,object> : null; runtime.Active[thread]=t==null ? "" : Text(t,"id"); }
                if(method=="serverRequest/resolved" && args.ContainsKey("requestId")) { runtime.RemoveQuestion(Key(args["requestId"])); }
                if(thread != null && method=="turn/completed") {
                  runtime.Active.Remove(thread);
                  foreach(var key in new List<string>(runtime.Questions.Keys)) {
                    object qp; var q=runtime.Questions[key].TryGetValue("params",out qp) ? qp as Dictionary<string,object> : null;
                    if(q!=null && Text(q,"threadId")==thread)runtime.RemoveQuestion(key);
                  }
                  Monitor.PulseAll(runtime.Gate);
                }
              }
            }
          }
          if(target != null && (method==null || target.Ready)) { try { await target.Send(frame); } catch { try { target.Pipe.Dispose(); } catch {} } }
        }
      } catch { runtime.Stop(); }
    }
    // Job lifetime follows Companion/runtime, never a controller pipe.
    static IntPtr CreateJob() {
      var job=CreateJobObject(IntPtr.Zero,null); if(job==IntPtr.Zero)throw new InvalidOperationException();
      var limits=new JobLimits(); limits.BasicLimitInformation.LimitFlags=0x00002000;
      var size=Marshal.SizeOf(typeof(JobLimits)); var memory=Marshal.AllocHGlobal(size);
      try { Marshal.StructureToPtr(limits,memory,false); if(!SetInformationJobObject(job,9,memory,(uint)size)) { CloseHandle(job); throw new InvalidOperationException(); } }
      finally { Marshal.FreeHGlobal(memory); } return job;
    }
    [StructLayout(LayoutKind.Sequential)] struct BasicLimits { public long PerProcessUserTimeLimit,PerJobUserTimeLimit; public uint LimitFlags; public UIntPtr MinimumWorkingSetSize,MaximumWorkingSetSize; public uint ActiveProcessLimit; public UIntPtr Affinity; public uint PriorityClass,SchedulingClass; }
    [StructLayout(LayoutKind.Sequential)] struct IoCounters { public ulong ReadOperationCount,WriteOperationCount,OtherOperationCount,ReadTransferCount,WriteTransferCount,OtherTransferCount; }
    [StructLayout(LayoutKind.Sequential)] struct JobLimits { public BasicLimits BasicLimitInformation; public IoCounters IoInfo; public UIntPtr ProcessMemoryLimit,JobMemoryLimit,PeakProcessMemoryUsed,PeakJobMemoryUsed; }
    [DllImport("kernel32.dll",CharSet=CharSet.Unicode)] static extern IntPtr CreateJobObject(IntPtr attributes,string name);
    [DllImport("kernel32.dll",SetLastError=true)] static extern bool SetInformationJobObject(IntPtr job,int infoClass,IntPtr info,uint length);
    [DllImport("kernel32.dll",SetLastError=true)] static extern bool AssignProcessToJobObject(IntPtr job,IntPtr process);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
  }
}
