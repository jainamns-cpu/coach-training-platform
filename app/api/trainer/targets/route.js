import Anthropic from '@anthropic-ai/sdk'
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

const TARGETS_PROMPT = `You are an experienced personal trainer setting daily macro targets for a client. Based on the client profile provided, suggest appropriate daily targets.

Reply with ONLY this format, nothing else:
CALORIES: [number]
PROTEIN: [number]
CARBS: [number]
FAT: [number]

All values should be whole numbers. Protein, carbs, fat in grams. Calories in kcal.`

export async function POST(request) {
  const trainer = await getTrainerUser()
  if (!trainer) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { clientId, profileNotes } = await request.json()
  if (!clientId) return Response.json({ error: 'Missing clientId' }, { status: 400 })

  // Get current client data
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  const { data: clientData } = await db
    .from('clients')
    .select('name, email')
    .eq('id', clientId)
    .single()

  // Ask Claude to generate targets
  const anthropic = new Anthropic()
  let claudeResponse
  try {
    claudeResponse = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 256,
      system: TARGETS_PROMPT,
      messages: [{
        role: 'user',
        content: `Client profile:\n${profileNotes || 'No profile notes provided.'}`,
      }],
    })
  } catch (err) {
    console.error('Anthropic error:', err)
    return Response.json({ error: 'AI unavailable' }, { status: 502 })
  }

  const text = claudeResponse.content[0].text
  const calories = parseInt(text.match(/CALORIES:\s*(\d+)/)?.[1] || '0')
  const protein  = parseInt(text.match(/PROTEIN:\s*(\d+)/)?.[1]  || '0')
  const carbs    = parseInt(text.match(/CARBS:\s*(\d+)/)?.[1]    || '0')
  const fat      = parseInt(text.match(/FAT:\s*(\d+)/)?.[1]      || '0')

  if (!calories || !protein) {
    return Response.json({ error: 'Failed to parse targets from AI response', raw: text }, { status: 500 })
  }

  return Response.json({ calories, protein, carbs, fat })
}
