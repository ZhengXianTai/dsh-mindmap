/**
 * dsh-mindmap — host half.
 *
 * Keeps the topic-tree data behind the browser mind map:
 *   - `POST /mindmap/api/summarize`  one branch -> { topic, summary, open[] }
 *   - `POST /mindmap/api/summaries`  cached summaries for a batch of ids
 *   - `POST /mindmap/api/turns`      user-turn boundaries for the rewind UI
 *   - `GET  /mindmap/api/health`     activation probe
 *
 * Summaries are plugin-owned metadata, cached in
 * `$DSH_HOME/storages/mindmap/summaries.json`, and never written into a
 * session log. The session tree itself is derived from the public
 * `ctx.sessionQuery` / `ctx.sessions` services, so this half adds no new
 * session storage and no model-visible context.
 *
 * The model-facing `mindmap_topics` tool exposes the same tree read-only, so
 * an agent can see sibling branches and their summaries without paying their
 * token cost in the conversation.
 *
 * @module dsh-mindmap
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'mindmap'

/** Services this half needs before it can activate. */
export const inject = ['webServer', 'sessionQuery', 'sessions', 'llm', 'tools']

const ROUTE_PREFIX = '/mindmap/api'
const STORE_VERSION = 1
const MAX_BODY_BYTES = 64 * 1024
const MAX_IDS_PER_REQUEST = 200
const MAX_TREE_NODES = 80

const DEFAULTS = Object.freeze({
  autoSummarize: true,
  summaryMaxInputChars: 12_000,
  summaryMaxOutputTokens: 700,
  summaryTimeoutMs: 60_000,
  maxTopicsPerRequest: 64,
  trustedHosts: [],
})

/** Resolve the plugin configuration against defaults, rejecting nonsense. */
function resolveConfig(raw) {
  const input = raw !== null && typeof raw === 'object' ? raw : {}
  const positive = (value, fallback) =>
    typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback
  return {
    autoSummarize: input.autoSummarize !== false,
    summaryMaxInputChars: positive(input.summaryMaxInputChars, DEFAULTS.summaryMaxInputChars),
    summaryMaxOutputTokens: positive(input.summaryMaxOutputTokens, DEFAULTS.summaryMaxOutputTokens),
    summaryTimeoutMs: positive(input.summaryTimeoutMs, DEFAULTS.summaryTimeoutMs),
    maxTopicsPerRequest: positive(input.maxTopicsPerRequest, DEFAULTS.maxTopicsPerRequest),
    trustedHosts: Array.isArray(input.trustedHosts)
      ? input.trustedHosts.filter((entry) => typeof entry === 'string' && entry.length > 0)
      : [],
    provider: typeof input.provider === 'string' && input.provider !== '' ? input.provider : undefined,
    model: typeof input.model === 'string' && input.model !== '' ? input.model : undefined,
    dataFile: typeof input.dataFile === 'string' && input.dataFile !== '' ? input.dataFile : defaultDataFile(),
  }
}

/** Default on-disk summary cache, shared by every workspace of one DSH home. */
function defaultDataFile() {
  const home = process.env.DSH_HOME !== undefined && process.env.DSH_HOME !== ''
    ? process.env.DSH_HOME
    : join(homedir(), '.dsh')
  return join(home, 'storages', 'mindmap', 'summaries.json')
}

function warn(ctx, message, error) {
  try {
    ctx.logger?.warn?.(`[mindmap] ${message}${error === undefined ? '' : `: ${String(error)}`}`)
  } catch {
    // A logger mismatch must never break the plugin.
  }
}

/* ── text helpers ───────────────────────────────────────────────────────── */

/** Join the text blocks of one persisted content array. */
function textOfContent(content) {
  if (!Array.isArray(content)) return ''
  const parts = []
  for (const block of content) {
    if (block !== null && typeof block === 'object' && block.type === 'text' && typeof block.text === 'string') {
      parts.push(block.text)
    }
  }
  return parts.join('\n').trim()
}

