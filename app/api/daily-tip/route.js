import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

const PRIVATE_NO_STORE = { 'Cache-Control': 'private, no-store' }

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

const TIP_PROMPT = `Write one practical nutrition or health tip, 1–2 sentences, the kind a person getting in shape would find genuinely useful — food nutrient facts, smart swaps, timing tricks, portion context. Concrete and specific (e.g. "Guava has more vitamin C than oranges and ~9g fiber per cup — solid snack when cutting"). Vary topics day to day. Never recommend or dose supplements; food-level education only. No preamble, no emoji, just the tip.`

export async function GET() {
  const user = await getAuthenticatedUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: PRIVATE_NO_STORE })
  }

  const anthropic = new Anthropic()
  let tip

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 100,
      temperature: 1,
      messages: [{ role: 'user', content: 'Give me today\'s tip.' }],
      system: TIP_PROMPT,
    })
    tip = response.content[0]?.text?.trim()
    if (!tip) throw new Error('Empty response')
  } catch (err) {
    console.error('Daily tip error:', err)
    return NextResponse.json({ error: 'Unavailable' }, { status: 502, headers: PRIVATE_NO_STORE })
  }

  return NextResponse.json({ tip }, { headers: PRIVATE_NO_STORE })
}
