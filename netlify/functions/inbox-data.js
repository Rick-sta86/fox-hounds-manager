// inbox-data.js — GET endpoint that returns the current Gist inbox data
// Proxies through GitHub API so the client never needs a token and there's no CDN caching

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  }

  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) }
  }

  const gistId = process.env.GITHUB_GIST_ID
  const token  = process.env.GITHUB_TOKEN

  if (!gistId || !token) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Missing GITHUB_GIST_ID or GITHUB_TOKEN env vars' }) }
  }

  try {
    const res = await fetch(`https://api.github.com/gists/${gistId}`, {
      headers: {
        Authorization: `token ${token}`,
        Accept: 'application/vnd.github.v3+json',
      },
    })

    if (!res.ok) {
      const msg = await res.text()
      return { statusCode: res.status, headers, body: JSON.stringify({ error: msg }) }
    }

    const gist    = await res.json()
    const content = gist.files?.['inbox.json']?.content

    if (!content) {
      return { statusCode: 404, headers, body: JSON.stringify({ error: 'inbox.json not found in Gist' }) }
    }

    // Parse and re-serialise so we return clean JSON
    const parsed = JSON.parse(content)
    return { statusCode: 200, headers, body: JSON.stringify(parsed) }

  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) }
  }
}
