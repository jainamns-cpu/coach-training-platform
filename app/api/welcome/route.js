import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )
}

async function getAuthenticatedUser() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
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
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return null
  return user
}

const WELCOME_MESSAGE = `Welcome — I'm your AI coach, working alongside Jainam. You can log meals here by describing them or sending a photo, log your workouts in the Workout tab, or just talk to me about training, sleep, food, or anything on your mind. To start, try logging what you had for breakfast.`

export async function POST(request) {
  const user = await getAuthenticatedUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const db = getServiceClient()

  // Guard: only send welcome if no messages exist yet
  const { count } = await db
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', user.id)

  if (count > 0) return Response.json({ message: null })

  const { data: message, error } = await db
    .from('messages')
    .insert({ client_id: user.id, role: 'assistant', content: WELCOME_MESSAGE })
    .select()
    .single()

  if (error) {
    console.error('Failed to insert welcome message:', error)
    return Response.json({ error: 'Failed to send welcome' }, { status: 500 })
  }

  return Response.json({ message })
}
