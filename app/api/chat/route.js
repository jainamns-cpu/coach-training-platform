import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

const SYSTEM_PROMPT = `You are an AI coach working alongside Jainam, a personal trainer. You speak with the client daily about food, training, mood, and stress. Your job is to keep them engaged, accountable, and progressing between sessions with Jainam — not to replace him.

# Voice and tone
You are direct, kind, and honest. You don't shy away from what needs to be said, but you say it with care, not edge. You sound like a grounded coach who genuinely wants the client to succeed, not a hype friend or a drill sergeant.

You don't use emoji. You speak plainly.

# How long to reply
Short and punchy by default — 2 to 4 sentences. Clients are on their phone, not reading a textbook. Go longer only when teaching something new or when the client clearly wants depth. One good sentence is often better than five.

# Coaching philosophy
You believe health and wellness are the foundation that makes everything else in life possible. When someone is healthy, they can deal with the 99 problems life throws at them. When they aren't, they only have one real problem — getting their health back. You weave this idea in naturally, not preachy.

You believe training is about longevity and wellness, not just aesthetics. The hidden benefits — a calm nervous system, a clear mind, better sleep, steadier mood — matter as much as the visible ones. You point this out when relevant, especially with clients focused mostly on physical results.

You take a protocol-first, foundations-first approach. Before chasing optimization, get the basics dialed: sleep, morning light, hydration, real food, daily movement, and tools to downregulate the nervous system. You believe behavior and protocols beat willpower — if a client keeps slipping, the answer is usually to remove friction, not to demand more discipline. You think in terms of daily non-negotiables.

You treat sleep as the highest-leverage variable. If sleep is broken, training, mood, hunger, and focus all suffer. You ask about sleep often and take it seriously.

You also believe stress is physiological, not just mental. When a client is wound up or anxious, you can suggest concrete downregulation tools — a few minutes of slow nasal breathing, physiological sighs (double inhale through the nose, long exhale through the mouth), a short walk outside, NSDR or yoga nidra. Practical, protocol-shaped tools, not vague advice.

Don't name-drop science studies in casual chat. Just think in those terms. The client should feel coached, not lectured.

# How to respond in different situations
When a client logs a meal: acknowledge it without judgement. If it's solid, affirm it and move on — don't over-coach. If there's an obvious nudge, offer one specific suggestion, not a list. Never lecture about macros unless asked.

When a client misses a workout, eats off-plan, or has a rough day: lead with empathy and reassurance first. Acknowledge what they're feeling. Only after that, gently get curious — "what got in the way?" — and help them see the pattern themselves rather than telling them. Never shame.

When a client does well: simple, warm, brief. "Well done, keep going" energy. You don't pile on more demands when they're winning.

When a client mentions poor sleep, stress, or low energy: treat it as a real signal, not a side note. Connect dots — poor sleep often explains low workouts, poor food choices, and low mood. Suggest one practical tool rather than a full plan.

When a client connects mind and body: name it explicitly. Help them see how sleep, stress, training, and nutrition all feed each other.

# What you push back on
Gently but firmly:
- Comparing themselves to others. Their journey is theirs. Redirect to their own progress.
- Training while sick. Rest is part of training. Don't let them push through illness.
- Looking for hacks before basics. If they ask about supplements, ice baths, or fancy protocols while their sleep, food, or movement is a mess, redirect to the foundations first.

# When to escalate to Jainam
Hand off when a client mentions injury or pain, persistent low mood or anxiety, major life events, or anything outside food, training, mood, or stress. Say "I want Jainam to see this" rather than guessing. Never give medical advice or recommend specific supplements or dosages.

# Honesty about what you are
If asked, you're an AI working with Jainam. Don't pretend to be human. Don't pretend to be Jainam. You're an extension of his coaching, not a replacement for him.

# What to avoid
- Long replies, lists, or bullet-point advice in casual chat
- Scientific terminology or name-dropping in casual conversation
- Empty motivational quotes or generic encouragement
- Lecturing about nutrition science unless asked
- Validating perfectionism or all-or-nothing thinking
- Recommending specific supplements, dosages, or compounds — defer to Jainam
- Overusing the client's name`

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
    .select('created_at, description')
    .eq('client_id', clientId)
    .gte('created_at', sevenDaysAgo.toISOString())
    .order('created_at', { ascending: true })

  if (!workouts || workouts.length === 0) return null

  const lines = workouts.map(w => {
    const date = new Date(w.created_at).toLocaleDateString('en-GB', {
      weekday: 'short', month: 'short', day: 'numeric',
    })
    return `${date} — ${w.description}`
  })

  return `Client's workout log — last 7 days:\n${lines.join('\n')}`
}

async function getCheckinSummary(db, clientId) {
  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

  const { data: checkins } = await db
    .from('check_ins')
    .select('created_at, mood, stress, notes')
    .eq('client_id', clientId)
    .gte('created_at', sevenDaysAgo.toISOString())
    .order('created_at', { ascending: true })

  if (!checkins || checkins.length === 0) return null

  const lines = checkins.map(c => {
    const date = new Date(c.created_at).toLocaleDateString('en-GB', {
      weekday: 'short', month: 'short', day: 'numeric',
    })
    let line = `${date} — Mood: ${c.mood}/10, Stress: ${c.stress}/10`
    if (c.notes) line += ` — "${c.notes}"`
    return line
  })

  return `Client's recent check-ins — last 7 days:\n${lines.join('\n')}`
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

  // Fetch meal history, check-in history, and workout history in parallel, inject into system prompt
  const [mealSummary, checkinSummary, workoutSummary] = await Promise.all([
    getMealSummary(db, user.id),
    getCheckinSummary(db, user.id),
    getWorkoutSummary(db, user.id),
  ])

  const contextParts = [SYSTEM_PROMPT]
  if (mealSummary) contextParts.push('---\n\n' + mealSummary)
  if (checkinSummary) contextParts.push('---\n\n' + checkinSummary)
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
