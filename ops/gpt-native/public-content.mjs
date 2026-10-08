// The pinned native client's public summary presentation, shared by history and
// stream updates. Thought content/tool arguments are not public summary fields.
// Self-contained because renderer.mjs serializes this function into the client.
export function nativePublicContent(m) {
 const meta=m?.metadata??{},c=m?.content;
 if(meta.is_visually_hidden_from_conversation===true||meta.is_visually_hidden_reasoning_group===true||
    meta.summary_type==='raw_cot'||meta.reasoning_recap_type==='hide_all'||meta.tool_invoking_message===true||
    (m?.recipient!=null&&m.recipient!=='all'))return null;
 if(m?.author?.role==='assistant'&&['thoughts','reasoning_recap'].includes(c?.content_type)){
  const text=c.content_type==='thoughts'?(Array.isArray(c.thoughts)?c.thoughts.at(-1)?.summary:null):c.content;
  return typeof text==='string'&&text.trim()?{channel:'commentary',content:{content_type:'text',parts:[text]}}:null;
 }
 if((m?.channel!=null&&!['final','commentary'].includes(m.channel))||
    ['thoughts','reasoning','reasoning_recap','tool_call','computer_output','error','system_error'].includes(c?.content_type))return null;
 return {channel:m?.channel??'final',content:c};
}
