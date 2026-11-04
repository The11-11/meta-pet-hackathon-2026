import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve, sep } from 'node:path';
import { freshOwnerData, ownerStorageKey } from '../src/ownerData.ts';
import { stageDemoProfileHandoff, bindDemoProfileHandoff, loadDemoProfileHandoff, persistDemoProfileHandoff, clearDemoProfileHandoff, DEMO_PROFILE_STORAGE_KEY } from '../src/demoProfileHandoff.ts';
import { createMuseServer } from '../backend/src/server.mjs';
import { createPageMemoryStore } from '../backend/src/memory.mjs';

// All accounts, records, cookies and model responses in this fixture are synthetic.
test('explicit profile import and private memory survive same-owner sign-out and return', async () => {
 const temporary=await mkdtemp(join(tmpdir(),'muse-account-return-'));
 const owner={id:'return-owner',name:'Fixture owner',mode:'facebook'};
 const demo={...freshOwnerData({mode:'demo'},'', 'demo-lucy'),pet:{id:'demo-lucy',name:'Lucy',species:'Dog',breed:'Pug',age:'1 year'},onboarding:{completed:true,goals:['feeding','training']}};
 const values=new Map([[DEMO_PROFILE_STORAGE_KEY,JSON.stringify(demo)]]);
 const storage={async getItem(key){return values.get(key)??null;},async setItem(key,value){values.set(key,value);},async removeItem(key){values.delete(key);}};
 const invitation=await stageDemoProfileHandoff(storage,demo);
 assert.equal(await loadDemoProfileHandoff(storage,owner.id),null,'An ordinary login must not bind a staged invitation');
 await bindDemoProfileHandoff(storage,invitation,owner.id);
 const initial=freshOwnerData(owner,'http://localhost:8787','account-lucy');
 const key=ownerStorageKey(owner);
 const kept=await persistDemoProfileHandoff(storage,key,initial,invitation,owner.id,()=>true);
 await clearDemoProfileHandoff(storage,invitation,owner.id);
 assert.equal(kept.pet.name,'Lucy');assert.equal(kept.pet.id,'account-lucy');assert.equal(JSON.parse(values.get(DEMO_PROFILE_STORAGE_KEY)).pet.id,'demo-lucy');
 let signedIn=true;const payloads=[];
 const authService={webOrigins:['http://localhost:8083'],async getSession(headers){return signedIn&&headers.cookie==='fixture=return'?{session:{id:'fixture-return-session'},user:{id:owner.id}}:null;},async getConfig(){return {available:true};},async close(){}};
 const server=createMuseServer({env:{MODEL_API_KEY:'synthetic-model-key'},authService,memoryStore:createPageMemoryStore({root:join(temporary,'memory')}),fetchImpl:async(_url,options)=>{payloads.push(JSON.parse(options.body));return Response.json({output:[{type:'message',content:[{type:'output_text',text:'Your care context is available.'}]}]});}});
 server.listen(0,'127.0.0.1');await once(server,'listening');
 const base='http://127.0.0.1:'+server.address().port;
 const headers={'Content-Type':'application/json',Cookie:'fixture=return','X-Muse-Owner':owner.id};
 try {
  const chat=await fetch(base+'/api/muse/chat',{method:'POST',headers,body:JSON.stringify({message:'Remember that this fixture’s verification word is moonflower.',pet:kept.pet,careGoals:kept.onboarding.goals,history:[]})});
  assert.equal(chat.status,200);assert.equal((await chat.json()).memory.saved,true);
  signedIn=false;
  assert.equal((await fetch(base+'/api/muse/memory?petId='+kept.pet.id,{headers})).status,401);
  assert.equal(freshOwnerData(null).pet.name,'');
  signedIn=true;
  const restored=JSON.parse(await storage.getItem(key));
  assert.equal(restored.pet.name,'Lucy');assert.equal(restored.pet.id,kept.pet.id);
  const response=await fetch(base+'/api/muse/memory?petId='+restored.pet.id,{headers});assert.equal(response.status,200);
  const memory=await response.json();assert.equal(memory.exists,true);assert.match(memory.markdown,/moonflower/);
  const recall=await fetch(base+'/api/muse/chat',{method:'POST',headers,body:JSON.stringify({message:'What verification word did I ask you to remember?',pet:restored.pet,history:[]})});assert.equal(recall.status,200);
  assert.match(JSON.stringify(payloads.at(-1)),/moonflower/,'Recall is supplied by server memory even without submitted conversation history');
  assert.equal((await fetch(base+'/api/muse/memory?petId='+restored.pet.id,{headers:{...headers,'X-Muse-Owner':'another-owner'}})).status,401);
 }finally{
  server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
  const checked=resolve(temporary);assert.ok(checked.startsWith(resolve(tmpdir())+sep)&&basename(checked).startsWith('muse-account-return-'));await rm(checked,{recursive:true,force:true});
 }
});
