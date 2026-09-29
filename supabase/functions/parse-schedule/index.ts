declare const Deno: {
  serve: (handler: (request: Request) => Response | Promise<Response>) => void
}

type ParseRequest = {
  text?: unknown
  timezone?: unknown
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Structures a natural-language schedule.
 * Read OPENAI_API_KEY or GEMINI_API_KEY from the function secret store.
 * Never accept a provider key from the web or mobile client.
 */
Deno.serve(async (request) => {
  if (request.method !== 'POST') {
    return Response.json({ error: 'method_not_allowed' }, { status: 405 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'invalid_json' }, { status: 400 })
  }

  const payload: ParseRequest = isRecord(body) ? body : {}
  if (typeof payload.text !== 'string' || payload.text.trim().length === 0) {
    return Response.json({ error: 'text_required' }, { status: 400 })
  }

  return Response.json({ error: 'not_implemented' }, { status: 501 })
})
