// Run ONLY in the isolated container, against an installed candidate package.
// Credentials are deliberately invalid fixtures; no live authentication claimed.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';

const [packageRoot, phase, scenarioIndex] = process.argv.slice(2);
assert(packageRoot && phase);
const cases = [
  {name:'different-enterprise',child:'acme.ghe.com',main:'other.ghe.com',remove:false,domain:'acme.ghe.com'},
  {name:'same-enterprise',child:'acme.ghe.com',main:'ACME.ghe.com',remove:true,domain:'acme.ghe.com'},
  {name:'public-enterprise',child:undefined,main:'other.ghe.com',remove:false,domain:'github.com'},
  {name:'same-public',child:undefined,main:'github.com',remove:true,domain:'github.com'},
  {name:'legacy-url-enterprise-fenced',child:'acme.ghe.com',main:'https://ACME.ghe.com/',remove:true,domain:'acme.ghe.com',expectFence:true},
  {name:'legacy-url-public-fenced',child:undefined,main:'https://github.com/',remove:true,domain:'github.com',expectFence:true},
];
const profileId='github-copilot:default';
const token=(owner)=>`INVALID_SYNTHETIC_${owner}_NOT_A_SECRET`;
if(phase==='all') {
  for(const [index,scenario] of cases.entries()) {
    const state=fs.mkdtempSync('/tmp/installed-copilot-');
    const env={...process.env,OPENCLAW_STATE_DIR:state,OPENCLAW_CONFIG_PATH:path.join(state,'openclaw.json'),OPENCLAW_AGENT_DIR:path.join(state,'agents/main/agent'),OPENCLAW_ALLOW_ROOT:'1',HOME:path.join(state,'home')};
    for(const key of ['OPENCLAW_HOME','OPENCLAW_PROFILE','XDG_CONFIG_HOME','XDG_DATA_HOME','XDG_CACHE_HOME','XDG_STATE_HOME'])delete env[key];
    delete env.COPILOT_GITHUB_TOKEN; delete env.COPILOT_GITHUB_DOMAIN;
    const run=(args)=>spawnSync(process.execPath,args,{env,encoding:'utf8',timeout:120000});
    for(const step of ['seed','doctor','verify']) {
      const args=step==='doctor'?[path.join(packageRoot,'openclaw.mjs'),'doctor','--fix','--non-interactive','--no-workspace-suggestions']:[process.argv[1],packageRoot,step,String(index)];
      const result=run(args);
      fs.writeFileSync(path.join(state,`${step}.log`),`${result.stdout??''}\n${result.stderr??''}`);
      console.log(JSON.stringify({scenario:scenario.name,step,status:result.status,signal:result.signal,state}));
      assert.ifError(result.error);
      assert.equal(result.status,0,`${step}: ${(result.stderr??'').slice(-2000)}`);
      if(step==='verify')console.log(result.stdout.trim());
    }
  }
} else {
  const scenario=cases[Number(scenarioIndex)];
  assert(scenario);
  const state=process.env.OPENCLAW_STATE_DIR;
  const childDir=path.join(state,'agents/child/agent');
  const mainDir=path.join(state,'agents/main/agent');
  if(phase==='seed') {
    fs.mkdirSync(childDir,{recursive:true});fs.mkdirSync(mainDir,{recursive:true});fs.mkdirSync(process.env.HOME,{recursive:true});
    fs.writeFileSync(process.env.OPENCLAW_CONFIG_PATH,JSON.stringify({gateway:{mode:'local'},agents:{list:[{id:'main',default:true,workspace:path.join(state,'workspace')},{id:'child',workspace:path.join(state,'workspace-child')}]}}));
    const sdk=await import(pathToFileURL(path.join(packageRoot,'dist/plugin-sdk/agent-runtime.js')));
    const credential=(domain,owner,expires)=>({type:'oauth',provider:'github-copilot',access:token(owner),refresh:token(owner),expires,...(domain===undefined?{}:{enterpriseUrl:domain})});
    for(const [dir,value] of [[childDir,credential(scenario.child,'CHILD',Date.now()-60000)],[undefined,credential(scenario.main,'MAIN',Date.now()+3600000)]]) {
      sdk.saveAuthProfileStore({version:1,profiles:{[profileId]:value}},dir,{filterExternalAuthProfiles:false,syncExternalCli:false});
      assert.deepEqual(sdk.findPersistedAuthProfileCredential({agentDir:dir,profileId}),value,'seed persisted unchanged');
      if(dir){
        const db=new DatabaseSync(path.join(dir,'openclaw-agent.sqlite'),{readOnly:true});
        const row=db.prepare("SELECT store_json FROM auth_profile_store WHERE store_key='primary'").get();db.close();
        assert.deepEqual(JSON.parse(row.store_json).profiles[profileId],value,'child seed persisted unchanged');
      }
    }
  } else if(phase==='verify') {
    const db=new DatabaseSync(path.join(childDir,'openclaw-agent.sqlite'),{readOnly:true});
    const row=db.prepare("SELECT store_json FROM auth_profile_store WHERE store_key='primary'").get();db.close();
    const own=row?JSON.parse(row.store_json).profiles?.[profileId]:undefined;
    assert.equal(own!==undefined,!scenario.remove,'persisted child ownership');
    if(own){assert.equal(own.refresh,token('CHILD'));assert.equal(own.access,token('CHILD'));assert.equal(own.enterpriseUrl,scenario.child);}
    const {resolveFirstGithubToken}=await import(pathToFileURL(path.join(packageRoot,'dist/extensions/github-copilot/auth.js')));
    const selected=await resolveFirstGithubToken({agentDir:childDir,config:{},env:{},profileId});
    if(scenario.expectFence){
      assert.match(selected.githubToken,/^openclaw-oauth-refresh-fence:v1:.*:failed:refresh:/);
      assert.match(fs.readFileSync(path.join(state,'doctor.log'),'utf8'),/unsupported enterprise domain/);
      const sdk=await import(pathToFileURL(path.join(packageRoot,'dist/plugin-sdk/agent-runtime.js')));
      const shared=sdk.findPersistedAuthProfileCredential({profileId});
      assert.match(shared.refresh,/^openclaw-oauth-refresh-fence:v1:.*:failed:refresh:/);
      assert(shared.expires<Date.now(),'failed legacy refresh remains expired');
    }else assert.equal(selected.githubToken,token(scenario.remove?'MAIN':'CHILD'));
    assert.equal(selected.githubDomain,scenario.domain);
    console.log(JSON.stringify({scenario:scenario.name,childPreserved:own!==undefined,selectedOwner:scenario.expectFence?'main-fenced':scenario.remove?'main':'child',domain:selected.githubDomain,proof:'installed Doctor + SQLite + installed provider selector; synthetic credentials, offline; fenced cases are negative compatibility controls'}));
  } else throw new Error('invalid phase');
}
