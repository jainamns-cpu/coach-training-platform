import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { COACH_SYSTEM_PROMPT } from '@/lib/coachPrompt'

const PRIVATE_NO_STORE = { 'Cache-Control': 'private, no-store' }

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

function timeAwareGreeting(name) {
  const hour = new Date().getHours()
  const safeName = name || 'there'
  if (hour < 12) return `Good morning, ${safeName}.`
  if (hour < 18) return `Hi, ${safeName}.`
  return `Good evening, ${safeName}.`
}

// Returns a human-readable relative date: "today", "yesterday", "2 days ago", etc.
function relativeDay(isoString) {
  const then = new Date(isoString)
  const today = new Date()
  then.setHours(0, 0, 0, 0)
  today.setHours(0, 0, 0, 0)
  const diffDays = Math.round((today - then) / (1000 * 60 * 60 * 24))
  if (diffDays === 0) return 'today'
  if (diffDays === 1) return 'yesterday'
  return `${diffDays} days ago`
}

// Builds a pre-aggregated prose summary to send to Claude — not raw rows
function buildSummary({ name, meals, checkins, messages }) {
  const now = new Date()
  const hour = now.getHours()
  const dayName = now.toLocaleDateString('en-GB', { weekday: 'long' })
  const timeOfDay = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening'

  const lines = [
    `Client name: ${name || 'unknown'}.`,
    `Time now: ${dayName} ${timeOfDay}.`,
    '',
  ]

  if (meals.length > 0) {
    // Aggregate: total calories/protein/carbs/fat, unique days logged
    const uniqueDays = new Set(meals.map(m => m.created_at.split('T')[0])).size
    const totals = meals.reduce((acc, m) => {
      const p = m.parsed_macros || {}
      return {
        calories: acc.calories + (p.calories || 0),
        protein:  acc.protein  + (p.protein  || 0),
        carbs:    acc.carbs    + (p.carbs    || 0),
        fat:      acc.fat      + (p.fat      || 0),
      }
    }, { calories: 0, protein: 0, carbs: 0, fat: 0 })

    const avgCal  = Math.round(totals.calories / uniqueDays)
    const avgProt = Math.round(totals.protein  / uniqueDays)
    const mostRecent = meals[0] // already ordered desc
    const recentFoods = mostRecent.parsed_macros?.foods?.join(', ') || mostRecent.raw_text || 'a meal'

    lines.push(`Meals (last 7 days): ${meals.length} logged across ${uniqueDays} day${uniqueDays !== 1 ? 's' : ''}. Average ${avgCal} kcal · ${avgProt}g protein per day. Most recent meal was ${relativeDay(mostRecent.created_at)}: ${recentFoods}.`)
  } else {
    lines.push('No meals logged in the last 7 days.')
  }

  if (checkins.length > 0) {
    const avgMood   = (checkins.reduce((s, c) => s + (c.mood   || 0), 0) / checkins.length).toFixed(1)
    const avgStress = (checkins.reduce((s, c) => s + (c.stress || 0), 0) / checkins.length).toFixed(1)
    const latest = checkins[0]
    let checkinLine = `Check-ins: ${checkins.length} in last 7 days. Average mood ${avgMood}/10, average stress ${avgStress}/10.`
    if (latest.notes) checkinLine += ` Most recent note (${relativeDay(latest.created_at)}): "${latest.notes.slice(0, 120)}".`
    lines.push(checkinLine)
  } else {
    lines.push('No check-ins in the last 7 days.')
  }

  if (messages.length > 0) {
    const recentSnippets = messages.slice(0, 3).map(m =>
      `"${m.content?.slice(0, 80)}"`
    )
    lines.push(`Recent messages from client (${relativeDay(messages[0].created_at)}): ${recentSnippets.join(' / ')}.`)
  } else {
    lines.push('No recent chat messages.')
  }

  return lines.join('\n')
}

export async function GET() {
  const user = await getAuthenticatedUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: PRIVATE_NO_STORE })
  }

  const db = getServiceClient()
  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
  const sevenDaysAgoISO = sevenDaysAgo.toISOString()

  // Fetch all recent activity in parallel.
  // Each query has its own .catch() so one failing query doesn't kill the rest —
  // partial data is better than no data for the greeting.
  const [mealsRes, checkinsRes, messagesRes, clientRes] = await Promise.all([
    db
      .from('meals')
      .select('raw_text, parsed_macros, created_at')
      .eq('client_id', user.id)
      .gte('created_at', sevenDaysAgoISO)
      .not('parsed_macros', 'is', null)
      .order('created_at', { ascending: false })
      .limit(20)
      .catch(() => ({ data: [] })),
    db
      .from('check_ins')
      .select('mood, stress, notes, created_at')
      .eq('client_id', user.id)
      .gte('created_at', sevenDaysAgoISO)
      .order('created_at', { ascending: false })
      .limit(7)
      .catch(() => ({ data: [] })),
    db
      .from('messages')
      .select('role, content, created_at')
      .eq('client_id', user.id)
      .eq('role', 'user')
      .gte('created_at', sevenDaysAgoISO)
      .order('created_at', { ascending: false })
      .limit(10)
      .catch(() => ({ data: [] })),
    db
      .from('clients')
      .select('name')
      .eq('id', user.id)
      .single()
      .catch(() => ({ data: null })),
  ])

  const meals    = mealsRes.data    || []
  const checkins = checkinsRes.data || []
  const messages = messagesRes.data || []
  const name     = clientRes.data?.name || null

  // New client — no data anywhere. Skip the API call entirely.
  if (meals.length === 0 && checkins.length === 0 && messages.length === 0) {
    return NextResponse.json(
      { greeting: timeAwareGreeting(name) },
      { headers: PRIVATE_NO_STORE }
    )
  }

  // Pre-aggregate into clean prose before sending to Claude
  const summary = buildSummary({ name, meals, checkins, messages })

  const GREETING_INSTRUCTION = `

---

You are now generating a brief, personalized home screen greeting for this client. Requirements:

- ONE or TWO short sentences only. Hard limit — do not exceed two sentences.
- Reference one specific thing from the client's recent activity: a pattern, a streak, a recent struggle, a recent win, something concrete. Not vague encouragement.
- If nothing notable stands out, greet them by name with a natural time-of-day acknowledgment.
- Plain language. No emoji. No bullet points. No lists. No hashtags.
- Do not initiate emotional or mood-related topics unprompted. Reference behavior and patterns (meals logged, days consistent, workout done), not feelings — unless the client already raised a feeling in their recent messages.
- Match the time of day naturally in your tone.
- Do not add a sign-off, a question, or a call to action. The greeting stands alone.

Output the greeting only — no preamble, no explanation, no quotation marks around it.`

  const anthropic = new Anthropic()
  let greeting

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 100,
      temperature: 0.8,
      system: COACH_SYSTEM_PROMPT + GREETING_INSTRUCTION,
      messages: [{
        role: 'user',
        content: `Generate the home screen greeting for this client based on the following summary:\n\n${summary}`,
      }],
    })

    greeting = response.content[0]?.text?.trim()
    if (!greeting) throw new Error('Empty response from Claude')
  } catch (err) {
    console.error('Recall greeting error:', err)
    greeting = timeAwareGreeting(name)
  }

  return NextResponse.json(
    { greeting },
    { headers: PRIVATE_NO_STORE }
  )
}
