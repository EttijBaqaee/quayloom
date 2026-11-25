// Native search is opt-in metadata, never inferred from a model name or discovery.
export function searchAdapterFor(provider, model) {
  if (model?.capabilities?.search !== true) return undefined;
  if (provider.type === 'openai' && model.openaiProtocol === 'responses' && model.searchAdapter === 'openai-web-search') return model.searchAdapter;
  if (provider.type === 'anthropic' && model.searchAdapter === 'anthropic-web-search') return model.searchAdapter;
  return undefined;
}
const record = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const index = x => Number.isSafeInteger(x) && x >= 0 && x < 100000;
const identity = x => typeof x === 'string' && x.length > 0 && x.length <= 256;

// Recognition is for stripping only, never replay. Unknown tools remain errors.
export function normalizedSearchHistory(content) {
  const calls=new Map(), results=new Set();
  for (const block of content) {
    if (block?.type==='server_tool_use') {
      const fetched=block.name==='web_fetch' && block.kind==='read_link';
      if ((!fetched && (block.name!=='web_search' || block.kind!=='search')) || block.caller?.type!=='direct' || !identity(block.id) || calls.has(block.id) || !record(block.input)) return false;
      const input=block.input;
      if(fetched) {
        if(input.action!=='read_link' || typeof input.url!=='string') return false;
        calls.set(block.id,block); continue;
      }
      if (input.action==='search') {
        if (!Array.isArray(input.queries) || input.queries.some(x=>typeof x!=='string')) return false;
      } else if (input.action==='open_page') { if (typeof input.url!=='string') return false; }
      else if (input.action==='find_in_page') { if (typeof input.url!=='string' || typeof input.pattern!=='string') return false; }
      else return false;
      calls.set(block.id,block);
    } else if (block?.type==='web_search_tool_result') {
      if (block.kind!=='search' || calls.get(block.tool_use_id)?.name!=='web_search' || results.has(block.tool_use_id) || !Array.isArray(block.content) || block.content.some(x=>!record(x) || !['web_search_result','web_search_tool_result_error'].includes(x.type))) return false;
      results.add(block.tool_use_id);
    } else if (block?.type==='web_fetch_tool_result') {
      const page=block.content;
      if(block.kind!=='read_link' || calls.get(block.tool_use_id)?.name!=='web_fetch' || results.has(block.tool_use_id) || !record(page)) return false;
      if(page.type==='web_fetch_result') {
        if(typeof page.url!=='string' || !record(page.content) || page.content.type!=='document' || page.content.source?.type!=='text' || page.content.source.media_type!=='text/plain' || typeof page.content.source.data!=='string' || page.content.source.data.length>32*1024 || !(page.content.title===null || typeof page.content.title==='string') || page.published_at!==null) return false;
      } else if(page.type!=='web_fetch_tool_result_error' || !['url_not_accessible','url_not_allowed','unavailable'].includes(page.error_code)) return false;
      results.add(block.tool_use_id);
    } else if (['tool_use','tool_result'].includes(block?.type)) return false;
  }
  return calls.size===results.size;
}

/** Only search fields are projected. Never copy opaque SDK objects, signatures,
 * encrypted search payloads, provider metadata or upstream errors to the client. */
