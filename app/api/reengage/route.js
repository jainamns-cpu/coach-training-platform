import Anthropic from '@anthropic-ai/sdk'
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

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000

export async function POST() {
  const user = await getAuthenticatedUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const db = getServiceClient()
  const q = (query, fallback) => Promise.resolve(query).catch(() => fallback)

  // Fetch most recent message, meal, and workout in parallel
  const [lastMsgRes, lastMealRes, lastWorkoutRes] = await Promise.all([
    q(db.from('messages')
      .select('role, content, created_at')
      .eq('client_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(), { data: null }),
    q(db.from('meals')
      .select('created_at')
      .eq('client_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(), { data: null }),
    q(db.from('workouts')
      .select('created_at')
      .eq('client_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(), { data: null }),
  ])

  const lastMsg     = lastMsgRes.data
  const lastMeal    = lastMealRes.data
  const lastWorkout = lastWorkoutRes.data

  // Guard: if the last message is already from the assistant, skip —
  // coach has already reached out and client hasn't replied yet
  if (lastMsg?.role === 'assistant') return Response.json({ message: null })

  // Find most recent activity timestamp across all three
  const timestamps = [
    lastMsg?.created_at,
    lastMeal?.created_at,
    lastWorkout?.created_at,
  ].filter(Boolean).map(t => new Date(t).getTime())

  if (timestamps.length === 0) return Response.json({ message: null })

  const mostRecentActivity = Math.max(...timestamps)
  const daysSilent = (Date.now() - mostRecentActivity) / THREE_DAYS_MS

  // Not quiet enough — client is still active
  if (daysSilent < 1) return Response.json({ message: null })

  // Work out what went quiet to give Claude something specific
  const quietSince = Math.floor((Date.now() - mostRecentActivity) / (24 * 60 * 60 * 1000))
  const wentQuiet = []
  if (!lastMeal    || (Date.now() - new Date(lastMeal.created_at).getTime())    > THREE_DAYS_MS) wentQuiet.push('meal logging')
  if (!lastWorkout || (Date.now() - new Date(lastWorkout.created_at).getTime()) > THREE_DAYS_MS) wentQuiet.push('workout logging')
  if (!lastMsg     || (Date.now() - new Date(lastMsg.created_at).getTime())     > THREE_DAYS_MS) wentQuiet.push('chat')

  const quietContext = wentQuiet.length > 0
    ? `What went quiet: ${wentQuiet.join(', ')}. Days since last activity: ${quietSince}.`
    : `Days since last activity: ${quietSince}.`

  const REENGAGE_PROMPT = `You are an AI coach. A client has gone quiet for a few days. Write 1–2 sentences checking in — warm, direct, specific to what went quiet. Never guilt-trip. Sound like a coach who noticed, not a system alert. No emoji, no preamble.`

  const anthropic = new Anthropic()
  let content

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 80,
      system: REENGAGE_PROMPT,
      messages: [{ role: 'user', content: quietContext }],
    })
    content = response.content[0]?.text?.trim()
    if (!content) throw new Error('Empty response')
  } catch (err) {
    console.error('Re-engage error:', err)
    return Response.json({ message: null })
  }

  const { data: message, error } = await db
    .from('messages')
    .insert({ client_id: user.id, role: 'assistant', content })
    .select()
    .single()

  if (error) {
    console.error('Failed to insert re-engagement message:', error)
    return Response.json({ message: null })
  }

  return Response.json({ message })
}
