import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import type { LinkedInAccount, BrowserProfile, BrowserSession, BrowserFingerprint, InstalledExtension } from '@linkedin-rental/shared'

type FullAccount = LinkedInAccount & {
  profile?: BrowserProfile | null
  assignments?: { id: string; user: { id: string; email: string }; permission: string }[]
}

export function AccountDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [account, setAccount] = useState<FullAccount | null>(null)
  const [sessions, setSessions] = useState<BrowserSession[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const [accRes, sessRes] = await Promise.all([
          api.get(`/accounts/${id}`),
          api.get(`/sessions/${id}/history`),
        ])
        setAccount(accRes.data)
        setSessions(sessRes.data)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [id])

  async function handleDelete() {
    if (!confirm('Delete this account and its browser profile? This cannot be undone.')) return
    await api.delete(`/accounts/${id}`)
    navigate('/dashboard')
  }

  if (loading) return <div className="text-center py-12 text-gray-500">Loading...</div>
  if (!account) return <div className="text-center py-12 text-gray-500">Account not found</div>

  const profile = account.profile
  const fingerprint = profile?.fingerprint as unknown as BrowserFingerprint | undefined
  const extensions = (profile?.installedExtensions || []) as unknown as InstalledExtension[]

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">{account.displayName}</h1>
        <button
          onClick={handleDelete}
          className="text-red-600 hover:text-red-700 text-sm font-medium"
        >
          Delete Account
        </button>
      </div>

      {/* Status & Info */}
      <div className="bg-white border border-gray-200 rounded-lg p-6 grid grid-cols-2 gap-4">
        <div>
          <h3 className="text-sm font-medium text-gray-500">Status</h3>
          <p className="mt-1 font-medium">{account.status}</p>
        </div>
        <div>
          <h3 className="text-sm font-medium text-gray-500">LinkedIn Email</h3>
          <p className="mt-1">{account.linkedinEmail || 'Not set'}</p>
        </div>
        <div>
          <h3 className="text-sm font-medium text-gray-500">Notes</h3>
          <p className="mt-1 text-sm">{account.notes || 'None'}</p>
        </div>
        <div>
          <h3 className="text-sm font-medium text-gray-500">Created</h3>
          <p className="mt-1 text-sm">{new Date(account.createdAt).toLocaleDateString()}</p>
        </div>
      </div>

      {/* Fingerprint */}
      {fingerprint && (
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h2 className="text-lg font-semibold mb-4">Browser Fingerprint</h2>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><span className="text-gray-500">Platform:</span> {fingerprint.platform}</div>
            <div><span className="text-gray-500">Screen:</span> {fingerprint.screen.width}x{fingerprint.screen.height}</div>
            <div><span className="text-gray-500">Timezone:</span> {fingerprint.timezone}</div>
            <div><span className="text-gray-500">Locale:</span> {fingerprint.locale}</div>
            <div><span className="text-gray-500">Cores:</span> {fingerprint.hardwareConcurrency}</div>
            <div><span className="text-gray-500">Memory:</span> {fingerprint.deviceMemory}GB</div>
            <div className="col-span-2"><span className="text-gray-500">User Agent:</span> <span className="text-xs break-all">{fingerprint.userAgent}</span></div>
          </div>
        </div>
      )}

      {/* Extensions */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h2 className="text-lg font-semibold mb-4">Extensions ({extensions.length})</h2>
        {extensions.length === 0 ? (
          <p className="text-sm text-gray-500">No extensions installed. Extensions will appear here after you install them in the browser.</p>
        ) : (
          <ul className="space-y-2">
            {extensions.map((ext) => (
              <li key={ext.id} className="flex justify-between items-center text-sm border-b border-gray-100 pb-2">
                <span className="font-medium">{ext.name}</span>
                <span className="text-gray-500">v{ext.version}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Assigned Users */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h2 className="text-lg font-semibold mb-4">Assigned Users</h2>
        {account.assignments?.length === 0 ? (
          <p className="text-sm text-gray-500">No users assigned.</p>
        ) : (
          <ul className="space-y-2">
            {account.assignments?.map((a) => (
              <li key={a.id} className="flex justify-between items-center text-sm">
                <span>{a.user.email}</span>
                <span className="text-gray-500">{a.permission}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Session History */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h2 className="text-lg font-semibold mb-4">Session History</h2>
        {sessions.length === 0 ? (
          <p className="text-sm text-gray-500">No sessions yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b">
                <th className="pb-2">Started</th>
                <th className="pb-2">Ended</th>
                <th className="pb-2">Status</th>
                <th className="pb-2">IP</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.id} className="border-b border-gray-50">
                  <td className="py-2">{new Date(s.startedAt).toLocaleString()}</td>
                  <td className="py-2">{s.endedAt ? new Date(s.endedAt).toLocaleString() : '—'}</td>
                  <td className="py-2">{s.status}</td>
                  <td className="py-2">{s.ipAddress || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
