import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { COACH_SYSTEM_PROMPT } from '@/lib/coachPrompt'

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

// Pulls the last 7 days of photo-logged meals and formats them as a
// plain-text summary that gets injected into Claude's system prompt
async function getMealSummary(db, clientId) {
  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

  const { data: meals } = await db
    .from('meals')
    .select('created_at, parsed_macros')
    .eq('client_id', clientId)
    .gte('created_at', sevenDaysAgo.toISOString())
    .not('parsed_macros', 'is', null)
    .order('created_at', { ascending: true })

  if (!meals || meals.length === 0) return null

  const mealLines = meals.map(m => {
    const date = new Date(m.created_at).toLocaleDateString('en-GB', {
      weekday: 'short', month: 'short', day: 'numeric',
    })
    const { foods, protein, carbs, fat, calories } = m.parsed_macros
    return `${date} — ${foods.join(', ')} (P:${protein}g C:${carbs}g F:${fat}g ~${calories} cal)`
  })

  // Average across unique days that have logs
  const uniqueDays = new Set(meals.map(m => new Date(m.created_at).toDateString())).size
  const days = Math.max(1, uniqueDays)
  const avg = (key) => Math.round(meals.reduce((sum, m) => sum + (m.parsed_macros[key] || 0), 0) / days)

  return `Client's photo meal log — last 7 days:
${mealLines.join('\n')}

Daily averages: ~${avg('protein')}g protein · ~${avg('carbs')}g carbs · ~${avg('fat')}g fat · ~${avg('calories')} cal`
}

async function getWorkoutSummary(db, clientId) {
  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

  const { data: workouts } = await db
    .from('workouts')
    .select('created_at, description, workout_type, intensity, duration_minutes')
    .eq('client_id', clientId)
    .gte('created_at', sevenDaysAgo.toISOString())
    .order('created_at', { ascending: true })

  if (!workouts || workouts.length === 0) return null

  const lines = workouts.map(w => {
    const date = new Date(w.created_at).toLocaleDateString('en-GB', {
      weekday: 'short', month: 'short', day: 'numeric',
    })
    const tags = [
      w.workout_type,
      w.intensity,
      w.duration_minutes ? `${w.duration_minutes} min` : null,
    ].filter(Boolean).join(' · ')
    return `${date} — ${w.description}${tags ? ` (${tags})` : ''}`
  })

  return `Client's workout log — last 7 days:\n${lines.join('\n')}`
}


export async function POST(request) {
  const user = await getAuthenticatedUser()
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { content } = await request.json()
  if (!content?.trim()) {
    return Response.json({ error: 'Empty message' }, { status: 400 })
  }

  const db = getServiceClient()

  // Save the user's message
  const { data: userMsg, error: userInsertError } = await db
    .from('messages')
    .insert({ client_id: user.id, role: 'user', content: content.trim() })
    .select()
    .single()

  if (userInsertError) {
    console.error('Failed to save user message:', userInsertError)
    return Response.json({ error: 'Failed to save message' }, { status: 500 })
  }

  // If the trainer has jumped in, skip Claude — they're handling it directly
  const { data: clientRecord } = await db
    .from('clients')
    .select('trainer_active')
    .eq('id', user.id)
    .single()

  if (clientRecord?.trainer_active) {
    return Response.json({ userMessage: userMsg, assistantMessage: null })
  }

  // Fetch the last 10 messages for conversation context
  const { data: history } = await db
    .from('messages')
    .select('role, content')
    .eq('client_id', user.id)
    .order('created_at', { ascending: false })
    .limit(10)

  const contextMessages = (history || []).reverse()

  // Fetch meal history and workout history in parallel, inject into system prompt
  const [mealSummary, workoutSummary] = await Promise.all([
    getMealSummary(db, user.id),
    getWorkoutSummary(db, user.id),
  ])

  const contextParts = [COACH_SYSTEM_PROMPT]
  if (mealSummary) contextParts.push('---\n\n' + mealSummary)
  if (workoutSummary) contextParts.push('---\n\n' + workoutSummary)
  const fullSystemPrompt = contextParts.join('\n\n')

  // Call Claude
  const anthropic = new Anthropic()
  let claudeResponse
  try {
    claudeResponse = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 1024,
      system: fullSystemPrompt,
      messages: contextMessages,
    })
  } catch (err) {
    console.error('Anthropic error:', err)
    return Response.json({ error: 'AI unavailable' }, { status: 502 })
  }

  const assistantContent = claudeResponse.content[0].text
  console.log('Token usage:', claudeResponse.usage)

  // Save Claude's reply
  const { data: assistantMsg, error: assistantInsertError } = await db
    .from('messages')
    .insert({ client_id: user.id, role: 'assistant', content: assistantContent })
    .select()
    .single()

  if (assistantInsertError) {
    console.error('Failed to save assistant message:', assistantInsertError)
    return Response.json({ error: 'Failed to save response' }, { status: 500 })
  }

  return Response.json({ userMessage: userMsg, assistantMessage: assistantMsg })
}
