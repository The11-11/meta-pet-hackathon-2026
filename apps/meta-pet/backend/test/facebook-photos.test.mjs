import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createFacebookPhotosService, facebookPhotoCdnUrl, inspectFacebookPhoto } from '../src/facebook-photos.mjs';
import { createMuseServer } from '../src/server.mjs';

// Synthetic token, photo IDs, image bytes and Graph responses only.
const access={token:'fixture-photo-token-never-real',scopes:[]};
const cdn='https://scontent.fixture.fbcdn.net/fixture.png?oh=fixture-signature';
function png(width=2,height=3){const bytes=Buffer.alloc(45);Buffer.from([137,80,78,71,13,10,26,10]).copy(bytes);bytes.writeUInt32BE(13,8);bytes.write('IHDR',12);bytes.writeUInt32BE(width,16);bytes.writeUInt32BE(height,20);bytes.write('IEND',37);return bytes;}
const listed=(id='12345')=>({id,name:'Synthetic caption',picture:cdn,width:2,height:3});
function fixture(overrides={}){
  let clock=Date.parse('2026-11-04T12:00:00Z'); const calls=[]; let granted=true;
  const fetchImpl=async(url,options)=>{calls.push({url:String(url),options});
    if(overrides.fetchImpl)return overrides.fetchImpl(String(url),options);
    if(String(url).endsWith('/me/permissions'))return Response.json({data:[{permission:'user_photos',status:granted?'granted':'declined'}]});
    if(String(url).includes('/me/photos?'))return Response.json({data:[listed()],paging:{next:'https://evil.invalid/never-follow?access_token=not-used',cursors:{after:'FIXTURE_CURSOR'}}});
    if(String(url).includes('/12345?fields='))return Response.json({id:'12345',images:[{source:cdn,width:2,height:3}]});
    if(String(url)===cdn)return new Response(png(),{headers:{'content-type':'image/png'}});
    throw new Error('Unexpected fixture request');};
  return {service:createFacebookPhotosService({fetchImpl,now:()=>clock,timeoutMs:overrides.timeoutMs??1000}),calls,setNow:value=>{clock=value;},setGranted:value=>{granted=value;}};
}

test('CDN allowlist rejects arbitrary hosts, credentials, ports, redirects-to-URLs and exposed OAuth fields',()=>{
  assert.equal(facebookPhotoCdnUrl(cdn),cdn);
  for(const url of ['http://scontent.xx.fbcdn.net/a','https://fbcdn.net.evil.invalid/a','https://evil.invalid/a','https://127.0.0.1/a','https://u:p@scontent.xx.fbcdn.net/a','https://scontent.xx.fbcdn.net:8443/a','https://scontent.xx.fbcdn.net/a#fragment','https://scontent.xx.fbcdn.net/a?access_token=secret','https://lookaside.fbsbx.com/a?appsecret_proof=secret'])assert.equal(facebookPhotoCdnUrl(url),null,url);
  assert.equal(facebookPhotoCdnUrl(cdn+'&value='+access.token,access.token),null);
});

test('listing always verifies actual permission and returns bounded projected metadata only',async()=>{
  const {service,calls}=fixture();const result=await service.list('owner-a',access,{});
  assert.deepEqual(result.photos,[{id:'12345',caption:'Synthetic caption',thumbnailUrl:cdn,width:2,height:3}]);assert.equal(result.nextCursor,'FIXTURE_CURSOR');
  assert.equal(calls.length,2);assert.match(calls[0].url,/\/v26\.0\/me\/permissions$/);const query=new URL(calls[1].url);assert.equal(query.searchParams.get('type'),'tagged');assert.equal(query.searchParams.get('limit'),'20');
  assert.equal(calls.every(call=>call.options.redirect==='error'&&call.options.credentials==='omit'),true);assert.equal(calls.every(call=>!call.url.includes(access.token)),true);
  assert.equal(JSON.stringify(result).includes(access.token),false);
});

test('only server-issued cursors are accepted and Graph paging URLs are never followed',async()=>{
  const {service,calls}=fixture();await service.list('owner-a',access,{});await service.list('owner-a',access,{after:'FIXTURE_CURSOR'});
  assert.equal(calls.every(call=>new URL(call.url).hostname==='graph.facebook.com'),true);
  await assert.rejects(service.list('owner-b',access,{after:'FIXTURE_CURSOR'}),error=>error.code==='photos_invalid_request');
  await assert.rejects(service.list('owner-a',access,{after:'https://evil.invalid'}),error=>error.code==='photos_invalid_request');
});

test('thumbnail projection accepts a bounded safe Graph picture object without exposing extra provider fields',async()=>{
  const {service}=fixture({fetchImpl:async url=>url.endsWith('/me/permissions')?Response.json({data:[{permission:'user_photos',status:'granted'}]}):Response.json({data:[{...listed(),picture:{data:{url:cdn,is_silhouette:false}},providerSecret:'not-projected'}]})});
  assert.deepEqual((await service.list('owner-a',access,{})).photos,[{id:'12345',caption:'Synthetic caption',thumbnailUrl:cdn,width:2,height:3}]);
});