/** Collapse whitespace and strip terminal control bytes from model output. */
function cleanLine(text, maxLength) {
  const flattened = String(text ?? '')
    // eslint-disable-next-line no-control-regex -- deliberate terminal-control scrub
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return flattened.length > maxLength ? `${flattened.slice(0, maxLength - 1)}…` : flattened
}

/** Read the model surface into a bounded, role-labelled transcript. */
function collectTranscript(surface, maxChars) {
  const turns = []
  let route
  for (const event of surface.events ?? []) {
    const type = event.type ?? event.ty
    if (type === 'user/message') {
      const data = event.data ?? {}
      const sourceKind = data.source?.kind
      // Injected tool/command context is not part of the human discussion.
      if (sourceKind !== undefined && sourceKind !== 'user') continue
      const text = textOfContent(data.content)
      if (text !== '') turns.push({ role: 'user', text })
    } else if (type === 'assistant/message') {
      const message = event.data?.message
      const source = message?.source
      if (source?.kind === 'model' && typeof source.provider === 'string' && typeof source.model === 'string') {
        route = { provider: source.provider, model: source.model }
      }
      const text = textOfContent(message?.content)
      if (text !== '') turns.push({ role: 'assistant', text })
    }
  }
  const firstUser = turns.find((turn) => turn.role === 'user')
  const tail = []
  let used = 0
  for (let index = turns.length - 1; index >= 0; index -= 1) {
    const turn = turns[index]
    const cost = turn.text.length + 8
    if (used + cost > maxChars) break
    used += cost
    tail.unshift(turn)
  }
  if (firstUser !== undefined && !tail.includes(firstUser) && used + firstUser.text.length + 8 <= maxChars) {
    tail.unshift(firstUser)
  }
  return { turns: tail, route, totalTurns: turns.length }
}

/**
 * Turn starts for the rewind UI. `atSeq` is an inclusive fork cut, so a turn
 * starting at seq S is removed by forking at S - 1.
 */
function collectTurns(surface) {
  const turns = []
  let current
  for (const event of surface.events ?? []) {
    const type = event.type ?? event.ty
    const seq = Number.isSafeInteger(event.seq) ? event.seq : undefined
    if (type === 'user/message') {
      const data = event.data ?? {}
      const sourceKind = data.source?.kind
      if (sourceKind !== undefined && sourceKind !== 'user') continue
      const text = textOfContent(data.content)
      if (text === '') continue
      current = {
        index: turns.length + 1,
        startSeq: seq,
        endSeq: seq,
        at: typeof event.time === 'number' ? event.time : (typeof data.time === 'number' ? data.time : undefined),
        user: cleanLine(text, 220),
        assistant: '',
      }
      turns.push(current)
      continue
    }
    if (current === undefined) continue
    if (seq !== undefined) current.endSeq = seq
    if (type === 'assistant/message') {
      const text = textOfContent(event.data?.message?.content)
      if (text !== '' && current.assistant === '') current.assistant = cleanLine(text, 220)
    }
  }
  return turns.map((turn) => ({
    ...turn,
    rewindAt: turn.startSeq === undefined || turn.startSeq <= 0 ? undefined : turn.startSeq - 1,
  }))
}

/** Accept both a bare title string and the folded title snapshot record. */
function titleText(value) {
  if (typeof value === 'string') return value
  if (value !== null && typeof value === 'object' && typeof value.title === 'string') return value.title
  return undefined
}

/** A short deterministic title when no model summary is available yet. */
function fallbackFromTranscript(title, turns) {
  const first = turns.find((turn) => turn.role === 'user')?.text ?? ''
  const topic = cleanLine(title !== undefined && title !== '' ? title : first, 40)
  const summary = cleanLine(first, 240)
  return {
    topic: topic === '' ? 'Untitled topic' : topic,
    summary,
    open: [],
  }
}

/** Take only model-provided strings; ignore numbers, objects, and arrays. */
function stringField(value) {
  return typeof value === 'string' ? value : ''
}

