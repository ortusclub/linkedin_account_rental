import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { AccountCard } from '../components/AccountCard'
import type { LinkedInAccount, BrowserProfile } from '@linkedin-rental/shared'

type AccountWithProfile = LinkedInAccount & { profile?: BrowserProfile | null }

export function DashboardPage() {
  const [accounts, setAccounts] = useState<AccountWithProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)

  async function loadAccounts() {
    try {
      const res = await api.get('/accounts')
      setAccounts(res.data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAccounts()
  }, [])

  async function createAccount(e: React.FormEvent) {
    e.preventDefault()
    setCreating(true)
    try {
      await api.post('/accounts', { displayName: newName })
      setNewName('')
      setShowCreate(false)
      loadAccounts()
    } finally {
      setCreating(false)
    }
  }

  if (loading) {
    return <div className="text-center py-12 text-gray-500">Loading accounts...</div>
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">LinkedIn Accounts</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700"
        >
          + New Account
        </button>
      </div>

      {showCreate && (
        <form onSubmit={createAccount} className="bg-white border border-gray-200 rounded-lg p-4 mb-6 flex gap-3">
          <input
            type="text"
            placeholder="Display name (e.g. John Doe — Sales)"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm"
            required
          />
          <button
            type="submit"
            disabled={creating}
            className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            Create
          </button>
          <button
            type="button"
            onClick={() => setShowCreate(false)}
            className="text-gray-500 px-3 py-2 text-sm hover:text-gray-700"
          >
            Cancel
          </button>
        </form>
      )}

      {accounts.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          No accounts yet. Create your first LinkedIn account profile.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {accounts.map((account) => (
            <AccountCard key={account.id} account={account} />
          ))}
        </div>
      )}
    </div>
  )
}
