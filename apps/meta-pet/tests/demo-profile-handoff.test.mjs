import test from 'node:test';
import assert from 'node:assert/strict';
import { stageDemoProfileHandoff, bindDemoProfileHandoff, loadDemoProfileHandoff, clearDemoProfileHandoff, applyDemoProfileHandoff, persistDemoProfileHandoff, DEMO_HANDOFF_KEY, DEMO_PROFILE_STORAGE_KEY, DEMO_HANDOFF_TTL } from '../src/demoProfileHandoff.ts';
const now=1_800_000_000_000;
const demo=()=>({pet:{id:'demo-lucy',name:'Lucy',species:'Dog',breed:'Pug',age:'1 year',careNeeds:'Gentle training',avatar:{uri:'data:image/png;base64,AAAA',createdAt:'2026-11-02T00:00:00Z',style:'muse-plush'}},logs:[{id:'private-log'}],appointments:[{id:'private-appointment'}],rewards:[{id:'private-reward'}],muse:{messages:[{content:'private-chat'}]},social:{profiles:[{id:'private-social'}]},backendUrl:'https://untrusted-demo.invalid',onboarding:{completed:true,goals:['training','walk']}});
const target=()=>({pet:{id:'account-pet',name:'',species:'Dog',breed:'',age:''},logs:[],appointments:[],rewards:[],backendUrl:'http://localhost:8787',onboarding:{completed:false,goals:['feeding','walk']}});
function storage(source=demo()) {const values=new Map([[DEMO_PROFILE_STORAGE_KEY,JSON.stringify(source)]]);return {values,async getItem(key){return values.get(key)??null;},async setItem(key,value){values.set(key,value);},async removeItem(key){values.delete(key);}};}
async function staged(saved,owner='owner-a'){const id=await stageDemoProfileHandoff(saved,demo(),now);return await bindDemoProfileHandoff(saved,id,owner,now+1);}

