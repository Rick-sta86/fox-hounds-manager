// Asi Inbox sync — Netlify Function
// Receives the full current state of Asi's email triage and replaces the
// `email_items` collection with it. Auth via shared secret header (x-asi-key).

import admin from 'firebase-admin'

if (!admin.apps.length) {
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT
  admin.initializeApp({
    credential: serviceAccountJson
      ? admin.credential.cert(JSON.parse(serviceAccountJson))
      : admin.credential.applicationDefault(),
    projectId: 'fox-hounds-manager',
  })
}

const db = admin.firestore()

const COLLECTION = 'email_items'
const CATEGORIES = ['needs_you', 'drafts', 'awaiting_reply', 'parked', 'actioned']
const BATCH_SIZE = 500

function getHeader(headers, name) {
  if (!headers) return undefined
  const key = Object.keys(headers).find((k) => k.toLowerCase() === name.toLowerCase())
  return key ? headers[key] : undefined
}

async function deleteAllDocs(collectionRef) {
  const snap = await collectionRef.get()
  for (let i = 0; i < snap.docs.length; i += BATCH_SIZE) {
    const batch = db.batch()
    snap.docs.slice(i, i + BATCH_SIZE).forEach((doc) => batch.delete(doc.ref))
    await batch.commit()
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
    const col = db.collection(COLLECTION)

    // Full replacement — Asi always sends the complete current state.
    await deleteAllDocs(col)

    const items = []
    for (const category of CATEGORIES) {
      const list = Array.isArray(payload[category]) ? payload[category] : []
      for (const item of list) items.push({ ...item, category })
    }

    for (let i = 0; i < items.length; i += BATCH_SIZE) {
      const batch = db.batch()
      items.slice(i, i + BATCH_SIZE).forEach((item) => {
        const { who, what, since, date, category } = item
        batch.set(col.doc(), {
          who: who || '',
          what: what || '',
          category,
          ...(since ? { since } : {}),
          ...(date ? { date } : {}),
          status: 'new',
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        })
      })
      await batch.commit()
    }

    return { statusCode: 200, body: JSON.stringify({ ok: true }) }
  } catch (err) {
    console.error('asi-sync error:', err)
    return { statusCode: 500, body: JSON.stringify({ error: 'Internal error' }) }
  }
}