/** Parse one JSON object out of model output, tolerating code fences and prose. */
function parseSummaryOutput(text, title) {
  const raw = String(text ?? '').trim()
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  let value
  if (start !== -1 && end > start) {
    try {
      value = JSON.parse(raw.slice(start, end + 1))
    } catch {
      value = undefined
    }
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  const topic = cleanLine(stringField(value.topic) !== '' ? value.topic : title ?? '', 40)
  const summary = cleanLine(stringField(value.summary), 400)
  if (topic === '' && summary === '') return undefined
  const open = Array.isArray(value.open)
    ? value.open
        .map((item) => cleanLine(stringField(item), 120))
        .filter((item) => item !== '')
        .slice(0, 4)
    : []
  return { topic: topic === '' ? cleanLine(title ?? '', 40) : topic, summary, open }
}

/** Build the summarizer prompt from one branch's bounded transcript. */
function buildPrompt({ title, parentTitle, turns }) {
  const payload = {
    currentTitle: title ?? '',
    parentTopic: parentTitle ?? '',
    transcript: turns.map((turn) => ({ role: turn.role, text: turn.text })),
  }
  return [
    'You maintain the topic map of a long learning conversation for a mind-map view.',
    'You receive ONE branch of the conversation as JSON. Write a map label and a short summary for this branch.',
    '',
    'Return exactly one JSON object, with no markdown and no code fence:',
    '{"topic": "...", "summary": "...", "open": ["..."]}',
    '',
    'Rules:',
    '- "topic": a noun phrase of at most 20 characters naming this branch, in the language of the discussion.',
    '- "summary": 2-3 complete sentences, at most 400 characters: what was discussed and where it landed. Do not invent facts.',
    '- "open": up to 3 questions that remain unresolved and may deserve a subtopic; use [] when none.',
    '- Summarize THIS branch only. The parent topic is context, not the subject.',
    '',
    JSON.stringify(payload),
  ].join('\n')
}

/* ── summary cache ──────────────────────────────────────────────────────── */

class SummaryStore {
  constructor(ctx, config) {
    this.ctx = ctx
    this.config = config
    this.file = typeof config.dataFile === 'string' && config.dataFile !== '' ? config.dataFile : defaultDataFile()
    this.summaries = Object.create(null)
    this.inflight = new Map()
    this.controllers = new Set()
    this.writeChain = Promise.resolve()
    this.ready = this.load()
    this.disposed = false
  }

  async load() {
    try {
      const text = await readFile(this.file, 'utf8')
      const parsed = JSON.parse(text)
      if (parsed !== null && typeof parsed === 'object' && parsed.version === STORE_VERSION
        && parsed.summaries !== null && typeof parsed.summaries === 'object') {
        for (const [id, value] of Object.entries(parsed.summaries)) {
          if (value !== null && typeof value === 'object' && typeof value.at === 'number') {
            this.summaries[id] = value
          }
        }
      }
    } catch (error) {
      if (error?.code !== 'ENOENT') warn(this.ctx, 'summary cache unreadable; starting empty', error)
    }
  }

  persist() {
    const payload = `${JSON.stringify({ version: STORE_VERSION, summaries: this.summaries })}\n`
    this.writeChain = this.writeChain
      .then(async () => {
        await mkdir(dirname(this.file), { recursive: true })
        const temporary = `${this.file}.${process.pid}.tmp`
        await writeFile(temporary, payload, 'utf8')
        await rename(temporary, this.file)
      })
      .catch((error) => warn(this.ctx, 'summary cache write failed', error))
    return this.writeChain
  }

  cached(ids) {
    const result = Object.create(null)
    for (const id of ids) {
      if (typeof id !== 'string' || id === '') continue
      const value = this.summaries[id]
      if (value !== undefined) result[id] = value
    }
    return result
  }

  close() {
    this.disposed = true
    for (const controller of this.controllers) controller.abort(new Error('mindmap plugin disposed'))
    this.controllers.clear()
  }

  /**
   * Summarize one logical session.
   * @param {string} sessionId
   * @param {{force?: boolean}} options
   */
  async summarize(sessionId, options = {}) {
    if (this.disposed) throw new Error('mindmap plugin is disposed')
    const running = this.inflight.get(sessionId)
    if (running !== undefined) return running
    const task = this.#summarize(sessionId, options).finally(() => {
      this.inflight.delete(sessionId)
    })
    this.inflight.set(sessionId, task)
    return task
  }

  async #summarize(sessionId, options) {
    await this.ready
    const surface = await this.ctx.sessionQuery.readSurface(sessionId)
    const capturedThroughSeq = surface.capturedThroughSeq
    const cached = this.summaries[sessionId]
    if (options.force !== true && cached !== undefined && cached.seq === capturedThroughSeq) {
      return { ...cached, cached: true }
    }

    const header = surface.session ?? {}
    let title = titleText(header.title)
    if (title === undefined || title === '') {
      try {
        title = titleText((await this.ctx.sessionQuery.readTitleSnapshot(sessionId))?.title)
      } catch {
        title = undefined
      }
    }
    let parentTitle
    if (typeof header.parentSession === 'string') {
      try {
        parentTitle = titleText(await this.ctx.sessionQuery.readTitle(header.parentSession))
      } catch {
        parentTitle = undefined
      }
    }

    const { turns, route } = collectTranscript(surface, this.config.summaryMaxInputChars)
    if (turns.length === 0) {
      const empty = { seq: capturedThroughSeq, at: Date.now(), degraded: true, ...fallbackFromTranscript(title, turns), model: null }
      this.summaries[sessionId] = empty
      void this.persist()
      return { ...empty, cached: false }
    }

    const provider = this.config.provider ?? route?.provider
    const model = this.config.model ?? route?.model
    if (provider === undefined || model === undefined) {
      const degraded = {
        seq: capturedThroughSeq,
        at: Date.now(),
        degraded: true,
        ...fallbackFromTranscript(title, turns),
        model: null,
        reason: 'no-route',
      }
      this.summaries[sessionId] = degraded
      void this.persist()
      return { ...degraded, cached: false }
    }

    const controller = new AbortController()
    this.controllers.add(controller)
    const timeout = setTimeout(
      () => controller.abort(new Error(`summary timed out after ${this.config.summaryTimeoutMs}ms`)),
      this.config.summaryTimeoutMs,
    )
    try {
      const prepared = await this.ctx.llm.prepareCall(
        {
          provider,
          model,
          messages: [{ role: 'user', content: [{ type: 'text', text: buildPrompt({ title, parentTitle, turns }) }] }],
        },
        controller.signal,
        (controls) => ({ ...controls, maxTokens: this.config.summaryMaxOutputTokens }),
      )
      let output = ''
      let finish
      for await (const chunk of prepared.stream(prepared.config)) {
        if (chunk.type === 'text-delta') output += chunk.text
        else if (chunk.type === 'finish') finish = chunk.reason
      }
      if (finish?.kind !== 'stop') {
        throw new Error(`summary model finished with ${finish?.kind ?? 'no finish reason'}`)
      }
      const parsed = parseSummaryOutput(output, title)
      if (parsed === undefined) throw new Error('summary model returned no usable JSON')
      const value = {
        seq: capturedThroughSeq,
        at: Date.now(),
        topic: parsed.topic,
        summary: parsed.summary,
        open: parsed.open,
        model: `${provider}/${model}`,
        degraded: false,
      }
      this.summaries[sessionId] = value
      void this.persist()
      return { ...value, cached: false }
    } catch (error) {
      warn(this.ctx, `summary failed for ${sessionId}`, error)
      const degraded = {
        seq: capturedThroughSeq,
        at: Date.now(),
        ...fallbackFromTranscript(title, turns),
        model: `${provider}/${model}`,
        degraded: true,
        reason: error instanceof Error ? error.message : String(error),
      }
      this.summaries[sessionId] = degraded
      void this.persist()
      return { ...degraded, cached: false }
    } finally {
      clearTimeout(timeout)
      this.controllers.delete(controller)
    }
  }
}