test('OAuth invitation stores only a reference and waits for explicit acceptance',async()=>{
 const saved=storage(),original=saved.values.get(DEMO_PROFILE_STORAGE_KEY),handoff=await staged(saved);
 const pending=saved.values.get(DEMO_HANDOFF_KEY);for(const privateText of ['private-chat','private-log','private-social','untrusted-demo','AAAA','Gentle training','Lucy'])assert.equal(pending.includes(privateText),false);
 assert.equal(handoff.profile.name,'Lucy');assert.equal(handoff.ownerId,'owner-a');assert.equal(handoff.expiresAt,now+DEMO_HANDOFF_TTL);assert.equal(saved.values.get(DEMO_PROFILE_STORAGE_KEY),original);
 const account=target(),before=structuredClone(account),result=applyDemoProfileHandoff(account,handoff,'owner-a',now+2);assert.deepEqual(account,before);assert.equal(result.pet.id,'account-pet');assert.equal(result.pet.name,'Lucy');assert.deepEqual(result.pet.avatar,demo().pet.avatar);assert.equal(result.pet.careNeeds,'Gentle training');assert.equal(result.backendUrl,'http://localhost:8787');assert.deepEqual(result.logs,[]);assert.deepEqual(result.appointments,[]);assert.deepEqual(result.rewards,[]);assert.equal(result.muse,undefined);assert.equal(result.social,undefined);assert.deepEqual(result.onboarding,{completed:true,goals:['training','walk']});
});
test('an arbitrary login or different OAuth flow cannot claim a pending invitation',async()=>{
 const saved=storage(),id=await stageDemoProfileHandoff(saved,demo(),now),raw=saved.values.get(DEMO_HANDOFF_KEY);
 assert.equal(await loadDemoProfileHandoff(saved,'unrelated-owner',now+1),null);assert.equal(await bindDemoProfileHandoff(saved,'unrelated-flow','unrelated-owner',now+1),null);assert.equal(saved.values.get(DEMO_HANDOFF_KEY),raw);
 const handoff=await bindDemoProfileHandoff(saved,id,'owner-a',now+2);assert.equal(handoff.ownerId,'owner-a');assert.equal(await bindDemoProfileHandoff(saved,id,'owner-b',now+3),null);assert.equal((await bindDemoProfileHandoff(saved,id,'owner-a',now+4)).id,id);
});
test('initiating verified owner binding survives reload and rejects another account',async()=>{
 const saved=storage(),first=await staged(saved);assert.ok(first);assert.equal(await loadDemoProfileHandoff(saved,'owner-b',now+2),null);const again=await loadDemoProfileHandoff(saved,'owner-a',now+3);assert.deepEqual(again,first);assert.throws(()=>applyDemoProfileHandoff(target(),first,'owner-b',now+4));assert.equal(await clearDemoProfileHandoff(saved,first.id,'owner-b'),false);assert.equal(await clearDemoProfileHandoff(saved,first.id,'owner-a'),true);assert.equal(await loadDemoProfileHandoff(saved,'owner-a',now+5),null);
});
test('source edits and expired invitations cannot import an unseen or stale profile',async()=>{
 const saved=storage(),id=await stageDemoProfileHandoff(saved,demo(),now);const edited=demo();edited.pet.name='Different pet';saved.values.set(DEMO_PROFILE_STORAGE_KEY,JSON.stringify(edited));assert.equal(await bindDemoProfileHandoff(saved,id,'owner-a',now+1),null);assert.equal(saved.values.has(DEMO_HANDOFF_KEY),false);
 saved.values.set(DEMO_PROFILE_STORAGE_KEY,JSON.stringify(demo()));await stageDemoProfileHandoff(saved,demo(),now);assert.equal(await loadDemoProfileHandoff(saved,'owner-a',now+DEMO_HANDOFF_TTL),null);
 const handoff=await staged(saved);assert.throws(()=>applyDemoProfileHandoff(target(),handoff,'owner-a',now+DEMO_HANDOFF_TTL));
});
test('completed, named or nonempty account data is never overwritten',async()=>{
 const saved=storage(),handoff=await staged(saved);
 for(const change of [{pet:{...target().pet,name:'Kai'}},{onboarding:{completed:true,goals:['walk']}},{logs:[{id:'existing'}]},{appointments:[{id:'existing'}]},{rewards:[{id:'existing'}]},{muse:{messages:[]}},{social:{profiles:[],posts:[{id:'existing'}]}}]){const account={...target(),...change},before=structuredClone(account);assert.throws(()=>applyDemoProfileHandoff(account,handoff,'owner-a',now+2));assert.deepEqual(account,before);}
});
test('malformed and oversized profile fields cannot enter the account import',async()=>{
 for(const mutate of [source=>source.pet.name='x'.repeat(51),source=>source.pet.careNeeds='x'.repeat(501),source=>source.pet.species='Unknown',source=>source.pet.avatar.uri='https://tracking.invalid/avatar',source=>source.onboarding.goals=['PRIVATE_GOAL'],source=>source.pet.id='../'+String.fromCharCode(10)]){const source=demo();mutate(source);await assert.rejects(stageDemoProfileHandoff(storage(source),source,now));}
 const saved=storage();await assert.rejects(stageDemoProfileHandoff(saved,{...demo(),pet:{...demo().pet,name:'Unsaved edit'}},now));saved.values.set(DEMO_HANDOFF_KEY,'{"id":"invalid"}');assert.equal(await loadDemoProfileHandoff(saved,'owner-a',now),null);
});
test('late dismissals and concurrent initiating callbacks cannot consume a replacement invitation',async()=>{
 const saved=storage(),old=await staged(saved),replacementId=await stageDemoProfileHandoff(saved,demo(),now+2);assert.equal(await clearDemoProfileHandoff(saved,old.id,'owner-a'),false);assert.equal(await bindDemoProfileHandoff(saved,old.id,'owner-a',now+3),null);
 const [first,second]=await Promise.all([bindDemoProfileHandoff(saved,replacementId,'owner-b',now+3),bindDemoProfileHandoff(saved,replacementId,'owner-c',now+3)]);assert.equal(first.ownerId,'owner-b');assert.equal(second,null);assert.ok(saved.values.has(DEMO_HANDOFF_KEY));
});
test('a failed storage write never reports a staged or bound handoff',async()=>{
 const saved=storage();saved.setItem=async()=>{throw new Error('Disk full');};await assert.rejects(stageDemoProfileHandoff(saved,demo(),now),/Disk full/);assert.equal(saved.values.has(DEMO_HANDOFF_KEY),false);
 const bound=storage(),id=await stageDemoProfileHandoff(bound,demo(),now);bound.setItem=async()=>{throw new Error('Bind failed');};await assert.rejects(bindDemoProfileHandoff(bound,id,'owner-a',now+1),/Bind failed/);assert.equal(JSON.parse(bound.values.get(DEMO_HANDOFF_KEY)).ownerId,null);
});
test('owner-entered multiline care preferences remain bounded and preserved',async()=>{
 const source=demo();source.pet.careNeeds='Gentle praise\nShort walks';const saved=storage(source),id=await stageDemoProfileHandoff(saved,source,now),handoff=await bindDemoProfileHandoff(saved,id,'owner-a',now+1);assert.equal(applyDemoProfileHandoff(target(),handoff,'owner-a',now+2).pet.careNeeds,source.pet.careNeeds);
});

