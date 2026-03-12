import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './hooks/use-auth-store'
import { LoginPage } from './pages/LoginPage'
import { DashboardPage } from './pages/DashboardPage'
import { AccountDetailPage } from './pages/AccountDetailPage'
import { TeamPage } from './pages/TeamPage'
import { Layout } from './components/Layout'

export function App() {
  const isAuthenticated = useAuthStore((s) => !!s.accessToken)

  if (!isAuthenticated) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    )
  }

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/dashboard/accounts/:id" element={<AccountDetailPage />} />
        <Route path="/dashboard/team" element={<TeamPage />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Route>
    </Routes>
  )
}
