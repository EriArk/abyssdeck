/** Public component results only. Self-contained for the isolated native renderer. */
export function nativeRichContent(metadata) {
  const record=x=>x&&typeof x==='object'&&!Array.isArray(x)?x:{};
  const string=x=>typeof x==='string'?x:undefined;
  const url=x=>{try{if(typeof x!=='string'||/[\u0000-\u0020\u007f]/.test(x))return;const u=new URL(x);return ['https:','http:'].includes(u.protocol)&&!u.username&&!u.password?u.href:undefined;}catch{return;}};
  const result=[];
  const data=record(record(record(metadata?.model_dil_v2).appData).opGenui);
  const entries={...record(data.componentData),...record(data.componentResults)};
  for(const [key,value] of Object.entries(entries)) {
    let component=string(value?.componentName);
    try{const parsed=JSON.parse(key);if(Array.isArray(parsed)&&parsed.length===2&&typeof parsed[0]==='string')component=parsed[0];}catch{}
    if(component&&!['Cite','AsyncImage','Entity','Link'].includes(component))continue;
    const envelope=Object.hasOwn(record(data.componentResults),key),status=envelope?value?.status:'resolved';
    if(!['pending','resolved','failed'].includes(status))continue;
    const state=record(envelope?value?.state:value);
    const sources=(Array.isArray(state.items)?state.items:[]).flatMap(item=>{
      const href=url(item?.url);return href?[{url:href,title:string(item.title),label:string(item.source_label),snippet:string(item.snippet)}]:[];
    });
    const images=(Array.isArray(state.images)?state.images:[]).flatMap(item=>{
      const src=url(item?.content_url)||url(item?.thumbnail_url);return src?[{src,sourceUrl:url(item.url),alt:string(item.title)}]:[];
    });
    const href=url(state.url);
    result.push({key,...(component?{component}:{}),status,...(sources.length?{sources}:{}),...(images.length?{images}:{}),...(href?{url:href}:{}),...(string(state.frame_max_width)?{maxWidth:state.frame_max_width}:{}),...(string(state.frame_aspect_ratio)?{aspectRatio:state.frame_aspect_ratio}:{})});
  }
  return result;
}
