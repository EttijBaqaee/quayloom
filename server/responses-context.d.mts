import type { ResponsesContext, ResponsesContextItem, ResponsesFunctionOutput } from '../src/services/api/types.js'
export const RESPONSES_CONTEXT_LIMITS: Readonly<{ bytes: number; ciphertextBytes: number; rounds: number; calls: number; items: number }>
export function isResponsesContext(value: unknown): value is ResponsesContext
export function mergeResponsesContexts(previous: unknown, incoming: unknown): ResponsesContext
export function responsesContextInput(value: unknown): (ResponsesContextItem | ResponsesFunctionOutput)[]
