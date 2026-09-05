const C='ying-play-v1';
self.addEventListener('install',e=>e.waitUntil(caches.open(C).then(c=>c.addAll(['/','/admin.html','/manifest.json','/icon.svg']))));
self.addEventListener('fetch',e=>{
 if(e.request.method!=='GET'||new URL(e.request.url).pathname.startsWith('/api/')) return;
 e.respondWith(caches.match(e.request).then(x=>x||fetch(e.request).then(r=>{const cp=r.clone();caches.open(C).then(c=>c.put(e.request,cp));return r}).catch(()=>caches.match('/'))));
});
