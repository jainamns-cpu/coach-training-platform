import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import TrainerChatView from './TrainerChatView'

export default async function TrainerClientPage({ params }) {
  const { clientId } = await params

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

  const [{ data: client }, { data: messages }] = await Promise.all([
    db.from('clients').select('*').eq('id', clientId).single(),
    db.from('messages').select('*').eq('client_id', clientId).order('created_at', { ascending: true }),
  ])

  if (!client) redirect('/trainer')

  return <TrainerChatView client={client} initialMessages={messages || []} />
}
