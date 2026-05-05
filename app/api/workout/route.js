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

const WORKOUT_PROMPT = `You are an AI coach. The client just logged a workout. Reply with 2-3 warm, direct sentences acknowledging what they did. Be specific if details are given. No emoji, no lists, no lecture — just a brief, grounded response that feels like a coach who was there.`

export async function POST(request) {
  const user = await getAuthenticatedUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { description } = await request.json()
  if (!description?.trim()) return Response.json({ error: 'No description' }, { status: 400 })

  const db = getServiceClient()

  // Call Claude for a brief acknowledgment
  const anthropic = new Anthropic()
  let reply = null
  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 256,
      messages: [{
        role: 'user',
        content: `Workout logged: ${description.trim()}`,
      }],
      system: WORKOUT_PROMPT,
    })
    reply = response.content[0].text
  } catch (err) {
    console.error('Anthropic error:', err)
    // Still save the workout even if Claude fails
  }

  // Save to workouts table
  const { data: workout, error: insertError } = await db
    .from('workouts')
    .insert({
      client_id: user.id,
      description: description.trim(),
      coach_reply: reply,
    })
    .select()
    .single()

  if (insertError) {
    console.error('Failed to save workout:', insertError)
    return Response.json({ error: insertError.message || 'Failed to save' }, { status: 500 })
  }

  return Response.json({ workout, reply })
}
