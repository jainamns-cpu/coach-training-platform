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

  const { clientId, name, profileNotes, targets } = await request.json()
  if (!clientId) return Response.json({ error: 'Missing clientId' }, { status: 400 })

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  const updateData = {}
  if (name !== undefined) updateData.name = name
  if (profileNotes !== undefined) updateData.profile_notes = profileNotes
  if (targets?.calories !== undefined) updateData.target_calories = targets.calories
  if (targets?.protein  !== undefined) updateData.target_protein  = targets.protein
  if (targets?.carbs    !== undefined) updateData.target_carbs    = targets.carbs
  if (targets?.fat      !== undefined) updateData.target_fat      = targets.fat

  const { error } = await db
    .from('clients')
    .update(updateData)
    .eq('id', clientId)

  if (error) {
    console.error('Failed to update profile:', error)
    return Response.json({ error: 'Failed to update' }, { status: 500 })
  }

  return Response.json({ success: true })
}
