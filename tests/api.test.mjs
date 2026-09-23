import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { onRequest } from '../functions/api/[[path]].js';
import { onRequest as proxy } from '../admin-proxy/functions/api/[[path]].js';
import { onRequest as categoryRoute } from '../functions/category/[slug].js';

function fixture() {
  const sql = new DatabaseSync(':memory:');
  sql.exec(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
  const db = { prepare(query) {
    let args = [];
    return { bind(...values) { args = values; return this; },
      async first() { return sql.prepare(query).get(...args); },
      async all() { return {results:sql.prepare(query).all(...args)}; },
      async run() { const r=sql.prepare(query).run(...args); return {meta:{last_row_id:Number(r.lastInsertRowid)}}; }
    };
  }, async batch(statements) { return Promise.all(statements.map(s=>s.run())); } };
  const files = new Map([['apks/test.apk',new Uint8Array([80,75,3,4,5,6,7,8])],['icons/test.png',new Uint8Array([137,80,78,71])]]);
  let gets=0;
  const bucket = {
    async head(key) { const b=files.get(key); return b ? {size:b.length,httpEtag:'"test"',writeHttpMetadata(h){h.set('content-type',key.endsWith('.apk')?'application/vnd.android.package-archive':'image/png')}} : null; },
    async get(key, options) {gets++;const b=files.get(key);return b?{body:options?.range?b.slice(options.range.offset,options.range.offset+options.range.length):b}:null;},
    async put(key, stream) {files.set(key,new Uint8Array(await new Response(stream).arrayBuffer()));},
    async delete(keys) {for(const key of Array.isArray(keys)?keys:[keys])files.delete(key);}
  };
  sql.exec("INSERT INTO apps(name,slug,version,short_description,description,apk_key,icon_key,status) VALUES('Example','example','1.0','A test app','Description','apks/test.apk','icons/test.png','published')");
  const env={DB:db,APPS_BUCKET:bucket,ADMIN_EMAIL:'admin@example.test',ADMIN_PASSWORD:'test-password',SESSION_SECRET:'test-secret-with-enough-entropy-for-fixtures'};
  async function call(path, options={}) {const pending=[];const response=await onRequest({request:new Request('https://store.example/api/'+path,options),env,waitUntil(p){pending.push(p)}});await Promise.all(pending);return response;}
  async function login(){const r=await call('admin/login',{method:'POST',headers:{'content-type':'application/json',origin:'https://store.example'},body:JSON.stringify({email:env.ADMIN_EMAIL,password:env.ADMIN_PASSWORD})});assert.equal(r.status,200);return r.headers.get('set-cookie').split(';')[0];}
  return {sql,files,call,login,get gets(){return gets;}};
}

test('public API excludes drafts; APK storage URLs cannot bypass publication',async()=>{
 const f=fixture(); f.sql.exec("UPDATE apps SET status='draft'");
 assert.deepEqual((await (await f.call('apps')).json()).apps,[]);
 assert.equal((await f.call('apps/example')).status,404);
 assert.equal((await f.call('download/example')).status,404);
 assert.equal((await f.call('media/apks/test.apk')).status,400);
 assert.equal((await f.call('media/icons/test.png')).status,404);
 const cookie=await f.login();assert.equal((await f.call('media/icons/test.png',{headers:{cookie}})).status,200);
});
test('download streams exact bytes, supports HEAD and ranges without inflating counts',async()=>{
 const f=fixture();let r=await f.call('download/example',{method:'HEAD'});assert.equal(r.status,200);assert.equal(r.headers.get('content-length'),'8');assert.equal(f.gets,0);
 r=await f.call('download/example',{headers:{range:'bytes=2-5'}});assert.equal(r.status,206);assert.equal(r.headers.get('content-range'),'bytes 2-5/8');assert.deepEqual([...new Uint8Array(await r.arrayBuffer())],[3,4,5,6]);
 assert.equal((await f.call('download/example',{headers:{range:'bytes=99-'}})).status,416);
 r=await f.call('download/example');assert.equal((await r.arrayBuffer()).byteLength,8);assert.match(r.headers.get('content-disposition'),/attachment/);
 assert.equal(f.sql.prepare('SELECT downloads_count n FROM apps').get().n,1);
});
test('authentication, tampered sessions and cross-origin login/logout are rejected',async()=>{
 const f=fixture();assert.equal((await f.call('admin/apps')).status,401);
 assert.equal((await f.call('admin/login',{method:'POST',headers:{origin:'https://evil.example'}})).status,403);
 assert.equal((await f.call('admin/logout',{method:'POST',headers:{origin:'https://evil.example'}})).status,403);
 const cookie=await f.login();assert.equal((await f.call('admin/apps',{headers:{cookie}})).status,200);
 assert.equal((await f.call('admin/apps',{headers:{cookie:cookie+'x'}})).status,401);
 assert.equal((await proxy({request:new Request('https://admin.example/api/admin/login',{method:'POST',headers:{origin:'https://evil.example'}})})).status,403);
});
test('login and contact abuse are bounded; rate storage contains no raw addresses',async()=>{
 const f=fixture();for(let i=0;i<20;i++)assert.equal((await f.call('admin/login',{method:'POST',body:'{}'})).status,401);
 assert.equal((await f.call('admin/login',{method:'POST',body:'{}'})).status,429);
 for(let i=0;i<5;i++)assert.equal((await f.call('contact',{method:'POST',body:JSON.stringify({name:'Test',email:'a@example.test',message:'Hello'})})).status,201);
 assert.equal((await f.call('contact',{method:'POST',body:'{}'})).status,429);
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM contact_messages').get().n,5);
 assert.equal(f.sql.prepare('SELECT key FROM request_limits LIMIT 1').get().key.length,43);
});
test('APK replacement preserves listing and counter, reads size from storage',async()=>{
 const f=fixture(),cookie=await f.login();f.files.set('apks/replacement.apk',new Uint8Array(16));
 const r=await f.call('admin/apps/1',{method:'PATCH',headers:{cookie},body:JSON.stringify({apk_key:'apks/replacement.apk',version:'2.0'})});assert.equal(r.status,200);
 const app=await (await f.call('apps/example')).json();assert.equal(app.app.version,'2.0');assert.equal(app.app.file_size,16);assert.equal(app.app.id,1);
 assert.equal((await f.call('admin/apps/1',{method:'PATCH',headers:{cookie},body:JSON.stringify({apk_key:'icons/test.png'})})).status,400);
});
test('pagination and SQL parameters preserve expected results',async()=>{
 const f=fixture();assert.equal((await (await f.call('apps?offset=1&limit=1')).json()).apps.length,0);
 assert.equal((await (await f.call("apps?q=%27%20OR%201=1--")).json()).apps.length,0);
 assert.equal((await f.call('apps/%E0%A4%A')).status,400);
});
test('old category links resolve to the filtered library',()=>{
 const r=categoryRoute({params:{slug:'games'},request:new Request('https://store.example/category/games')});
 assert.equal(r.status,302);assert.equal(r.headers.get('location'),'https://store.example/apps.html?category=games');
});
test('database errors produce generic service response',async()=>{
 const r=await onRequest({request:new Request('https://store.example/api/apps'),env:{},waitUntil(){}});
 assert.equal(r.status,503);assert.doesNotMatch(await r.text(),/D1|binding|schema/);
});