/* ── HTTP helpers ──────────────────────────────────────────────────────── */

function sendJson(res, status, value) {
  const body = `${JSON.stringify(value)}\n`
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
  })
  res.end(body)
}

async function readJsonBody(req) {
  let size = 0
  const chunks = []
  for await (const chunk of req) {
    size += chunk.length
    if (size > MAX_BODY_BYTES) {
      const error = new Error('request body too large')
      error.status = 413
      throw error
    }
    chunks.push(chunk)
  }
  if (size === 0) return {}
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    const error = new Error('request body is not valid JSON')
    error.status = 400
    throw error
  }
}

/** Loopback / trusted-authority fence for the plugin routes. */
function isTrustedRequest(req, trustedHosts) {
  const host = req.headers.host
  if (typeof host !== 'string' || host === '') return false
  let hostUrl
  try {
    hostUrl = new URL(`http://${host}`)
  } catch {
    return false
  }
  const hostname = hostUrl.hostname
  const loopback = hostname === 'localhost' || hostname === '[::1]' || /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)
  if (!loopback && !trustedHosts.includes(host)) return false
  const origin = req.headers.origin
  // A desktop file:// page sends the opaque origin "null"; the Host fence above
  // already binds the request to this process's own listener.
  if (origin !== undefined && origin !== 'null') {
    try {
      if (new URL(origin).hostname !== hostname) return false
    } catch {
      return false
    }
  }
  return true
}

