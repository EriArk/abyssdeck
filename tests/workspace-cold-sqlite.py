"""Real installed Node/SQLite contract for the cold checkpoint's state mount."""
import hashlib,os,sqlite3,subprocess,sys,tempfile
from pathlib import Path

image=sys.argv[1]
with tempfile.TemporaryDirectory(prefix='cw-cold-sqlite-') as directory:
    root=Path(directory)
    db=sqlite3.connect(root/'cold.db')
    db.execute('PRAGMA journal_mode=WAL')
    db.execute('CREATE TABLE example(value TEXT)')
    db.execute("INSERT INTO example VALUES('exact original bytes')")
    db.commit();db.close()
    def digest():return hashlib.sha256((root/'cold.db').read_bytes()).hexdigest()
    before=digest()
    script="""const {DatabaseSync}=require('node:sqlite');
const db=new DatabaseSync('/proof/cold.db',{readOnly:true});
if(db.prepare('SELECT value FROM example').get().value!=='exact original bytes')throw Error('DATA_CHANGED');
try { db.exec('DELETE FROM example'); throw Error('WRITE_ALLOWED'); } catch(e) { if(e.message==='WRITE_ALLOWED')throw e; }
db.close();console.log('Cold WAL read succeeds; source SQL mutations refused.');"""
    args=['docker','run','--rm','--network','none','--read-only','--user',f'{os.getuid()}:{os.getgid()}',
          '--cap-drop','ALL','--memory','128m']
    rejected=subprocess.run(args+['-v',directory+':/proof:ro',image,'node','-e',script],capture_output=True,text=True,timeout=30)
    assert rejected.returncode!=0 and 'unable to open database file' in rejected.stderr
    subprocess.run(args+['-v',directory+':/proof',image,'node','-e',script],check=True,timeout=30)
    assert digest()==before,'Source database bytes changed'
