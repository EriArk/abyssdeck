// The sandbox can request only opaque manifest keys. The authenticated parent
// supplies Blob bytes; demo code never receives a Hub URL, cookie or source path.
export const previewImages = `<script>(()=>{
const kind='abyssdeck-preview-image', urls=new Map(), pending=new Map();
function load(key){
  if(urls.has(key))return Promise.resolve(urls.get(key));
  if(pending.has(key))return pending.get(key).promise;
  let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});
  pending.set(key,{promise,resolve,reject});parent.postMessage({kind,key},'*');return promise;
}
addEventListener('message',e=>{
  if(e.source!==parent||e.data?.kind!==kind)return;
  const p=pending.get(e.data.key);if(!p)return;pending.delete(e.data.key);
  if(e.data.blob instanceof Blob){const url=URL.createObjectURL(e.data.blob);urls.set(e.data.key,url);p.resolve(url)}
  else p.reject(new Error(e.data.error||'Image unavailable'));
});
function show(img){
  img.setAttribute('aria-busy','true');
  load(img.dataset.abyssImage).then(url=>{img.src=url;img.removeAttribute('aria-busy')}).catch(error=>{
    img.removeAttribute('aria-busy');const retry=document.createElement('button');
    retry.type='button';retry.textContent=error.message+' · Retry';
    retry.onclick=()=>{retry.remove();show(img)};img.after(retry);
  });
}
function start(){
  const images=document.querySelectorAll('img[data-abyss-image]');
  if('IntersectionObserver'in window){const observer=new IntersectionObserver(entries=>{
    for(const e of entries)if(e.isIntersecting){observer.unobserve(e.target);show(e.target)}
  },{rootMargin:'500px'});images.forEach(img=>observer.observe(img))}else images.forEach(show);
  document.addEventListener('click',e=>{
    const link=e.target.closest?.('a[data-abyss-image]');if(!link)return;e.preventDefault();
    const dialog=document.createElement('dialog');dialog.style.cssText='width:95vw;max-width:none;max-height:95vh;padding:12px;box-sizing:border-box';
    const close=document.createElement('button');close.textContent='×';close.setAttribute('aria-label','Close image');close.style.cssText='position:sticky;top:0;float:right;font-size:28px';close.onclick=()=>dialog.close();
    const img=document.createElement('img');img.dataset.abyssImage=link.dataset.abyssImage;img.style.cssText='display:block;max-width:100%;height:auto';
    dialog.append(close,img);document.body.append(dialog);dialog.onclose=()=>dialog.remove();dialog.showModal();show(img);
  });
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
addEventListener('pagehide',()=>{for(const url of urls.values())URL.revokeObjectURL(url)});
})();</script>`;