/* ── topic tree for the model-facing tool ──────────────────────────────── */

async function buildTopicOutline(ctx, currentId, summaries, limit) {
  const records = await ctx.sessionQuery.listSessions()
  const byId = new Map()
  for (const record of records) {
    const header = record.header ?? record
    if (typeof header.id === 'string') byId.set(header.id, header)
  }
  const ids = [...byId.keys()]
  const titles = new Map()
  try {
    const results = await ctx.sessionQuery.readTitleSnapshots(ids)
    for (const result of results) {
      const text = result.status === 'fulfilled' ? titleText(result.value?.title) : undefined
      if (text !== undefined && result.value?.session?.id !== undefined) titles.set(result.value.session.id, text)
    }
  } catch (error) {
    warn(ctx, 'title batch failed', error)
  }
  const children = new Map()
  const roots = []
  for (const header of byId.values()) {
    const parentId = header.parentSession
    if (typeof parentId === 'string' && byId.has(parentId)) {
      const list = children.get(parentId) ?? []
      list.push(header)
      children.set(parentId, list)
    } else {
      roots.push(header)
    }
  }
  for (const list of children.values()) list.sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0))

  let rootId = currentId
  const seen = new Set()
  while (typeof byId.get(rootId)?.parentSession === 'string' && !seen.has(rootId)) {
    seen.add(rootId)
    rootId = byId.get(rootId).parentSession
  }
  const lines = []
  const visit = (header, depth) => {
    if (lines.length >= limit) return
    const id = header.id
    const label = titles.get(id) ?? id
    const summary = summaries[id]
    const marker = id === currentId ? ' ←（当前话题）' : ''
    const topic = summary !== undefined && summary.topic !== '' ? `${label} 〔${summary.topic}〕` : label
    const detail = summary !== undefined && summary.summary !== '' ? ` — ${cleanLine(summary.summary, 180)}` : ''
    lines.push(`${'  '.repeat(depth)}- ${topic}${detail}${marker}`)
    for (const child of children.get(id) ?? []) visit(child, depth + 1)
  }
  const root = byId.get(rootId)
  if (root !== undefined) visit(root, 0)
  else for (const header of roots) visit(header, 0)
  const truncated = lines.length >= limit ? `\n…（仅显示前 ${limit} 个话题）` : ''
  return `话题树（/ 表示分支层级；〔〕是自动总结）：\n${lines.join('\n')}${truncated}`
}

/* ── plugin ─────────────────────────────────────────────────────────────── */

