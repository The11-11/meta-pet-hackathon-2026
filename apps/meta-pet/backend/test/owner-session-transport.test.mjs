import test from 'node:test';
import assert from 'node:assert/strict';
import { requestMuse, testMuseConnection } from '../../src/muse.ts';
const data={pet:{id:'test-pet',name:'Demo Dog',species:'Dog',breed:'',age:''},logs:[],appointments:[],rewards:[],backendUrl:'https://muse.example'};

test('bound owner chat and connection checks use the session rather than a preview token', async context=>{
 const requests=[];
 context.mock.method(globalThis,'fetch',async(url,options)=>{requests.push(options);return Response.json(String(url).endsWith('/check')?{verified:true,message:'Verified'}:{mode:'live',reply:'Reply',proposedActions:[]});});
 const transport={credentials:'include',headers:{'X-Muse-Owner':'owner-1',Cookie:'synthetic-owner-cookie'}};
 await requestMuse('Summarize care.',data,[],'preview-token',transport);
 await testMuseConnection(data.backendUrl,'preview-token',transport);
 for(const options of requests){assert.equal(options.headers.Authorization,undefined);assert.equal(options.headers['X-Muse-Owner'],'owner-1');assert.equal(options.headers.Cookie,'synthetic-owner-cookie');assert.equal(options.credentials,'include');}
});

test('standalone preview chat retains token authentication without acquiring an owner identity', async context=>{
 let options;context.mock.method(globalThis,'fetch',async(_url,value)=>{options=value;return Response.json({mode:'live',reply:'Reply',proposedActions:[]});});
 await requestMuse('Summarize care.',data,[],'preview-token');
 assert.equal(options.headers.Authorization,'Bearer preview-token');assert.equal(options.headers['X-Muse-Owner'],undefined);assert.equal(options.credentials,'omit');
});

test('memory save failures keep the care reply and explicitly report unsaved memory', async context=>{
 let saved=false;context.mock.method(globalThis,'fetch',async()=>Response.json({mode:'live',reply:'Your care reply is ready.',proposedActions:[],memory:{enabled:true,saved}}));
 const failed=await requestMuse('Remember that quiet play helps.',data,[],'');
 assert.equal(failed.reply,'Your care reply is ready.');assert.equal(failed.memorySaved,false);
 saved=true;const success=await requestMuse('Recall my preference.',data,[],'');assert.equal(success.memorySaved,true);
 const demo=await requestMuse('What do you remember?',{...data,backendUrl:''},[],'');assert.equal(demo.memorySaved,undefined);
});


test('bound Facebook 401 directs sign-in renewal for chat and provider checks on web and native transports', async context=>{
 context.mock.method(globalThis,'fetch',async()=>Response.json({error:'A valid client token or signed-in session is required.'},{status:401}));
 for(const transport of [
  {credentials:'include',headers:{'X-Muse-Owner':'owner-1'}},
  {credentials:'omit',headers:{'x-muse-owner':'owner-1',Cookie:'synthetic-owner-cookie'}},
 ]){
  for(const action of [()=>requestMuse('Summarize care.',data,[],'unused-preview-token',transport),()=>testMuseConnection(data.backendUrl,'unused-preview-token',transport)]){
   await assert.rejects(action,error=>/Sign in with Facebook again/.test(error.message)&&!/needs its session token/.test(error.message));
  }
 }
});

test('standalone development 401 keeps connection-token guidance for chat and checks', async context=>{
 context.mock.method(globalThis,'fetch',async()=>Response.json({error:'A valid client token or signed-in session is required.'},{status:401}));
 await assert.rejects(()=>requestMuse('Summarize care.',data,[],'expired-preview-token'),error=>/needs its session token/.test(error.message)&&!/Facebook/.test(error.message));
 await assert.rejects(()=>testMuseConnection(data.backendUrl,'expired-preview-token'),error=>/valid client token/.test(error.message)&&!/Facebook/.test(error.message));
});
