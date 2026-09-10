const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api'

function getToken() {
  if (typeof window === 'undefined') return null
  return window.localStorage.getItem('sppg_token')
}

async function request(path, options = {}) {
  const token = getToken()
  const headers = { ...(options.headers || {}) }

  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json'
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const response = await fetch(`${API_BASE}${path}`, { ...options, headers })
  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new Error(data.error || 'Terjadi kesalahan pada server')
  }

  return data
}

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: 'POST', body: body instanceof FormData ? body : JSON.stringify(body) }),
  postForm: (path, formData) => request(path, { method: 'POST', body: formData })
}