export function apply(ctx, rawConfig) {
  const config = resolveConfig(rawConfig)
  const store = new SummaryStore(ctx, config)

  const route = {
    kind: 'prefix',
    path: ROUTE_PREFIX,
    handler: async (req, res) => {
      if (!isTrustedRequest(req, config.trustedHosts)) {
        sendJson(res, 403, { ok: false, error: { code: 'forbidden', message: 'request is not from this host' } })
        return
      }
      const url = new URL(req.url ?? '/', 'http://dsh.internal')
      const method = url.pathname.startsWith(`${ROUTE_PREFIX}/`)
        ? url.pathname.slice(ROUTE_PREFIX.length + 1)
        : undefined
      if (method === undefined || method === '' || method.includes('/')) {
        sendJson(res, 404, { ok: false, error: { code: 'not-found', message: 'unknown mindmap method' } })
        return
      }
      try {
        if (method === 'health' && req.method === 'GET') {
          sendJson(res, 200, {
            ok: true,
            plugin: 'dsh-mindmap',
            version: '0.7.0',
            cached: Object.keys(store.summaries).length,
            autoSummarize: config.autoSummarize,
            active: store.inflight.size,
          })
          return
        }
        if (req.method !== 'POST') {
          sendJson(res, 405, { ok: false, error: { code: 'method-error', message: 'POST required' } })
          return
        }
        const payload = await readJsonBody(req)
        if (method === 'summaries') {
          const ids = Array.isArray(payload.ids)
            ? payload.ids
                .filter((id) => typeof id === 'string')
                .slice(0, Math.min(MAX_IDS_PER_REQUEST, config.maxTopicsPerRequest))
            : []
          await store.ready
          sendJson(res, 200, { ok: true, summaries: store.cached(ids) })
          return
        }
        if (method === 'turns') {
          const sessionId = typeof payload.sessionId === 'string' ? payload.sessionId : ''
          if (sessionId === '') {
            sendJson(res, 400, { ok: false, error: { code: 'bad-request', message: 'sessionId is required' } })
            return
          }
          const lease = await ctx.sessionQuery.observeSession(sessionId)
          try {
            const events = lease.events
            sendJson(res, 200, {
              ok: true,
              capturedThroughSeq: events.at(-1)?.seq ?? null,
              turns: collectTurns({ events }),
            })
          } finally {
            try {
              lease[Symbol.dispose]?.()
            } catch {
              // The lease is already disposed; the read remains valid.
            }
          }
          return
        }
        if (method === 'summarize') {
          const sessionId = typeof payload.sessionId === 'string' ? payload.sessionId : ''
          if (sessionId === '') {
            sendJson(res, 400, { ok: false, error: { code: 'bad-request', message: 'sessionId is required' } })
            return
          }
          if (config.autoSummarize !== true && payload.force !== true) {
            sendJson(res, 200, {
              ok: true,
              summary: store.cached([sessionId])[sessionId] ?? null,
              disabled: true,
            })
            return
          }
          const summary = await store.summarize(sessionId, { force: payload.force === true })
          sendJson(res, 200, { ok: true, summary })
          return
        }
        sendJson(res, 404, { ok: false, error: { code: 'not-found', message: `unknown mindmap method "${method}"` } })
      } catch (error) {
        const status = typeof error?.status === 'number' ? error.status : 500
        if (status >= 500) warn(ctx, 'route failed', error)
        sendJson(res, status, {
          ok: false,
          error: {
            code: status === 400 ? 'bad-request' : status === 413 ? 'too-large' : 'internal',
            message: error instanceof Error ? error.message : String(error),
          },
        })
      }
    },
  }

  ctx.effect(() => ctx.webServer.register(route), 'mindmap: /mindmap/api routes')
  ctx.effect(() => () => store.close(), 'mindmap: summary store')

  ctx.effect(() => ctx.tools.register(defineTool({
    name: 'mindmap_topics',
    description:
      'Read the topic tree of the current discussion: the current branch, its parent chain, sibling branches, and child subtopics, with the cached auto-summary of each. Read-only and cheap; use it when the user refers to another branch or asks what was already discussed elsewhere. It never loads those branches into this conversation.',
    parameters: {},
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          outline: { type: 'string', required: true, description: 'Indented topic tree with cached summaries.' },
        },
      },
      render: (_args, value) => [{ type: 'text', text: value.outline }],
    },
    async execute(_args, exec) {
      const session = exec.agent?.session
      if (session === undefined) throw new Error('mindmap_topics requires an agent Session')
      await store.ready
      const outline = await buildTopicOutline(ctx, session.id, store.summaries, MAX_TREE_NODES)
      return { outline }
    },
  })), 'mindmap: mindmap_topics tool')
}
