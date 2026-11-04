import test from 'node:test';
import assert from 'node:assert/strict';
import { FacebookPhotosError, importFacebookTaggedPhoto, loadFacebookTaggedPhotos } from '../../src/facebookPhotos.ts';
const base=(process.env.EXPO_PUBLIC_AUTH_URL?.trim()||'http://localhost:8787').replace(/\/+$/,'');
const transport={credentials:'include',headers:{'X-Muse-Owner':'synthetic-owner'}};
const item={id:'123',caption:'Synthetic moment',thumbnailUrl:'https://scontent.example.fbcdn.net/test.jpg',width:320,height:240};

test('tagged-photo requests require both the configured server and a verified owner transport before fetching',async context=>{
  context.mock.method(globalThis,'fetch',()=>{throw new Error('No fetch allowed');});
  await assert.rejects(loadFacebookTaggedPhotos('https://unrelated.example',transport),error=>error.code==='photos_wrong_server');
  await assert.rejects(loadFacebookTaggedPhotos(base,{}),error=>error.code==='photos_sign_in_required');
});
test('photo browsing sends only the cursor and returns bounded projected photo fields',async context=>{
  let called;
  context.mock.method(globalThis,'fetch',async(url,options)=>{called={url,options};return Response.json({photos:[{...item,privateExtra:'discard'}],nextCursor:'NEXT'});});
  const result=await loadFacebookTaggedPhotos(base,transport,'CURSOR');
  assert.equal(called.url,base+'/api/facebook/tagged-photos');
  assert.deepEqual(JSON.parse(called.options.body),{after:'CURSOR'});
  assert.equal(called.options.credentials,'include');
  assert.deepEqual(result,{photos:[item],nextCursor:'NEXT'});
  assert.doesNotMatch(called.options.body,/token|secret|pet|care|history/);
});
test('flat permission errors preserve the typed reconnect signal without exposing raw provider data',async context=>{
  context.mock.method(globalThis,'fetch',async()=>Response.json({error:'Allow Facebook photo access, then browse again.',errorCode:'photos_permission_required'},{status:403}));
  await assert.rejects(loadFacebookTaggedPhotos(base,transport),error=>error instanceof FacebookPhotosError&&error.code==='photos_permission_required'&&error.status===403&&/Allow Facebook/.test(error.message));
});
test('remote/private thumbnail URLs, raw OAuth URLs and oversized lists are rejected',async context=>{
  for(const thumbnailUrl of ['http://scontent.example.fbcdn.net/test.jpg','https://127.0.0.1/private','https://graph.facebook.com/123/picture?access_token=secret','https://scontent.example.fbcdn.net/test.jpg?access_token=secret']){
    context.mock.method(globalThis,'fetch',async()=>Response.json({photos:[{...item,thumbnailUrl}]}));
    await assert.rejects(loadFacebookTaggedPhotos(base,transport),error=>error.code==='photos_invalid_response');
  }
  context.mock.method(globalThis,'fetch',async()=>Response.json({photos:Array(21).fill(item)}));
  await assert.rejects(loadFacebookTaggedPhotos(base,transport),error=>error.code==='photos_invalid_response');
});
test('selected-photo import transmits an ID only and accepts only bounded local image data',async context=>{
  let body;
  context.mock.method(globalThis,'fetch',async(_url,options)=>{body=JSON.parse(options.body);return Response.json({dataUrl:'data:image/jpeg;base64,/9j/2Q==',width:2,height:2});});
  const result=await importFacebookTaggedPhoto(base,transport,'123');
  assert.deepEqual(body,{photoId:'123'});
  assert.match(result.dataUrl,/^data:image\/jpeg/);
  await assert.rejects(importFacebookTaggedPhoto(base,transport,'../private'),error=>error.code==='photos_invalid_request');
  context.mock.method(globalThis,'fetch',async()=>Response.json({dataUrl:'https://scontent.example.fbcdn.net/private.jpg',width:2,height:2}));
  await assert.rejects(importFacebookTaggedPhoto(base,transport,'123'),error=>error.code==='photos_invalid_response');
});
test('an already-cancelled photo operation makes no request',async context=>{
  context.mock.method(globalThis,'fetch',()=>{throw new Error('No fetch allowed');});
  const controller=new AbortController();controller.abort();
  await assert.rejects(loadFacebookTaggedPhotos(base,transport,undefined,controller.signal),/cancelled/);
});