export function searchProjection(provider, bad) {
  const secrets = provider.apiKey ? [provider.apiKey, encodeURIComponent(provider.apiKey), Buffer.from(provider.apiKey).toString('base64')] : [];
  const text = (value, nullable = false) => {
    if (nullable && value == null) return null;
    if (typeof value !== 'string' || value.length > 1024 * 1024) bad('Invalid native search text');
    for (const secret of secrets) if (secret) value = value.split(secret).join('[REDACTED]');
    return value;
  };
  const url = value => {
    if (typeof value !== 'string' || value.length > 16384 || /[\x00-\x20\x7f]/.test(value)) bad('Invalid native search source URL');
    let parsed;
    try { parsed = new URL(value); } catch { bad('Invalid native search source URL'); }
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) bad('Unsafe native search source URL');
    let decoded;
    try { decoded = decodeURIComponent(value); } catch { bad('Invalid native search source URL encoding'); }
    if (secrets.some(secret => secret && (value.includes(secret) || decoded.includes(secret)))) bad('Sensitive native search source URL');
    for (const key of parsed.searchParams.keys()) if (/^(?:(?:x[_-])?api[_-]?key|key|(?:access|refresh|id)[_-]?token|token|auth(?:orization)?|passw(?:ord|d)|secret|client[_-]?secret|signature|sig|(?:x[_-])?(?:amz|goog)[_-](?:credential|signature|security[_-]token))$/i.test(key)) bad('Sensitive native search source URL');
    return value;
  };
  const result = value => ({type:'web_search_result',url:url(value.url),title:text(value.title ?? ''),snippet:text(value.snippet ?? ''),site_name:null,site_icon:null,encrypted_content:'',page_age:text(value.page_age, true)});
  const citation = value => {
    if (!record(value) || value.type !== 'web_search_result_location') bad('Unsupported native search citation');
    return {type:'web_search_result_location',url:url(value.url),title:text(value.title,true),cited_text:text(value.cited_text),encrypted_index:''};
  };
  const safeId = id => {
    if (!identity(id) || secrets.some(secret=>secret && id.includes(secret))) bad('Invalid native search tool identity');
    return id;
  };
  const use = (id, input) => ({type:'server_tool_use',id:safeId(id),name:'web_search',kind:'search',caller:{type:'direct'},input});
  const results = (id, content, failed = false) => ({type:'web_search_tool_result',tool_use_id:safeId(id),kind:'search',content:failed ? [{type:'web_search_tool_result_error',error_code:'unavailable'}] : content});
  return {text,url,result,citation,use,results};
}

/** Strict scoped handling of Responses web_search items. The caller retains all
 * response identity, sequence, EOF, status, text and usage validation. */
