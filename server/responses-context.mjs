// Versioned, local-only Responses replay context. This module intentionally has
// no Node/network dependencies so archive import and the server share ONE schema.
// Array position is the original raw output_index; never sort or deduplicate it.
export const RESPONSES_CONTEXT_LIMITS = Object.freeze({ bytes: 2 * 1024 * 1024, ciphertextBytes: 1024 * 1024, rounds: 5, calls: 4, items: 4096 });
const encoder = new TextEncoder();
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const fields = (value, allowed) => record(value) && Object.keys(value).every(key => allowed.includes(key));
const string = (value, max = RESPONSES_CONTEXT_LIMITS.bytes) => typeof value === 'string' && value.length <= max;
const identity = value => string(value, 256) && value.length > 0;
const provenance = value => string(value, 512) && value.trim().length > 0;
const cipher = value => typeof value === 'string' && value.length > 0 && value.length <= RESPONSES_CONTEXT_LIMITS.ciphertextBytes && encoder.encode(value).length <= RESPONSES_CONTEXT_LIMITS.ciphertextBytes;
const ciphertext = item => !Object.hasOwn(item, 'encrypted_content') || item.encrypted_content === null || cipher(item.encrypted_content);
const count = value => Number.isSafeInteger(value) && value >= 0;
const array = (value, test, max = RESPONSES_CONTEXT_LIMITS.items) => Array.isArray(value) && value.length <= max && Array.from(value).every(test);
// Raw final evidence may contain provider/relay extensions. Keep it local and
// accept JSON data only, with depth and node budgets in addition to byte limits.
const jsonData = (value, depth = 0, budget = { left: 100000 }) => {
  if (--budget.left < 0 || depth > 32) return false;
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return Array.from(value).every(item => jsonData(item, depth + 1, budget));
  return record(value) && Object.keys(value).every(key => !['__proto__', 'prototype', 'constructor'].includes(key) && jsonData(value[key], depth + 1, budget));
};
const url = value => {
  if (!string(value, 4096)) return false;
  try { const parsed = new URL(value); return ['http:', 'https:'].includes(parsed.protocol) && !parsed.username && !parsed.password; } catch { return false; }
};
const annotation = (value, length) => fields(value, ['type', 'url', 'title', 'start_index', 'end_index']) && value.type === 'url_citation' && url(value.url) && (value.title === undefined || value.title === null || string(value.title)) && count(value.start_index) && count(value.end_index) && value.start_index < value.end_index && value.end_index <= length;
const logprob = (value, top = false) => {
  if (!fields(value, top ? ['token', 'logprob', 'bytes'] : ['token', 'logprob', 'bytes', 'top_logprobs']) || !string(value.token) || typeof value.logprob !== 'number' || !Number.isFinite(value.logprob)) return false;
  if (value.bytes != null && !array(value.bytes, byte => Number.isSafeInteger(byte) && byte >= 0 && byte <= 255)) return false;
  return top || value.top_logprobs == null || array(value.top_logprobs, entry => logprob(entry, true));
};
const textPart = value => {
  if (!fields(value, ['type', 'text', 'annotations', 'logprobs']) || value.type !== 'output_text' || !string(value.text)) return false;
  if (value.logprobs != null && !array(value.logprobs, entry => logprob(entry))) return false;
  return value.annotations == null || array(value.annotations, item => annotation(item, value.text.length));
};
const refusalPart = value => fields(value, ['type', 'refusal']) && value.type === 'refusal' && string(value.refusal);
const reasoningPart = type => value => fields(value, ['type', 'text']) && value.type === type && string(value.text);
const source = value => {
  if (value?.type === 'api') return fields(value, ['type', 'name']) && identity(value.name) && value.name.trim().length > 0 && !/[\x00-\x1f\x7f]/.test(value.name);
  return fields(value, ['type', 'url', 'title', 'snippet', 'description', 'published_at', 'site_name', 'site_icon', 'page_age']) && value.type === 'url' && url(value.url) && ['title', 'snippet', 'description', 'published_at', 'site_name', 'site_icon', 'page_age'].every(key => value[key] === undefined || value[key] === null || string(value[key]));
};
const action = value => {
  if (value?.type === 'search') return fields(value, ['type', 'query', 'queries', 'sources']) && (value.query === undefined || string(value.query)) && (value.queries === undefined || array(value.queries, item => string(item))) && (value.queries?.length > 0 || typeof value.query === 'string') && (value.sources === undefined || array(value.sources, source));
  if (value?.type === 'open_page') return fields(value, ['type', 'url']) && url(value.url);
  if (value?.type === 'find') return fields(value, ['type', 'url', 'pattern']) && url(value.url) && string(value.pattern);
  return false;
};
const terminalItem = item => {
  if (!record(item) || !identity(item.id)) return false;
  if (item.type === 'reasoning') return fields(item, ['type', 'id', 'status', 'summary', 'content', 'encrypted_content']) && (item.status == null || item.status === 'completed') && ciphertext(item) && (item.summary === undefined || array(item.summary, reasoningPart('summary_text'))) && (item.content == null || array(item.content, reasoningPart('reasoning_text')));
  if (item.type === 'message') return fields(item, ['type', 'id', 'status', 'role', 'content', 'phase']) && item.role === 'assistant' && (item.status == null || item.status === 'completed') && (item.phase == null || ['commentary', 'final_answer'].includes(item.phase)) && array(item.content, part => textPart(part) || refusalPart(part));
  if (item.type === 'web_search_call') return fields(item, ['type', 'id', 'status', 'action', 'encrypted_content']) && ['completed', 'failed'].includes(item.status) && ciphertext(item) && (item.action === undefined ? item.status === 'failed' : action(item.action));
  if (item.type === 'function_call') {
    if (!fields(item, ['type', 'id', 'status', 'call_id', 'name', 'arguments']) || (item.status != null && item.status !== 'completed') || !identity(item.call_id) || !['web_fetch', 'web_search'].includes(item.name) || !string(item.arguments, 16384)) return false;
    try {
      const args = JSON.parse(item.arguments);
      if (item.name === 'web_fetch') return fields(args, ['url']) && url(args.url);
      return fields(args, ['queries']) && array(args.queries, query => string(query, 512) && query.trim().length > 0, 3) && args.queries.length > 0;
    } catch { return false; }
  }
  return false;
};
const toolOutput = item => fields(item, ['type', 'call_id', 'output']) && item.type === 'function_call_output' && identity(item.call_id) && string(item.output);
const nonVisibleReasoning = item => item.type === 'reasoning' && item.status === 'completed' && Array.isArray(item.summary) && item.summary.length === 0 && (item.content == null || Array.isArray(item.content) && item.content.length === 0);
const validate = value => {
  if (!fields(value, ['version', 'provider_id', 'model_id', 'rounds']) || value.version !== 1 || !provenance(value.provider_id) || !provenance(value.model_id) || !Array.isArray(value.rounds) || value.rounds.length < 1 || value.rounds.length > RESPONSES_CONTEXT_LIMITS.rounds) return false;
  // JSON serialization also rejects cycles/BigInt; all nested fields are checked
  // below, so this never authorizes forwarding an unknown top-level API option.
  const json = JSON.stringify(value);
  if (json.length > RESPONSES_CONTEXT_LIMITS.bytes || encoder.encode(json).length > RESPONSES_CONTEXT_LIMITS.bytes) return false;
  const responses = new Set(), callIds = new Set();
  let calls = 0;
  return Array.from(value.rounds).every((round, roundIndex) => {
    if (!fields(round, ['response_id', 'output', 'raw_output', 'tool_outputs']) || !identity(round.response_id) || responses.has(round.response_id) || !array(round.output, terminalItem)) return false;
    responses.add(round.response_id);
    const seen = new Map(), functions = [];
    let searched = false;
    for (const item of round.output) {
      const prior = seen.get(item.id);
      if (prior && (!searched || !nonVisibleReasoning(prior) || !nonVisibleReasoning(item) || (prior.encrypted_content == null) !== (item.encrypted_content == null))) return false;
      seen.set(item.id, item);
      if (item.type === 'web_search_call' && item.status === 'completed') searched = true;
      if (item.type === 'function_call') {
        if (callIds.has(item.call_id) || ++calls > RESPONSES_CONTEXT_LIMITS.calls) return false;
        callIds.add(item.call_id); functions.push(item);
      }
    }
    if (round.raw_output !== undefined) {
      if (!Array.isArray(round.raw_output) || round.raw_output.length !== round.output.length || !jsonData(round.raw_output)) return false;
      for (let index = 0; index < round.output.length; index++) {
        const canonical = round.output[index], raw = round.raw_output[index];
        if (!record(raw) || canonical.id !== raw.id || canonical.type !== raw.type || !ciphertext(raw)) return false;
        if (raw.status != null && !(raw.type === 'web_search_call' ? ['completed', 'failed'].includes(raw.status) : raw.status === 'completed')) return false;
        // Missing/null terminal ciphertext is different from a conflicting
        // explicit terminal ciphertext. Only canonical output is ever replayed.
        if (canonical.encrypted_content != null && raw.encrypted_content != null && canonical.encrypted_content !== raw.encrypted_content) return false;
      }
    }
    const outputs = round.tool_outputs ?? [];
    if (!array(outputs, toolOutput) || outputs.length !== functions.length) return false;
    const answered = new Set();
    for (const item of outputs) {
      if (answered.has(item.call_id) || !functions.some(fn => fn.call_id === item.call_id)) return false;
      answered.add(item.call_id);
    }
    // Rounds are completed upstream Responses in one assistant turn. A UI
    // continuation can follow a round without functions; function rounds still
    // require their exact outputs above, and the last response cannot dangle.
    return roundIndex !== value.rounds.length - 1 || functions.length === 0;
  });
};

export function isResponsesContext(value) {
  try { return validate(value); } catch { return false; }
}

/** Join completed requests for UI continue without mutating, dropping or
 * deduplicating any round. The combined provenance, identities and budgets must
 * all validate; overflow never silently truncates stored history. */
export function mergeResponsesContexts(previous, incoming) {
  if (!isResponsesContext(previous) || !isResponsesContext(incoming)) throw new TypeError('Invalid Responses context');
  if (previous.provider_id !== incoming.provider_id || previous.model_id !== incoming.model_id) throw new TypeError('Responses context provenance changed');
  const merged = { ...previous, rounds: [...previous.rounds, ...incoming.rounds] };
  if (!isResponsesContext(merged)) throw new TypeError('Invalid merged Responses context or exceeded replay limits');
  return merged;
}

/** Construct only API input items. Provenance/raw evidence stay local. This is
 * passive serialization, never tool execution, URL fetch, or ID normalization. */
export function responsesContextInput(value) {
  if (!isResponsesContext(value)) throw new TypeError('Invalid Responses context');
  return value.rounds.flatMap(round => [...round.output, ...(round.tool_outputs ?? [])]);
}
