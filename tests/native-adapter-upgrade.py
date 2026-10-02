import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('native_upgrade', Path(__file__).resolve().parents[1] / 'ops/linux/upgrade-native-adapter.py')
upgrade = importlib.util.module_from_spec(spec)
spec.loader.exec_module(upgrade)


class Upgrade(unittest.TestCase):
    def scenario(self, busy=False, fail_start=False, enrolled=True):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);profile=root/'profile';profile.mkdir();(profile/'native-adapter').mkdir()
            (profile/('native-adapter/binding.json' if enrolled else 'native-adapter/enrollment.json')).write_text(json.dumps({'userId':'12345678-1234-4234-8234-123456789012'}))
            (root/'data/team').mkdir(parents=True)
            name='codex-web-gpt-native-lab';calls=[];starts=0
            old={'Name':'/'+name,'State':{'Running':True},'Config':{'Image':'codex-web-gpt-native:before','Hostname':'private','User':'1000:1000','Env':['TEST=1'],'Labels':{'owner':'bound'},'Cmd':None},
                 'HostConfig':{'NetworkMode':'private-network','RestartPolicy':{'Name':'unless-stopped'},'CapDrop':['ALL'],'SecurityOpt':['no-new-privileges:true'],'Memory':2000000},
                 'NetworkSettings':{'Networks':{'private-network':{}}},'Mounts':[{'Source':str(profile),'Destination':'/data'}]}
            def run(args,**kw):
                nonlocal starts
                calls.append(args)
                if args[:2]==['docker','start']:
                    starts+=1
                    if fail_start and starts==1:raise subprocess.CalledProcessError(1,args)
            def request(name,operation,**fields):
                if operation=='status':return {'manual':False,'writesEnabled':enrolled,'instanceId':'new' if starts else 'old'}
                if operation=='workspace':
                    self.assertTrue(enrolled, 'an unactivated profile has no bound workspace')
                    return {'ready':True,'generating':busy}
                return {}
            argv=['upgrade','--name',name,'--expected','codex-web-gpt-native:before','--image','codex-web-gpt-native:after','--profile',str(profile),'--state',str(root),'--revision','abcdef0']
            with patch.object(sys,'argv',argv),patch.object(upgrade,'inspect',return_value=old),patch.object(upgrade,'output',return_value=''),patch.object(upgrade,'assert_idle'),patch.object(upgrade,'request',side_effect=request),patch.object(upgrade,'run',side_effect=run):
                if busy or fail_start:
                    with self.assertRaises((RuntimeError,subprocess.CalledProcessError)):upgrade.main()
                else:upgrade.main()
            return calls, name

    def test_idle_receipt_does_not_block_but_pending_work_does(self):
        # Run the real admission SQL against SQLite, without Docker or live files.
        import sqlite3
        import re
        captured=[]
        with patch.object(upgrade,'run',side_effect=lambda args,**kw: captured.append(kw['input'])):
            upgrade.assert_idle('12345678-1234-4234-8234-123456789012')
        clauses=re.findall(r"\['([a-z_]+)',\"([^\"]+)\"\]",captured[0])
        self.assertEqual(len(clauses),4)
        db=sqlite3.connect(':memory:')
        for table,columns in [('gpt_jobs','status TEXT'),('gpt_native_operations','state TEXT'),
                              ('gpt_project_operations','state TEXT'),('commands','scope TEXT,state TEXT')]:
            db.execute('CREATE TABLE '+table+'('+columns+')')
        def blocked():return any(db.execute('SELECT count(*) FROM '+t+' WHERE '+w).fetchone()[0] for t,w in clauses)
        for state in ['idle','completed','cancelled','unknown']:
            db.execute('DELETE FROM gpt_jobs');db.execute('INSERT INTO gpt_jobs VALUES(?)',(state,))
            self.assertFalse(blocked())
        for state in ['queued','preparing','running']:
            db.execute('DELETE FROM gpt_jobs');db.execute('INSERT INTO gpt_jobs VALUES(?)',(state,))
            self.assertTrue(blocked())
        db.close()

    def test_active_response_is_never_stopped(self):
        calls,_=self.scenario(busy=True)
        self.assertEqual(calls,[])

    def test_success_preserves_profile_and_isolation(self):
        calls,_=self.scenario()
        create=next(c for c in calls if c[:2]==['docker','create'])
        self.assertIn('private-network',create);self.assertIn('1000:1000',create)
        self.assertIn('no-new-privileges:true',create);self.assertIn('ALL',create)
        self.assertNotIn('--publish',create);self.assertFalse(any(c[:2]==['docker','rm'] for c in calls))

    def test_start_failure_restores_previous_container(self):
        calls,name=self.scenario(fail_start=True)
        self.assertIn(['docker','rename',name+'-before-abcdef0',name],calls)
        self.assertEqual(calls[-1],['docker','start',name])

    def test_prepared_profile_is_updated_without_activation(self):
        calls,_=self.scenario(enrolled=False)
        self.assertTrue(any(c[:2]==['docker','create'] for c in calls))

    def test_stale_stop_requires_exact_successful_end_turn(self):
        graph={'current_node':'final','mapping':{'final':{'message':{'author':{'role':'assistant'},'channel':'final','status':'finished_successfully','end_turn':True}}}}
        def request(name,operation,**fields):
            if operation=='workspace':return {'ready':True,'generating':True}
            self.assertEqual(fields,{'conversationId':'chat'})
            return graph
        with patch.object(upgrade,'request',side_effect=request):
            upgrade.assert_native_idle('container',['chat','final'])
            with self.assertRaises(RuntimeError):upgrade.assert_native_idle('container')
            graph['mapping']['final']['message']['end_turn']=False
            with self.assertRaises(RuntimeError):upgrade.assert_native_idle('container',['chat','final'])
            graph['mapping']['final']['message']['end_turn']=True
            graph['current_node']='new-user'
            with self.assertRaises(RuntimeError):upgrade.assert_native_idle('container',['chat','final'])


if __name__=='__main__':unittest.main()
