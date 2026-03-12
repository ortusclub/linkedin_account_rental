const BASE_URL = '/api/v1'

class ApiClient {
  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    const token = localStorage.getItem('accessToken')
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }
    return headers
  }

  async get(path: string) {
    const res = await fetch(`${BASE_URL}${path}`, { headers: this.getHeaders() })
    if (!res.ok) throw await res.json()
    return res.json()
  }

  async post(path: string, body?: unknown) {
    const res = await fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: body ? JSON.stringify(body) : undefined,
    })
    if (!res.ok) throw await res.json()
    return res.json()
  }

  async patch(path: string, body: unknown) {
    const res = await fetch(`${BASE_URL}${path}`, {
      method: 'PATCH',
      headers: this.getHeaders(),
      body: JSON.stringify(body),
    })
    if (!res.ok) throw await res.json()
    return res.json()
  }

  async delete(path: string) {
    const res = await fetch(`${BASE_URL}${path}`, {
      method: 'DELETE',
      headers: this.getHeaders(),
    })
    if (!res.ok) throw await res.json()
    return res.json()
  }
}

export const api = new ApiClient()
