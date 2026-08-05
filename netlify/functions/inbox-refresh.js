// inbox-refresh.js
// Step 01 — Gmail fetch only. No Claude yet.
// POST /.netlify/functions/inbox-refresh
// Header: x-inbox-secret: <INBOX_SECRET>

const GMAIL_API = 'https://www.googleapis.com/gmail/v1/users/me'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const MAX_THREADS = 25

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
  if (!data.access_token) throw new Error('Token exchange failed: ' + JSON.stringify(data))
  return data.access_token
}

async function listThreadIds(accessToken, query, max) {
  const params = new URLSearchParams({ q: query, maxResults: String(max) })
  const res = await fetch(GMAIL_API + '/threads?' + params, {
    headers: { Authorization: 'Bearer ' + accessToken },
  })
  const data = await res.json()
  if (!res.ok) throw new Error('Gmail list failed: ' + JSON.stringify(data))
  return (data.threads || []).map(t => t.id)
}

async function getThreadDetail(accessToken, threadId) {
  const params = new URLSearchParams({
    format: 'metadata',
    metadataHeaders: ['From', 'Subject', 'Date'],
  })
  const res = await fetch(GMAIL_API + '/threads/' + threadId + '?' + params, {
    headers: { Authorization: 'Bearer ' + accessToken },
  })
  const data = await res.json()
  if (!res.ok) throw new Error('Gmail thread failed: ' + JSON.stringify(data))

  const messages = data.messages || []
  const latest   = messages[messages.length - 1]
  if (!latest) return null

  const headers = Object.fromEntries(
    (latest.payload?.headers || []).map(h => [h.name.toLowerCase(), h.value])
  )

  return {
    thread_id:     threadId,
    from:          headers['from']    || '',
    subject:       headers['subject'] || '(no subject)',
    date:          headers['date']    || '',
    snippet:       data.snippet       || '',
    message_count: messages.length,
  }
}

export const handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  }

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers }
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) }
  }

  const secret = event.headers['x-inbox-secret']
  if (!secret || secret !== process.env.INBOX_SECRET) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) }
  }

  const ip = event.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown'
  if (isRateLimited(ip)) {
    return { statusCode: 429, headers, body: JSON.stringify({ error: 'Too many requests' }) }
  }

  try {
    const accessToken = await getAccessToken()

    const [inboxIds, sentIds] = await Promise.all([
      listThreadIds(accessToken, 'in:inbox (is:unread OR is:important) newer_than:30d', 20),
      listThreadIds(accessToken, 'in:sent newer_than:30d', 15),
    ])

    const seen = new Set()
    const threadIds = []
    for (const id of [...inboxIds, ...sentIds]) {
      if (!seen.has(id) && threadIds.length < MAX_THREADS) {
        seen.add(id)
        threadIds.push(id)
      }
    }

    const results = await Promise.all(
      threadIds.map(id => getThreadDetail(accessToken, id).catch(() => null))
    )
    const threads = results.filter(Boolean)

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ threads, fetched_at: new Date().toISOString() }),
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