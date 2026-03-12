import { useEffect, useState } from 'react'
import { api } from '../lib/api'

interface TeamMember {
  id: string
  email: string
  role: string
  createdAt: string
}

export function TeamPage() {
  const [members, setMembers] = useState<TeamMember[]>([])
  const [loading, setLoading] = useState(true)
  const [showInvite, setShowInvite] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [invitePassword, setInvitePassword] = useState('')
  const [inviteRole, setInviteRole] = useState<'member' | 'admin'>('member')

  async function loadMembers() {
    try {
      const res = await api.get('/users')
      setMembers(res.data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadMembers()
  }, [])

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    await api.post('/users/invite', {
      email: inviteEmail,
      temporaryPassword: invitePassword,
      role: inviteRole,
    })
    setInviteEmail('')
    setInvitePassword('')
    setShowInvite(false)
    loadMembers()
  }

  async function handleRemove(id: string) {
    if (!confirm('Remove this team member?')) return
    await api.delete(`/users/${id}`)
    loadMembers()
  }

  if (loading) return <div className="text-center py-12 text-gray-500">Loading...</div>

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Team Members</h1>
        <button
          onClick={() => setShowInvite(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700"
        >
          + Invite Member
        </button>
      </div>

      {showInvite && (
        <form onSubmit={handleInvite} className="bg-white border border-gray-200 rounded-lg p-4 mb-6 space-y-3">
          <div className="flex gap-3">
            <input
              type="email"
              placeholder="Email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm"
              required
            />
            <input
              type="text"
              placeholder="Temporary password"
              value={invitePassword}
              onChange={(e) => setInvitePassword(e.target.value)}
              className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm"
              required
              minLength={8}
            />
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as 'member' | 'admin')}
              className="border border-gray-300 rounded-md px-3 py-2 text-sm"
            >
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div className="flex gap-3">
            <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm">
              Send Invite
            </button>
            <button type="button" onClick={() => setShowInvite(false)} className="text-gray-500 text-sm">
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="bg-white border border-gray-200 rounded-lg">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b">
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Joined</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id} className="border-b border-gray-50">
                <td className="px-4 py-3">{m.email}</td>
                <td className="px-4 py-3 capitalize">{m.role}</td>
                <td className="px-4 py-3">{new Date(m.createdAt).toLocaleDateString()}</td>
                <td className="px-4 py-3 text-right">
                  {m.role !== 'owner' && (
                    <button
                      onClick={() => handleRemove(m.id)}
                      className="text-red-600 hover:text-red-700 text-xs"
                    >
                      Remove
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
