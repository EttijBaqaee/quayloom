// The runtime-neutral module is shared with the server: archive imports and
// outgoing history must not drift to a weaker browser-only schema.
export { isResponsesContext, mergeResponsesContexts } from '../../../server/responses-context.mjs'