export function responsesSearch(provider, enabled, bad) {
  const projection = searchProjection(provider,bad), calls = new Map(), emitted = new Set();
  const rank = {in_progress:0,searching:1,completed:2,failed:2};
  const action = value => {
    if (!record(value)) bad('Invalid Responses web search action');
    if (value.type === 'search') {
      if (value.query !== undefined && typeof value.query !== 'string') bad('Invalid Responses search query');
      if (value.queries !== undefined && (!Array.isArray(value.queries) || value.queries.some(x=>typeof x!=='string'))) bad('Invalid Responses search queries');
      const queries = value.queries?.length ? value.queries : (value.query !== undefined ? [value.query] : []);
      if (!queries.length) bad('Responses search action is missing queries');
      if (value.sources !== undefined && !Array.isArray(value.sources)) bad('Invalid Responses search sources');
      const results=[], apiSources=[];
      for (const source of value.sources ?? []) {
        if (!record(source)) bad('Invalid Responses search source');
        if (source.type==='url') results.push(projection.result(source));
        else if (source.type==='api') {
          // Hosted search also returns named feeds (weather/finance/sports), not
          // URLs. Retain their bounded identity for completed-snapshot checks,
          // but never manufacture links or copy opaque provider fields to UI.
          if (!identity(source.name) || !source.name.trim() || /[\x00-\x1f\x7f]/.test(source.name)) bad('Invalid Responses API search source');
          apiSources.push(projection.text(source.name));
        } else bad('Unsupported Responses search source');
      }
      return {input:{action:'search',...(value.query !== undefined ? {query:projection.text(value.query)} : {}),queries:queries.map(x=>projection.text(x))},results,...(apiSources.length ? {apiSources} : {})};
    }
    if (value.type === 'open_page') return {input:{action:'open_page',url:projection.url(value.url)},results:[]};
    if (value.type === 'find') return {input:{action:'find_in_page',url:projection.url(value.url),pattern:projection.text(value.pattern)},results:[]};
    bad('Unsupported Responses web search action');
  };
  const check = (item, outputIndex, final) => {
    if (!enabled) bad('Responses returned search without an enabled native search request');
    if (!identity(item.id) || !index(outputIndex) || !Object.hasOwn(rank,item.status)) bad('Invalid Responses web search item');
    let state = calls.get(outputIndex);
    if (!state) { state={id:item.id,status:item.status,progress:rank[item.status]}; calls.set(outputIndex,state); }
    if (state.id!==item.id || rank[item.status]<state.progress || (rank[state.status]===2 && item.status!==state.status)) bad('Responses search identity or status changed');
    state.status=item.status; state.progress=rank[item.status];
    const current = item.action === undefined ? undefined : action(item.action);
    if (final) {
      if (!['completed','failed'].includes(item.status)) bad('Responses search did not finish');
      if (!current && item.status!=='failed') bad('Responses search is missing its action');
      const snapshot=JSON.stringify({status:item.status,action:current});
      if (state.snapshot!==undefined && state.snapshot!==snapshot) bad('Responses completed search does not match streamed item');
      state.snapshot=snapshot; state.action=current;
    } else if (rank[item.status]===2) bad('Responses added search item must be in progress');
  };
  const progress = event => {
    if (!enabled || !index(event.output_index) || !identity(event.item_id)) bad('Invalid Responses search event');
    const state=calls.get(event.output_index), status=event.type.slice('response.web_search_call.'.length);
    if (!state || state.id!==event.item_id || !Object.hasOwn(rank,status) || rank[status]<state.progress || state.snapshot!==undefined) bad('Invalid Responses search event identity or status');
    // Lifecycle completion does not manufacture a successful tool result: the
    // authoritative output_item.done can still report status:"failed".
    state.progress=rank[status];
  };
  const drain = () => {
    const blocks=[];
    for (const [n,state] of calls) if (state.snapshot!==undefined && !emitted.has(n)) {
      emitted.add(n);
      // A failed call can have no query at all; an empty array explicitly means
      // unknown, never an invented query or a fabricated successful result.
      blocks.push(projection.use(state.id,state.action?.input ?? {action:'search',queries:[]}));
      blocks.push(projection.results(state.id,state.action?.results ?? [],state.status==='failed'));
    }
    return blocks;
  };
  return {check,progress,drain,projection,hasSuccess:()=>[...calls.values()].some(x=>x.status==='completed' && x.snapshot!==undefined)};
}

/** URL annotations can arrive individually or in completed content snapshots.
 * Both paths must agree; ranges are bound to text actually streamed, not to
 * arbitrary output or non-authoritative response.metadata payloads. */
export function responsesCitations(enabled, search, getText, bad) {
  const annotations=new Map(), pending=[];
  const normalize = (key,value) => {
    if (!enabled || !search.hasSuccess()) bad('Responses citation without a successful native search');
    const offset=x=>Number.isSafeInteger(x) && x>=0;
    if (!record(value) || value.type!=='url_citation' || !offset(value.start_index) || !offset(value.end_index) || value.end_index<=value.start_index || typeof value.title!=='string') bad('Unsupported Responses annotation');
    const text=getText(key);
    if (typeof text!=='string' || value.end_index>text.length) bad('Responses annotation range exceeds streamed text');
    return {start:value.start_index,end:value.end_index,citation:{type:'web_search_result_location',url:search.projection.url(value.url),title:search.projection.text(value.title),cited_text:search.projection.text(text.slice(value.start_index,value.end_index)),encrypted_index:''}};
  };
  const append = (key,value) => {
    const values=annotations.get(key) ?? [];
    values.push(value); annotations.set(key,values); pending.push({key,citation:value.citation});
  };
  return {
    add(key,event) {
      const values=annotations.get(key) ?? [];
      if (!index(event.annotation_index) || event.annotation_index!==values.length) bad('Invalid Responses annotation position');
      append(key,normalize(key,event.annotation));
    },
    snapshot(key,values,final) {
      if (values===undefined) values=[];
      if (!Array.isArray(values)) bad('Invalid Responses annotations');
      if (!final) { if (values.length) bad('Responses added annotations must be empty'); return; }
      const known=annotations.get(key) ?? [];
      if (known.length>values.length) bad('Responses completed annotations do not match streamed annotations');
      values.forEach((value,n)=>{
        const normalized=normalize(key,value);
        if (n<known.length) {
          if (JSON.stringify(known[n])!==JSON.stringify(normalized)) bad('Responses completed annotation changed');
        } else append(key,normalized);
      });
    },
    drain() { return pending.splice(0); },
  };
}

