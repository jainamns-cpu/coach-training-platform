import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import Link from 'next/link'

function getStatus(lastMessageAt) {
  const now = new Date()
  const hours = lastMessageAt
    ? (now - new Date(lastMessageAt)) / (1000 * 60 * 60)
    : Infinity
  if (hours > 48) return 'red'
  if (hours <= 24) return 'green'
  return 'amber'
}

const statusDot = {
  green: 'bg-green-500',
  amber: 'bg-amber-400',
  red: 'bg-red-500',
}

export default async function TrainerPage() {
  const cookieStore = await cookies()
  const authClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await authClient.auth.getUser()
  if (!user || user.email !== process.env.TRAINER_EMAIL) redirect('/')

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  const { data: clients } = await db
    .from('clients')
    .select('*')
    .neq('email', process.env.TRAINER_EMAIL)
    .order('created_at', { ascending: false })

  const clientsWithStatus = await Promise.all(
    (clients || []).map(async (client) => {
      const { data: lastMsg } = await db.from('messages')
        .select('created_at')
        .eq('client_id', client.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      return {
        ...client,
        status: getStatus(lastMsg?.created_at),
        lastMessageAt: lastMsg?.created_at,
      }
    })
  )

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b p-4">
        <h1 className="font-semibold">Clients</h1>
      </header>
      <div className="p-4 space-y-3 max-w-lg mx-auto">
        {clientsWithStatus.length === 0 && (
          <p className="text-center text-gray-400 mt-8">No clients yet.</p>
        )}
        {clientsWithStatus.map(client => (
          <Link
            key={client.id}
            href={`/trainer/${client.id}`}
            className="block bg-white border rounded-2xl p-4"
          >
            <div className="flex items-center gap-4">
              <div className={`w-3 h-3 rounded-full flex-shrink-0 ${statusDot[client.status]}`} />
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{client.name || client.email}</p>
                <p className="text-sm text-gray-400">
                  {client.lastMessageAt
                    ? `Last active ${new Date(client.lastMessageAt).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}`
                    : 'No messages yet'}
                </p>
              </div>
              <svg className="h-5 w-5 text-gray-300 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
