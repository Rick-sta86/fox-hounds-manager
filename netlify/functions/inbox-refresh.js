// inbox-refresh.js
// Step 02 — Gmail fetch + Claude categorisation
// POST /.netlify/functions/inbox-refresh
// Header: x-inbox-secret: <INBOX_SECRET>

const GMAIL_API     = 'https://www.googleapis.com/gmail/v1/users/me'
const TOKEN_URL     = 'https://oauth2.googleapis.com/token'
const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages'
const MAX_THREADS   = 25

// ── Rate limiting (in-memory, resets on cold start) ──────────────────────────
const rateLimitMap = new Map()
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000
const RATE_LIMIT_MAX = 10

function isRateLimited(ip) {
  const now = Date.now()
  const entry = rateLimitMap.get(ip) || { count: 0, start: now }
  if (now - entry.start > RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(ip, { count: 1, start: now })
    return false
  }
  entry.count++
  rateLimitMap.set(ip, entry)
  return entry.count > RATE_LIMIT_MAX
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function relativeTime(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return ''
  const days = Math.floor((Date.now() - d.getTime()) / 86400000)
  if (days === 0) return 'today'
  if (days === 1) return 'yesterday'
  return `${days} days ago`
}

// ── Gmail helpers ─────────────────────────────────────────────────────────────

async function getAccessToken() {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     process.env.GMAIL_CLIENT_ID,
      client_secret: process.env.GMAIL_CLIENT_SECRET,
      refresh_token: process.env.GMAIL_REFRESH_TOKEN,
      grant_type:    'refresh_token',
    }),
  })
  const data = await res.json()
  if (!data.access_token) throw new Error(`Token exchange failed: ${JSON.stringify(data)}`)
  return data.access_token
}

async function listThreadIds(accessToken, query, max) {
  const params = new URLSearchParams({ q: query, maxResults: String(max) })
  const res = await fetch(`${GMAIL_API}/threads?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const data = await res.json()
  if (!res.ok) throw new Error(`Gmail list failed: ${JSON.stringify(data)}`)
  return (data.threads || []).map(t => t.id)
}

async function getThreadDetail(accessToken, threadId) {
  const params = new URLSearchParams({ format: 'metadata' })
  params.append('metadataHeaders', 'From')
  params.append('metadataHeaders', 'Subject')
  params.append('metadataHeaders', 'Date')
  const res = await fetch(`${GMAIL_API}/threads/${threadId}?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const data = await res.json()
  if (!res.ok) throw new Error(`Gmail thread failed: ${JSON.stringify(data)}`)

  const messages = data.messages || []
  const latest   = messages[messages.length - 1]
  if (!latest) return null

  const headers = Object.fromEntries(
    (latest.payload?.headers || []).map(h => [h.name.toLowerCase(), h.value])
  )

  const dateStr = headers['date'] || ''
  return {
    thread_id:     threadId,
    from:          headers['from']    || '',
    subject:       headers['subject'] || '(no subject)',
    date:          dateStr,
    since:         relativeTime(dateStr),
    snippet:       data.snippet       || '',
    message_count: messages.length,
  }
}

// ── Claude categorisation ─────────────────────────────────────────────────────

async function categoriseWithClaude(threads) {
  const today = new Date().toDateString()

  const prompt = `You are an inbox assistant for Ricky, who runs the Fox & Hounds pub in Barley, Hertfordshire. Today is ${today}.

Categorise each email thread into exactly one of these columns:
- needs_you: Ricky needs to act or make a decision
- drafts: a reply is genuinely warranted — write a short draft for Ricky to approve before sending
- awaiting_reply: Ricky sent something and is waiting on the other party
- parked: on hold, pending some condition or a future date
- actioned: dealt with, automated, newsletters, no further action needed

For each thread return:
- thread_id (unchanged)
- column (one of the five above)
- who: sender's name or company — no email addresses, format as "Name — Company" or just "Company"
- what: one plain-English sentence describing what's actually happening (do NOT just copy the subject line)
- draft: if column is "drafts", a short polite reply Ricky could send (2–4 sentences). Otherwise null.

Rules:
- Only use "drafts" if the thread clearly warrants a reply from Ricky. Most threads should NOT be drafts.
- Do not invent information — base everything only on what is given.
- Return ONLY a valid JSON object, no explanation, no markdown fences.

{"threads": [{"thread_id":"...","column":"...","who":"...","what":"...","draft":null}, ...]}

Threads:
${JSON.stringify(threads.map(t => ({
  thread_id:     t.thread_id,
  from:          t.from,
  subject:       t.subject,
  date:          t.date,
  snippet:       t.snippet,
  message_count: t.message_count,
})), null, 2)}`

  const res = await fetch(ANTHROPIC_API, {
    method: 'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      messages:   [{ role: 'user', content: prompt }],
    }),
  })

  const data = await res.json()
  if (!res.ok) throw new Error(`Claude API failed: ${JSON.stringify(data)}`)

  const text = data.content?.[0]?.text || ''
  // Strip markdown fences if present, then extract JSON object
  const clean = text.replace(/^```[a-z]*\n?/i, '').replace(/```$/m, '').trim()
  const match = clean.match(/\{[\s\S]*\}/)
  if (!match) throw new Error(`Claude returned no JSON: ${text.slice(0, 300)}`)

  return JSON.parse(match[0])
}

// ── Handler ───────────────────────────────────────────────────────────────────

export const handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  }

  // CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers }
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) }
  }

  // Auth
  const secret = event.headers['x-inbox-secret']
  if (!secret || secret !== process.env.INBOX_SECRET) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) }
  }

  // Rate limit
  const ip = event.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown'
  if (isRateLimited(ip)) {
    return { statusCode: 429, headers, body: JSON.stringify({ error: 'Too many requests' }) }
  }

  try {
    // 1. Get Gmail access token
    const accessToken = await getAccessToken()

    // 2. Fetch thread IDs from inbox + sent
    const [inboxIds, sentIds] = await Promise.all([
      listThreadIds(accessToken, 'in:inbox (is:unread OR is:important) newer_than:30d', 20),
      listThreadIds(accessToken, 'in:sent newer_than:30d', 15),
    ])

    // Deduplicate, cap at MAX_THREADS
    const seen = new Set()
    const threadIds = []
    for (const id of [...inboxIds, ...sentIds]) {
      if (!seen.has(id) && threadIds.length < MAX_THREADS) {
        seen.add(id)
        threadIds.push(id)
      }
    }

    // 3. Fetch thread details in parallel
    const results = await Promise.all(
      threadIds.map(id => getThreadDetail(accessToken, id).catch(() => null))
    )
    const threads = results.filter(Boolean)

    // 4. Categorise with Claude
    const categorised = await categoriseWithClaude(threads)

    // 5. Merge in since + compute stale
    const metaMap = Object.fromEntries(
      threads.map(t => [t.thread_id, { since: t.since, date: t.date }])
    )
    const enriched = (categorised.threads || []).map(t => {
      const meta  = metaMap[t.thread_id] || {}
      const days  = meta.date
        ? Math.floor((Date.now() - new Date(meta.date).getTime()) / 86400000)
        : 0
      const stale = (t.column === 'awaiting_reply' || t.column === 'parked') && days > 7
      return { ...t, since: meta.since || '', stale }
    })

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ threads: enriched, fetched_at: new Date().toISOString() }),
    }

  } catch (err) {
    console.error('inbox-refresh error:', err)
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message }),
    }
  }
}