/** Anthropic search input is streamed as JSON, but our client consumes complete
 * atomic input. Buffer only this bounded input, not text or the complete SSE. */
export function anthropicSearch(provider, model, enabled, bad) {
  const projection=searchProjection(provider,bad), blocks=new Map(), calls=new Map();
  let started=false, stopped=false, next=0;
  const usage = value => {
    if (!record(value)) bad('Invalid native usage');
    return Object.fromEntries(['input_tokens','output_tokens','cache_creation_input_tokens','cache_read_input_tokens'].filter(k=>Object.hasOwn(value,k)).map(k=>[k,value[k]]));
  };
  const atomic = block => { const n=next++; return [{type:'content_block_start',index:n,content_block:block},{type:'content_block_stop',index:n}]; };
  const queryInput = value => {
    if (!record(value) || typeof value.query!=='string' || !value.query.length) bad('Invalid Anthropic search input');
    const query=projection.text(value.query);
    return {action:'search',query,queries:[query]};
  };
  const accept = event => {
    if (!record(event) || typeof event.type!=='string' || stopped) bad('Invalid Anthropic stream event');
    if (event.type==='ping') return [];
    if (!started && event.type!=='message_start') bad('Native stream missing message_start');
    if (event.type==='message_start') {
      if (started || !record(event.message) || !identity(event.message.id) || (event.message.content!==undefined && (!Array.isArray(event.message.content) || event.message.content.length))) bad('Invalid Anthropic message_start');
      started=true;
      return [{type:'message_start',message:{id:event.message.id,type:'message',role:'assistant',model:model.id,content:[],stop_reason:null,stop_sequence:null,...(event.message.usage ? {usage:usage(event.message.usage)} : {})}}];
    }
    if (event.type==='content_block_start') {
      if (!index(event.index) || blocks.has(event.index) || !record(event.content_block)) bad('Invalid Anthropic content block');
      const block=event.content_block;
      if (block.type==='server_tool_use') {
        if (!enabled || block.name!=='web_search' || !identity(block.id) || calls.has(block.id) || !record(block.input) || (block.caller!==undefined && (!record(block.caller) || block.caller.type!=='direct'))) bad('Unsupported Anthropic server tool');
        calls.set(block.id,{done:false,result:false});
        blocks.set(event.index,{type:block.type,id:block.id,input:block.input,json:'',jsonBytes:0,closed:false});
        return [];
      }
      if (block.type==='web_search_tool_result') {
        const call=calls.get(block.tool_use_id);
        if (!enabled || !call?.done || call.result) bad('Unexpected Anthropic search result');
        let content, failed=false;
        if (record(block.content) && block.content.type==='web_search_tool_result_error') { content=[]; failed=true; }
        else if (Array.isArray(block.content)) {
          if (block.content.some(x=>!record(x) || x.type!=='web_search_result')) bad('Unsupported Anthropic search result');
          content=block.content.map(x=>projection.result(x));
        } else bad('Invalid Anthropic search result');
        call.result=true; call.failed=failed;
        blocks.set(event.index,{type:block.type,closed:false});
        return atomic(projection.results(block.tool_use_id,content,failed));
      }
      if (!['text','thinking','redacted_thinking'].includes(block.type)) bad('Unsupported Anthropic content block');
      const n=next++, state={type:block.type,n,closed:false}; blocks.set(event.index,state);
      let clean;
      if (block.type==='text') {
        if (typeof block.text!=='string') bad('Invalid Anthropic text');
        clean={type:'text',text:block.text};
        if (block.citations!==undefined) {
          if (!Array.isArray(block.citations) || (!enabled && block.citations.length)) bad('Unsupported Anthropic citations');
          if (block.citations.length && ![...calls.values()].some(x=>x.result && !x.failed)) bad('Anthropic citation without a successful search');
          clean.citations=block.citations.map(x=>projection.citation(x));
        }
      } else if (block.type==='thinking') {
        if (typeof block.thinking!=='string' || model.capabilities?.thinking!==true) bad('Unsupported Anthropic thinking');
        clean={type:'thinking',thinking:block.thinking,signature:''};
      } else {
        // Opaque encrypted thinking is not client-visible text or a search tool.
        bad('Unsupported Anthropic encrypted thinking');
      }
      return [{type:'content_block_start',index:n,content_block:clean}];
    }
    if (event.type==='content_block_delta' || event.type==='content_block_stop') {
      const state=blocks.get(event.index);
      if (!index(event.index) || !state || state.closed) bad('Invalid Anthropic block position');
      if (event.type==='content_block_stop') {
        state.closed=true;
        if (state.type==='server_tool_use') {
          let input=state.input;
          if (state.json) {
            if (Object.keys(input).length) bad('Ambiguous Anthropic search input');
            try { input=JSON.parse(state.json); } catch { bad('Invalid Anthropic search JSON'); }
          }
          const normalized=queryInput(input); calls.get(state.id).done=true;
          return atomic(projection.use(state.id,normalized));
        }
        return state.type==='web_search_tool_result' ? [] : [{type:'content_block_stop',index:state.n}];
      }
      const delta=event.delta;
      if (!record(delta)) bad('Invalid Anthropic delta');
      if (state.type==='server_tool_use') {
        if (delta.type!=='input_json_delta' || typeof delta.partial_json!=='string') bad('Unsupported Anthropic search delta');
        state.jsonBytes+=Buffer.byteLength(delta.partial_json);
        if (state.jsonBytes>1024*1024) bad('Anthropic search input exceeds size limit');
        state.json+=delta.partial_json;
        return [];
      }
      if (state.type==='text' && delta.type==='citations_delta') {
        if (!enabled || ![...calls.values()].some(x=>x.result && !x.failed)) bad('Anthropic citation without a successful search');
        return [{type:'content_block_delta',index:state.n,delta:{type:'citations_delta',citation:projection.citation(delta.citation)}}];
      }
      const field=state.type==='text' && delta.type==='text_delta' ? 'text' : state.type==='thinking' && delta.type==='thinking_delta' ? 'thinking' : state.type==='thinking' && delta.type==='signature_delta' ? 'signature' : undefined;
      if (!field || typeof delta[field]!=='string') bad('Unsupported Anthropic content delta');
      // Provider thinking signatures are not needed: histories are text-only.
      return field==='signature' ? [] : [{type:'content_block_delta',index:state.n,delta:{type:delta.type,[field]:delta[field]}}];
    }
    if (event.type==='message_delta') {
      if (!record(event.delta)) bad('Invalid Anthropic message delta');
      const delta={};
      if (event.delta.stop_reason!==undefined) {
        if (!['end_turn','max_tokens','stop_sequence','pause_turn','refusal','model_context_window_exceeded'].includes(event.delta.stop_reason)) bad('Unsupported Anthropic stop reason');
        delta.stop_reason=event.delta.stop_reason;
      }
      if (event.delta.stop_sequence!==undefined) {
        if (event.delta.stop_sequence!==null && typeof event.delta.stop_sequence!=='string') bad('Invalid Anthropic stop sequence');
        delta.stop_sequence=event.delta.stop_sequence;
      }
      return [{type:'message_delta',delta,...(event.usage ? {usage:usage(event.usage)} : {})}];
    }
    if (event.type==='message_stop') {
      if ([...blocks.values()].some(x=>!x.closed) || [...calls.values()].some(x=>!x.result)) bad('Anthropic stream ended with unfinished search or content');
      stopped=true; return [];
    }
    bad('Unsupported Anthropic stream event');
  };
  return {accept,finish:()=>{if (!started || !stopped) bad('Upstream stream interrupted before completion'); return {type:'message_stop'};}};
}
