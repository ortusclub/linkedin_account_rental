import { Link } from 'react-router-dom'
import type { LinkedInAccount, BrowserProfile } from '@linkedin-rental/shared'

interface Props {
  account: LinkedInAccount & { profile?: BrowserProfile | null }
}

const statusColors: Record<string, string> = {
  active: 'bg-green-100 text-green-800',
  suspended: 'bg-red-100 text-red-800',
  needs_reauth: 'bg-yellow-100 text-yellow-800',
}

export function AccountCard({ account }: Props) {
  const profile = account.profile
  const extensionCount = profile?.installedExtensions
    ? (profile.installedExtensions as unknown[]).length
    : 0
  const proxyDisplay = profile?.proxy
    ? `${profile.proxy.host}:${profile.proxy.port}`
    : 'No proxy'

  return (
    <Link
      to={`/dashboard/accounts/${account.id}`}
      className="block bg-white rounded-lg border border-gray-200 p-5 hover:shadow-md transition-shadow"
    >
      <div className="flex justify-between items-start mb-3">
        <h3 className="font-semibold text-gray-900">{account.displayName}</h3>
        <span
          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusColors[account.status] || 'bg-gray-100 text-gray-800'}`}
        >
          {account.status}
        </span>
      </div>
      <div className="space-y-1 text-sm text-gray-500">
        <p>Proxy: {proxyDisplay}</p>
        <p>Extensions: {extensionCount} installed</p>
        {profile?.lastLaunched && (
          <p>Last used: {new Date(profile.lastLaunched).toLocaleDateString()}</p>
        )}
      </div>
    </Link>
  )
}