const accountKey='muse.pet.owner.v2.facebook.owner-a';
test('persist transaction saves before return and preserves latest empty-account settings',async()=>{
 const saved=storage(),handoff=await staged(saved),current=target(),latest={...target(),backendUrl:'http://localhost:8787/updated',notifications:{enabled:true,sound:'meow'}};saved.values.set(accountKey,JSON.stringify(latest));
 const before=structuredClone(current),result=await persistDemoProfileHandoff(saved,accountKey,current,handoff.id,'owner-a',()=>true,now+2);
 assert.deepEqual(current,before);assert.equal(result.pet.id,current.pet.id);assert.equal(result.pet.name,'Lucy');assert.equal(result.backendUrl,latest.backendUrl);assert.deepEqual(result.notifications,latest.notifications);assert.deepEqual(JSON.parse(saved.values.get(accountKey)),result);assert.ok(saved.values.has(DEMO_HANDOFF_KEY));
});
test('persist transaction refuses a source edited while target storage was being read',async()=>{
 const saved=storage(),handoff=await staged(saved),get=saved.getItem;saved.values.set(accountKey,JSON.stringify(target()));saved.getItem=async key=>{if(key===accountKey){const edited=demo();edited.pet.name='Unreviewed pet';saved.values.set(DEMO_PROFILE_STORAGE_KEY,JSON.stringify(edited));}return get(key);};
 await assert.rejects(persistDemoProfileHandoff(saved,accountKey,target(),handoff.id,'owner-a',()=>true,now+2),/changed or expired/);assert.equal(JSON.parse(saved.values.get(accountKey)).pet.name,'');
});
test('failed target write leaves the input unchanged and the explicit import retryable',async()=>{
 const saved=storage(),handoff=await staged(saved),current=target(),before=structuredClone(current),set=saved.setItem;let fail=true;saved.setItem=async(key,value)=>{if(key===accountKey&&fail)throw new Error('Account disk full');return set(key,value);};
 await assert.rejects(persistDemoProfileHandoff(saved,accountKey,current,handoff.id,'owner-a',()=>true,now+2),/Account disk full/);assert.deepEqual(current,before);assert.equal(saved.values.has(accountKey),false);assert.equal((await loadDemoProfileHandoff(saved,'owner-a',now+3)).id,handoff.id);
 fail=false;const result=await persistDemoProfileHandoff(saved,accountKey,current,handoff.id,'owner-a',()=>true,now+4);assert.equal(result.pet.id,current.pet.id);assert.equal(result.pet.name,'Lucy');
});
test('persist transaction rejects wrong owner scope, existing target, changed pet id and malformed target',async()=>{
 const saved=storage(),handoff=await staged(saved);await assert.rejects(persistDemoProfileHandoff(saved,'muse.pet.owner.v2.facebook.owner-b',target(),handoff.id,'owner-a',()=>true,now+2),/account changed/i);assert.equal(saved.values.has('muse.pet.owner.v2.facebook.owner-b'),false);
 for(const candidate of [{...target(),pet:{...target().pet,name:'Kai'}},{...target(),pet:{...target().pet,id:'different-pet'}},{...target(),backendUrl:42},{...target(),muse:null}]){const raw=JSON.stringify(candidate);saved.values.set(accountKey,raw);await assert.rejects(persistDemoProfileHandoff(saved,accountKey,target(),handoff.id,'owner-a',()=>true,now+2));assert.equal(saved.values.get(accountKey),raw);}
});
test('persist transaction rejects replaced invitations and checks scope before and after writes',async()=>{
 const saved=storage(),handoff=await staged(saved);await stageDemoProfileHandoff(saved,demo(),now+2);await assert.rejects(persistDemoProfileHandoff(saved,accountKey,target(),handoff.id,'owner-a',()=>true,now+3),/changed or expired/);
 const fresh=await staged(saved);await assert.rejects(persistDemoProfileHandoff(saved,accountKey,target(),fresh.id,'owner-a',()=>false,now+4),/account changed/i);assert.equal(saved.values.has(accountKey),false);
 const set=saved.setItem;let current=true;saved.setItem=async(key,value)=>{await set(key,value);if(key===accountKey)current=false;};await assert.rejects(persistDemoProfileHandoff(saved,accountKey,target(),fresh.id,'owner-a',()=>current,now+5),/changed after saving/);assert.equal(JSON.parse(saved.values.get(accountKey)).pet.name,'Lucy');
});
