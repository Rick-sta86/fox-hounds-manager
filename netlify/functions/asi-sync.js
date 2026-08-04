// Asi Inbox sync — Netlify Function
// Receives the full current state of Asi's email triage and replaces the
// `email_items` collection with it, via the Firestore REST API (no
// firebase-admin / service account required).

import { randomUUID } from 'node:crypto'

// The project ID and web API key are public identifiers (same ones baked
// into src/firebase.js and shipped in the client bundle) — safe to hardcode
// as fallbacks. Prefer env vars so they can be overridden without a redeploy.
const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'fox-hounds-manager'
const API_KEY    = process.env.FIREBASE_API_KEY || 'AIzaSyABArNkmpfRd7aGE-Y6S-50tzV6oDH4hpY'

const COLLECTION  = 'email_items'
const BASE_URL    = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`
const COMMIT_URL  = `${BASE_URL}:commit`
const CATEGORIES  = ['needs_you', 'drafts', 'awaiting_reply', 'parked', 'actioned']
const WRITE_CHUNK = 500 // Firestore commit limit per request

function getHeader(headers, name) {
  if (!headers) return undefined
  const key = Object.keys(headers).find((k) => k.toLowerCase() === name.toLowerCase())
  return key ? headers[key] : undefined
}

function chunk(arr, size) {
  const out = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

function docName(id) {
  return `projects/${PROJECT_ID}/databases/(default)/documents/${COLLECTION}/${id}`
}

function encodeValue(value) {
  if (value === null || value === undefined) return { nullValue: null }
  if (typeof value === 'number') return { doubleValue: value }
  if (typeof value === 'boolean') return { booleanValue: value }
  return { stringValue: String(value) }
}

function buildFields(item, now) {
  const fields = {
    who:       encodeValue(item.who || ''),
    what:      encodeValue(item.what || ''),
    category:  encodeValue(item.category),
    status:    encodeValue('new'),
    updatedAt: { timestampValue: now },
  }
  if (item.since) fields.since = encodeValue(item.since)
  if (item.date)  fields.date  = encodeValue(item.date)
  return fields
}

// Firestore rules require an authenticated request (this app signs in
// anonymously on the client for the same reason) — mint a fresh anonymous
// ID token via the Identity Toolkit REST API rather than embedding a
// service account key.
async function getAnonymousIdToken() {
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ returnSecureToken: true }),
    }
  )
  if (!res.ok) {
    throw new Error(`Anonymous sign-in failed: ${res.status} ${await res.text()}`)
  }
  const data = await res.json()
  return data.idToken
}

async function listAllDocIds(idToken) {
  const ids = []
  let pageToken
  do {
    const url = new URL(`${BASE_URL}/${COLLECTION}`)
    url.searchParams.set('pageSize', '300')
    url.searchParams.set('mask.fieldPaths', '__name__')
    if (pageToken) url.searchParams.set('pageToken', pageToken)

    const res = await fetch(url, { headers: { Authorization: `Bearer ${idToken}` } })
    if (!res.ok) {
      throw new Error(`List failed: ${res.status} ${await res.text()}`)
    }
    const data = await res.json()
    for (const doc of data.documents || []) {
      ids.push(doc.name.split('/').pop())
    }
    pageToken = data.nextPageToken
  } while (pageToken)
  return ids
}

async function commitWrites(idToken, writes) {
  if (writes.length === 0) return
  for (const batch of chunk(writes, WRITE_CHUNK)) {
    const res = await fetch(COMMIT_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${idToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ writes: batch }),
    })
    if (!res.ok) {
      throw new Error(`Commit failed: ${res.status} ${await res.text()}`)
    }
  }
}

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) }
  }

  const providedKey = getHeader(event.headers, 'x-asi-key')
  if (!providedKey || providedKey !== process.env.ASI_SYNC_KEY) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) }
  }

  let payload
  try {
    payload = JSON.parse(event.body || '{}')
  } catch (err) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) }
  }

  try {
    const idToken = await getAnonymousIdToken()

    // Full replacement — Asi always sends the complete current state.
    const existingIds = await listAllDocIds(idToken)
    await commitWrites(idToken, existingIds.map((id) => ({ delete: docName(id) })))

    const now = new Date().toISOString()
    const items = []
    for (const category of CATEGORIES) {
      const list = Array.isArray(payload[category]) ? payload[category] : []
      for (const item of list) items.push({ ...item, category })
    }

    const createWrites = items.map((item) => ({
      update: { name: docName(randomUUID()), fields: buildFields(item, now) },
    }))
    await commitWrites(idToken, createWrites)

    return { statusCode: 200, body: JSON.stringify({ ok: true }) }
  } catch (err) {
    console.error('asi-sync error:', err)
    return { statusCode: 500, body: JSON.stringify({ error: 'Internal error' }) }
  }
}
