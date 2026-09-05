from pathlib import Path
import json,html,shutil
root=Path(__file__).parent
out=root/'publication';out.mkdir(exist_ok=True)
rows=[]
for key,label in [('baseline','Before: different tenants'),('candidate','After: different tenants'),('same-tenant','After: same tenant control')]:
 data=json.loads((root/(key+'.stdout.log')).read_text());receipt=json.loads((root/(key+'.receipt.json')).read_text())
 assert receipt['exitCode']==0
 expected=(1,False) if key!='candidate' else (0,True)
 assert (data['scanHits'],data['childProfileRemaining'])==expected
 rows.append(f'<tr><td>{label}</td><td>{data["scanHits"]}</td><td>{len(data["repair"]["changes"])}</td><td>{"Preserved" if data["childProfileRemaining"] else "Removed"}</td><td>{receipt["exitCode"]}</td></tr>')
 for suffix in ['.stdout.log','.stderr.log','.receipt.json']:shutil.copy2(root/(key+suffix),out/(key+suffix))
for name in ['doctor-repro.mts','run-receipts.py','render-report.py']:shutil.copy2(root/name,out/name)
body='''<!doctype html><meta charset="utf-8"><title>OpenClaw Doctor tenant ownership evidence</title><style>body{font:18px system-ui;margin:48px;color:#152338;background:#f5f7fa;max-width:1200px}h1{font-size:34px}p{line-height:1.6}table{border-collapse:collapse;background:white;width:100%;margin:32px 0}th,td{text-align:left;padding:18px;border-bottom:1px solid #d3dce8}th{background:#dce7f4}code{font-size:14px;word-break:break-all}.scope{background:#fff3d8;padding:18px;border-left:5px solid #c08c21}</style><h1>Doctor preserves separate Copilot tenants</h1><p class="scope">Local fake-store test of OpenClaw source. No real credentials or provider calls. This is a browser-rendered evidence report, not a Solari runtime screenshot.</p><p>Expired child credential: <code>acme.ghe.com</code>. Fresher main credential: <code>other.ghe.com</code>.<br>Control main credential: <code>https://acme.ghe.com/</code>.</p><table><tr><th>Scenario</th><th>Scan hits</th><th>Repair changes</th><th>Child profile</th><th>Exit</th></tr>'''+''.join(rows)+'''</table><p>Baseline <code>eec37f21426a26fae17ade5250e98274bfc23249</code><br>Candidate <code>d6fc4e905840e6c08bbe838c4c8f86134a139891</code></p><p>Each run uses a fresh temporary HOME and state directory before importing OpenClaw modules.<br>Table values come from captured stdout. Exact source, command arguments, exit codes, and stderr accompany this report.</p>'''
(out/'index.html').write_text(body)
print(out)
