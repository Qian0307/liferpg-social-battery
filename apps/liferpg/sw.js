/* Versioned offline shell. IndexedDB datasets are not cached, uploaded, or cleared. */
const CACHE='liferpg-shell-v0.7.0';
const ASSETS=['./','./index.html','./manifest.webmanifest','./icons/icon-192.png','./icons/icon-512.png'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS))));
self.addEventListener('message',event=>{if(event.data?.type==='ACTIVATE_UPDATE')self.skipWaiting();});
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>(k.startsWith('liferpg-shell-')||k.startsWith('sbm-'))&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url);if(request.method!=='GET'||url.origin!==self.location.origin)return;
 if(request.mode==='navigate'){event.respondWith(fetch(request).then(response=>{if(response.ok&&(response.headers.get('content-type')||'').includes('text/html')&&['/','/index.html'].includes(url.pathname)){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(c=>c.put('./index.html',copy)));}return response;}).catch(()=>caches.match('./index.html')));}
 else if(ASSETS.some(path=>new URL(path,self.location).href===url.href)){event.respondWith(caches.match(request).then(cached=>cached||fetch(request)));}
});
