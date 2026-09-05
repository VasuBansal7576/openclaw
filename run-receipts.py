import os, subprocess, pathlib, json, hashlib, datetime
out=pathlib.Path(__file__).parent
cases=[('baseline','/private/tmp/openclaw-oauth-baseline-receipts-20260905','other.ghe.com'),('candidate','/private/tmp/openclaw-oauth-eec-isolated-20260905','other.ghe.com'),('same-tenant','/private/tmp/openclaw-oauth-eec-isolated-20260905','https://acme.ghe.com/')]
for label, source, domain in cases:
    revision=subprocess.check_output(['git','-C',source,'rev-parse','HEAD'],text=True).strip()
    env=os.environ.copy()
    env.update(OPENCLAW_SOURCE=source,OPENCLAW_GIT_REVISION=revision,OPENCLAW_MAIN_DOMAIN=domain)
    cmd=['/Users/vasu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node','--import',source+'/node_modules/tsx/dist/loader.mjs',str(out/'doctor-repro.mts')]
    result=subprocess.run(cmd,cwd=source,env=env,capture_output=True,text=True)
    (out/(label+'.stdout.log')).write_text(result.stdout)
    (out/(label+'.stderr.log')).write_text(result.stderr)
    receipt=dict(command=cmd,cwd=source,environment={k:env[k] for k in ['OPENCLAW_SOURCE','OPENCLAW_GIT_REVISION','OPENCLAW_MAIN_DOMAIN']},exitCode=result.returncode,capturedAt=datetime.datetime.now(datetime.timezone.utc).isoformat(),scriptSha256=hashlib.sha256((out/'doctor-repro.mts').read_bytes()).hexdigest())
    (out/(label+'.receipt.json')).write_text(json.dumps(receipt,indent=2)+'\n')
    print(label, 'exit',result.returncode,result.stdout,result.stderr)
