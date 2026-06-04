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

const WORKOUT_PROMPT = `You are an AI coach acknowledging a workout the client just logged. Reply in 1-2 short sentences:

- One sentence acknowledging the session.
- Optionally, a second sentence with a small grounded observation (e.g. "lower body's been consistent this week" or "first cardio in a while").

Rules:
- Total reply: max two short sentences. No third sentence.
- Do NOT editorialize ("training X is one of the hardest things…", "consistency matters…", motivational filler).
- Do NOT end with a question UNLESS the client's description explicitly mentioned pain, fatigue, struggle, or something specific worth responding to.
- No emoji, no lists, no lecture, no closing pep talk.
- Voice: direct, warm, grounded. Like a trainer who was there and is moving on with their day.

Examples of the right length and tone:
- "Good. Legs done."
- "Solid session. Lower body's been consistent this week."
- "Done. Note how the knees feel tomorrow." (only because client mentioned knees)
- "Nice work. Pull day with rows is a good combo for you."

Examples of what NOT to do:
- "Good work getting that leg session done. Training legs consistently is one of the hardest things to stick with, so showing up matters. How are you feeling after it?" (too long, editorializes, asks an unearned question)`

export async function POST(request) {
  const user = await getAuthenticatedUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { description, workout_type, intensity, duration_minutes } = await request.json()
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
      workout_type:     workout_type     || null,
      intensity:        intensity        || null,
      duration_minutes: duration_minutes || null,
    })
    .select()
    .single()

  if (insertError) {
    console.error('Failed to save workout:', insertError)
    return Response.json({ error: insertError.message || 'Failed to save' }, { status: 500 })
  }

  return Response.json({ workout, reply })
}
