/** Public component results only. Self-contained for the isolated native renderer. */
export function nativeRichContent(metadata) {
  const record=x=>x&&typeof x==='object'&&!Array.isArray(x)?x:{};
  const string=x=>typeof x==='string'?x:undefined;
  const url=x=>{try{if(typeof x!=='string'||/[\u0000-\u0020\u007f]/.test(x))return;const u=new URL(x);return ['https:','http:'].includes(u.protocol)&&!u.username&&!u.password?u.href:undefined;}catch{return;}};
  const result=[];
  // The compiled public view can carry resolution IDs absent from the original
  // Markdown. Read literal component bindings, never execute the view program.
  const bindings=new Map();
  const code=string(metadata?.model_dil_v2?.code)??'';
  const tokens=[];
  const scanner=/\s+|\/\/[^\n]*|\/\*[\s\S]*?\*\/|`(?:\\.|[^`\\])*`|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[A-Za-z_$][\w$]*|-?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?|[^\s]/g;
  for(const m of code.matchAll(scanner))if(!/^\s|^\/\//.test(m[0])&&!m[0].startsWith('/*'))tokens.push(m[0]);
  const literal=(cursor,depth=0)=>{
    if(depth>32)throw Error('depth');
    const t=tokens[cursor.i++];
    if(t?.startsWith('"'))return JSON.parse(t);
    if(t==='__dilConstants'){
      if(tokens[cursor.i++]!=='[')throw Error('constant');
      const key=literal(cursor,depth+1),constants=record(metadata?.model_dil_v2?.constants);
      if(tokens[cursor.i++]!==']'||typeof key!=='string'||!Object.hasOwn(constants,key))throw Error('constant');
      return constants[key];
    }
    // Native compilation uses JSON literals. Single quotes and expressions are
    // deliberately not interpreted as data without a verified contract.
    if(t==='null')return null;if(t==='true')return true;if(t==='false')return false;
    if(/^-?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(t??''))return Number(t);
    if(t==='['){const a=[];while(tokens[cursor.i]!==']'){a.push(literal(cursor,depth+1));if(tokens[cursor.i]!==',')break;cursor.i++;}if(tokens[cursor.i++]!==']')throw Error('array');return a;}
    if(t==='{'){const o=Object.create(null);while(tokens[cursor.i]!=='}'){
      const raw=tokens[cursor.i++],key=raw?.startsWith('"')?JSON.parse(raw):raw;
      if(typeof key!=='string'||(!raw.startsWith('"')&&!/^[A-Za-z_$][\w$]*$/.test(raw))||Object.hasOwn(o,key)||tokens[cursor.i++]!==':')throw Error('key');
      o[key]=literal(cursor,depth+1);if(tokens[cursor.i]!==',')break;cursor.i++;
    }if(tokens[cursor.i++]!=='}')throw Error('object');return o;}
    throw Error('expression');
  };
  const normalize=v=>Array.isArray(v)?v.map(normalize):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,normalize(v[k])])):v;
  for(let i=0;i<tokens.length;i++){
    if(tokens[i]!=='__dil'||tokens[i+1]!=='.'||!['jsx','jsxs'].includes(tokens[i+2])||tokens[i+3]!=='('||tokens[i+5]!==',')continue;
    const component=tokens[i+4];if(!['Cite','AsyncImage','Entity','Link'].includes(component))continue;
    try{
      const cursor={i:i+6},props=literal(cursor),id=string(props?.__resolutionId);
      if(!id||!props||Array.isArray(props)||![')',','].includes(tokens[cursor.i]))continue;
      const clean=Object.fromEntries(Object.entries(props).filter(([k])=>!['__resolutionId','__state','children','fallback'].includes(k)));
      if(!Object.keys(clean).length)continue;
      const key=JSON.stringify([component,normalize(clean)]),existing=bindings.get(key);
      bindings.set(key,existing&&existing.id!==id?{ambiguous:true}:{id,component});
    }catch{}
  }
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
  for(const [key,binding] of bindings){
    if(binding.ambiguous)continue;
    const original=result.find(r=>r.key===binding.id&&(!r.component||r.component===binding.component));
    if(original&&!result.some(r=>r.key===key))result.push({...original,key,component:binding.component});
  }
  return result;
}
