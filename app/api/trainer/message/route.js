import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

async function getTrainerUser() {
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
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.email !== process.env.TRAINER_EMAIL) return null
  return user
}

export async function POST(request) {
  const trainer = await getTrainerUser()
  if (!trainer) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { clientId, content } = await request.json()
  if (!content?.trim()) return Response.json({ error: 'Empty message' }, { status: 400 })

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  const { data: message, error } = await db
    .from('messages')
    .insert({ client_id: clientId, role: 'assistant', content: content.trim() })
    .select()
    .single()

  if (error) return Response.json({ error: 'Failed to save' }, { status: 500 })

  return Response.json({ message })
}