test('import is bound to a recent owner-listed ID and never accepts a client URL',async()=>{
  const {service,calls}=fixture();await service.list('owner-a',access,{});
  await assert.rejects(service.import('owner-b',access,{photoId:'12345'}),error=>error.code==='photos_not_listed');
  await assert.rejects(service.import('owner-a',access,{photoId:'99999'}),error=>error.code==='photos_not_listed');
  await assert.rejects(service.import('owner-a',access,{photoId:'12345',url:'https://evil.invalid'}),error=>error.code==='photos_invalid_request');
  const result=await service.import('owner-a',access,{photoId:'12345'});assert.equal(result.dataUrl,'data:image/png;base64,'+png().toString('base64'));assert.deepEqual({width:result.width,height:result.height},{width:2,height:3});
  const download=calls.find(call=>call.url===cdn);assert.equal('Authorization'in download.options.headers,false);assert.equal(download.options.credentials,'omit');assert.equal(download.options.redirect,'error');
});

test('missing token and revoked photo scope deny access; revocation clears old selected IDs',async()=>{
  const {service,setGranted,calls}=fixture();await assert.rejects(service.list('owner-a',null,{}),error=>error.code==='photos_permission_required');assert.equal(calls.length,0);
  await service.list('owner-a',access,{});setGranted(false);
  await assert.rejects(service.import('owner-a',{...access,scopes:['user_photos']},{photoId:'12345'}),error=>error.code==='photos_permission_required');
  setGranted(true);await assert.rejects(service.import('owner-a',access,{photoId:'12345'}),error=>error.code==='photos_not_listed');
});

test('token change and five-minute list expiry require a fresh browse',async()=>{
  const first=fixture();await first.service.list('owner-a',access,{});await assert.rejects(first.service.import('owner-a',{token:'new-fixture-token',scopes:['user_photos']},{photoId:'12345'}),error=>error.code==='photos_not_listed');
  const second=fixture();await second.service.list('owner-a',access,{});second.setNow(Date.parse('2026-11-04T12:05:01Z'));await assert.rejects(second.service.import('owner-a',access,{photoId:'12345'}),error=>error.code==='photos_not_listed');
});

test('a permission revocation detected while a CDN fetch is pending discards that older import',async()=>{
  let granted=true,enter,release;const entered=new Promise(resolve=>{enter=resolve;});const gate=new Promise(resolve=>{release=resolve;});
  const {service}=fixture({fetchImpl:async url=>{if(url.endsWith('/me/permissions'))return Response.json({data:[{permission:'user_photos',status:granted?'granted':'declined'}]});if(url.includes('/me/photos?'))return Response.json({data:[listed()]});if(url.includes('/12345?fields='))return Response.json({id:'12345',images:[{source:cdn,width:2,height:3}]});enter();await gate;return new Response(png(),{headers:{'content-type':'image/png'}});}});
  await service.list('owner-a',access,{});const pending=service.import('owner-a',access,{photoId:'12345'});await entered;granted=false;await assert.rejects(service.list('owner-a',access,{}),error=>error.code==='photos_permission_required');release();await assert.rejects(pending,error=>error.code==='photos_not_listed');
});

test('photo permissions denied by Graph use a bounded reconnect error, never the provider body',async()=>{
  const {service}=fixture({fetchImpl:async()=>Response.json({error:{code:190,message:'FIXTURE_PROVIDER_SECRET'}},{status:401})});
  await assert.rejects(service.list('owner-a',access,{}),error=>error.status===403&&error.code==='photos_permission_required'&&!error.message.includes('FIXTURE_PROVIDER_SECRET'));
});

test('non-CDN images and token-bearing thumbnail URLs cannot enter the gallery or import fetch',async()=>{
  const {service,calls}=fixture({fetchImpl:async url=>url.endsWith('/me/permissions')?Response.json({data:[{permission:'user_photos',status:'granted'}]}):Response.json({data:[{...listed(),picture:'https://scontent.xx.fbcdn.net/a?access_token='+access.token},{...listed('67890'),picture:'https://evil.invalid/a'}]})});
  assert.deepEqual((await service.list('owner-a',access,{})).photos,[]);assert.equal(calls.length,2);
});

test('signature and MIME checks reject SVG, mismatched bytes and oversized dimensions',()=>{
  assert.deepEqual(inspectFacebookPhoto(png(),'image/png'),{width:2,height:3,mime:'image/png'});
  for(const [bytes,mime]of[[Buffer.from('<svg/>'),'image/png'],[png(),'image/jpeg'],[png(20000,20000),'image/png'],[png(),'image/svg+xml']])assert.throws(()=>inspectFacebookPhoto(bytes,mime),error=>error.code==='photos_invalid_image');
});

