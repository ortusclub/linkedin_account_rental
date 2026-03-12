import { create } from 'zustand'
import { api } from '../lib/api'

interface AuthState {
  accessToken: string | null
  user: { id: string; email: string; role: string } | null
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string, orgName: string) => Promise<void>
  logout: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: localStorage.getItem('accessToken'),
  user: JSON.parse(localStorage.getItem('user') || 'null'),

  login: async (email, password) => {
    const res = await api.post('/auth/login', { email, password })
    const { accessToken, refreshToken, user } = res.data
    localStorage.setItem('accessToken', accessToken)
    localStorage.setItem('refreshToken', refreshToken)
    localStorage.setItem('user', JSON.stringify(user))
    set({ accessToken, user })
  },

  register: async (email, password, orgName) => {
    const res = await api.post('/auth/register', { email, password, orgName })
    const { accessToken, refreshToken, user } = res.data
    localStorage.setItem('accessToken', accessToken)
    localStorage.setItem('refreshToken', refreshToken)
    localStorage.setItem('user', JSON.stringify(user))
    set({ accessToken, user })
  },

  logout: () => {
    localStorage.removeItem('accessToken')
    localStorage.removeItem('refreshToken')
    localStorage.removeItem('user')
    set({ accessToken: null, user: null })
  },
}))
