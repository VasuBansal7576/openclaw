import fs from 'node:fs/promises';
import { createOpenClawTestState } from '../test-utils/openclaw-test-state.js';
import { resetGlobalHookRunner } from '../plugins/hook-runner-global.js';
import path from 'node:path';
import { it, expect } from 'vitest';
import { initSessionState } from '../auto-reply/reply/session.js';
import { finalizeInboundContext } from '../auto-reply/reply/inbound-context.js';
import { replaceSessionEntry, replaceTranscriptEvents, loadSessionEntry } from '../config/sessions/session-accessor.js';
import { registerInternalHook, clearInternalHooks, setInternalHooksEnabled } from './internal-hooks.js';
import saveSessionMemory, { flushSessionMemoryWritesForTest } from './bundled/session-memory/handler.js';
import { AsyncWorkScope, trackAsyncWork } from '../shared/async-work-scope.js';
import { createDeferredCore } from '../shared/deferred.js';
import { tryBeginGatewayRootWorkAdmission, getActiveGatewayRootWorkCount, getActiveGatewayRootWorkHolders } from '../process/gateway-work-admission.js';
import { runExec } from '../process/exec.js';

it('real idle rollover completes delayed archive command and bundled memory capture', async () => {
  const state = await createOpenClawTestState({prefix:'reset-runtime-',layout:'state-only'});
  const workspace = state.workspaceDir;
  await fs.mkdir(workspace, {recursive:true});
  await fs.mkdir(state.sessionsDir(), {recursive:true});
  const storePath = path.join(state.sessionsDir(), 'sessions.json');
  const sessionKey = 'agent:main:reset-proof';
  const oldId = 'retiring-reset-proof';
  const artifact = path.join(workspace, 'rollover-archive.json');
  const cfg = {agents:{defaults:{workspace}}, hooks:{internal:{enabled:true, entries:{'session-memory':{enabled:true,llmSlug:false}}}},session:{store:storePath,reset:{mode:'idle' as const,idleMinutes:30}}};
  await replaceSessionEntry({storePath,sessionKey}, {sessionId:oldId,updatedAt:Date.now()-86400000});
  await replaceTranscriptEvents({agentId:'main',sessionId:oldId,sessionKey,storePath},[{type:'message',id:'old-message',parentId:null,timestamp:new Date().toISOString(),message:{role:'user',content:'Retiring session proof: archive this text.'}}]);
  const entered = createDeferredCore();
  const release = createDeferredCore();
  const done = createDeferredCore();
  const memoryDone = createDeferredCore();
  let error: string | null = null;
  let reason: unknown;
  let stdout: string | null = null;
  setInternalHooksEnabled(true);
  registerInternalHook('session:auto-reset', async event => {
    reason = event.context.reason;
    entered.resolve();
    try {
      await release.promise;
      const result = await trackAsyncWork(() => runExec(process.execPath, ['-e', 'require("node:fs").writeFileSync(process.argv[1], JSON.stringify({archived:process.argv[2],pid:process.pid})); console.log("archive-written")', artifact, oldId], {timeoutMs:10000}));
      stdout=result.stdout.trim();
    } catch (e) { error=e instanceof Error ? e.message : String(e); throw e; }
    finally { done.resolve(); }
  });
  registerInternalHook('session:auto-reset', saveSessionMemory);
  registerInternalHook('session:auto-reset', async () => { memoryDone.resolve(); });
  const parent = new AsyncWorkScope();
  const root = tryBeginGatewayRootWorkAdmission('test:real-idle-rollover');
  if(!root) throw new Error('missing root');
  try {
    const result = await root.run(async () => parent.run(() => initSessionState({ctx:finalizeInboundContext({Body:'Continue after idle',SessionKey:sessionKey}),cfg,commandAuthorized:true})));
    await entered.promise;
    root.release();
    await parent.drain();
    expect(parent.isClosing).toBe(true);
    const stored = await loadSessionEntry({storePath,sessionKey});
    expect(stored?.sessionId).toBeDefined();
    const rootsBeforeRelease=getActiveGatewayRootWorkCount();
    const holdersBeforeRelease=getActiveGatewayRootWorkHolders();
    release.resolve();
    await done.promise;
    await memoryDone.promise;
    await flushSessionMemoryWritesForTest();
    for(let i=0;i<100 && getActiveGatewayRootWorkCount();i++) await new Promise(r=>setTimeout(r,10));
    const archived = await fs.readFile(artifact,'utf8').catch(()=>null);
    const memoryFiles = await fs.readdir(path.join(workspace,'memory')).catch(()=>[]);
    const memory = await Promise.all(memoryFiles.map(f=>fs.readFile(path.join(workspace,'memory',f),'utf8')));
    console.log('RESET_RUNTIME_RECEIPT', JSON.stringify({variant:process.env.PROOF_VARIANT,reason,retired:oldId,successor:stored?.sessionId,parentClosed:parent.isClosing,rootsBeforeRelease,holdersBeforeRelease,rootsAfter:getActiveGatewayRootWorkCount(),error,stdout,archived:archived ? JSON.parse(archived):null,memoryFiles,memoryHasRetiringText:memory.some(s=>s.includes('Retiring session proof')),source:'real initSessionState idle rollover; test-installed delayed archive hook + bundled session-memory; no module mocks'}));
    expect(reason).toBe('idle');
    expect(holdersBeforeRelease.filter(holder => holder.startsWith("hooks:session-auto-reset"))).toEqual(["hooks:session-auto-reset"]);
    expect(getActiveGatewayRootWorkCount()).toBe(0);
    expect(memory.some(s=>s.includes('Retiring session proof'))).toBe(true);
    expect(error).toBeNull();
    expect(stdout).toBe('archive-written');
    expect(archived).not.toBeNull();
    expect(JSON.parse(archived!).archived).toBe(oldId);
  } finally {
    release.resolve();
    root.release();
    await parent.drain();
    clearInternalHooks();
    resetGlobalHookRunner();
    await state.cleanup();
  }
});