test('CDN redirect, oversized body and invalid MIME are refused before returning pixels',async()=>{
  for(const response of [()=>new Response('',{status:302,headers:{location:'https://evil.invalid/a'}}),()=>new Response(png(),{headers:{'content-type':'image/png','content-length':String(8*1024*1024+1)}}),()=>new Response(png(),{headers:{'content-type':'text/html'}})]){
    const {service}=fixture({fetchImpl:async url=>{if(url.endsWith('/me/permissions'))return Response.json({data:[{permission:'user_photos',status:'granted'}]});if(url.includes('/me/photos?'))return Response.json({data:[listed()]});if(url.includes('/12345?fields='))return Response.json({id:'12345',images:[{source:cdn,width:2,height:3}]});return response();}});
    await service.list('owner-a',access,{});await assert.rejects(service.import('owner-a',access,{photoId:'12345'}),error=>error.code==='photos_invalid_image');
  }
});

test('streaming byte bound cancels a CDN body without buffering more than eight MiB',async()=>{
  let cancelled=false;let chunk=0;
  const {service}=fixture({fetchImpl:async url=>{if(url.endsWith('/me/permissions'))return Response.json({data:[{permission:'user_photos',status:'granted'}]});if(url.includes('/me/photos?'))return Response.json({data:[listed()]});if(url.includes('/12345?fields='))return Response.json({id:'12345',images:[{source:cdn,width:2,height:3}]});return new Response(new ReadableStream({pull(controller){controller.enqueue(new Uint8Array(chunk++?1:8*1024*1024));},cancel(){cancelled=true;}}),{headers:{'content-type':'image/png'}});}});
  await service.list('owner-a',access,{});await assert.rejects(service.import('owner-a',access,{photoId:'12345'}));assert.equal(cancelled,true);
});

test('hung provider calls have a bounded timeout and no token is reflected',async()=>{
  const {service}=fixture({fetchImpl:()=>new Promise(()=>{}),timeoutMs:20});const started=Date.now();await assert.rejects(service.list('owner-a',access,{}),error=>error.code==='photos_unavailable');assert.ok(Date.now()-started<1000);
});

test('per-owner request limits apply without affecting another signed-in owner',async()=>{
  const {service}=fixture();for(let index=0;index<12;index++)await service.list('owner-a',access,{});await assert.rejects(service.list('owner-a',access,{}),error=>error.status===429);assert.equal((await service.list('owner-b',access,{})).photos.length,1);
});

test('the hundred-owner cache cap evicts prior ID grants',async()=>{
  const {service}=fixture();for(let index=0;index<101;index++)await service.list('owner-'+index,access,{});await assert.rejects(service.import('owner-0',access,{photoId:'12345'}),error=>error.code==='photos_not_listed');
});

test('HTTP photo routes require the exact Facebook cookie owner, reject preview bearer and return no-store flat errors',async()=>{
  const authService={webOrigins:[],async close(){},async getConfig(){return{available:true};},async getSession(headers){return headers.cookie==='fixture=owner-a'?{session:{id:'fixture-session'},user:{id:'owner-a'}}:null;},async getFacebookAccessToken(){return access;}};
  const {service}=fixture();const server=createMuseServer({env:{},authService,facebookPhotosService:service});server.listen(0,'127.0.0.1');await once(server,'listening');const base='http://127.0.0.1:'+server.address().port;
  const post=(path,headers={},body={})=>fetch(base+path,{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify(body)});
  try{
    for(const path of['/api/facebook/tagged-photos','/api/facebook/tagged-photos/import']){const anon=await post(path);assert.equal(anon.status,401);assert.equal((await anon.json()).errorCode,'photos_sign_in_required');assert.equal((await post(path,{authorization:'Bearer fixture-token','x-muse-owner':'owner-a'})).status,401);assert.equal((await post(path,{cookie:'fixture=owner-a','x-muse-owner':'owner-b'})).status,401);}
    const headers={cookie:'fixture=owner-a','x-muse-owner':'owner-a'};const list=await post('/api/facebook/tagged-photos',headers);assert.equal(list.status,200);assert.equal(list.headers.get('cache-control'),'no-store');assert.equal((await list.json()).photos.length,1);
    const image=await post('/api/facebook/tagged-photos/import',headers,{photoId:'12345'});assert.equal(image.status,200);assert.equal((await image.json()).dataUrl,'data:image/png;base64,'+png().toString('base64'));
    assert.equal((await post('/api/facebook/tagged-photos',{...headers,origin:'https://untrusted.invalid'})).status,403);
  }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});

test('HTTP response is discarded if the Facebook session changes during provider work',async()=>{
  let active=true,cleared=false;
  const authService={webOrigins:[],async close(){},async getConfig(){return{available:true};},async getSession(){return active?{session:{id:'fixture-session'},user:{id:'owner-a'}}:null;},async getFacebookAccessToken(){return access;}};
  const facebookPhotosService={async list(){active=false;return{photos:[listed()]};},clear(owner){cleared=owner==='owner-a';}};
  const server=createMuseServer({env:{},authService,facebookPhotosService});server.listen(0,'127.0.0.1');await once(server,'listening');
  try{const response=await fetch('http://127.0.0.1:'+server.address().port+'/api/facebook/tagged-photos',{method:'POST',headers:{'content-type':'application/json','x-muse-owner':'owner-a'},body:'{}'});assert.equal(response.status,401);const body=await response.json();assert.equal(body.errorCode,'photos_sign_in_required');assert.equal('photos'in body,false);assert.equal(cleared,true);}
  finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
