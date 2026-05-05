import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

const PHOTO_PROMPT = `The client has sent a photo of their meal.

Identify the foods visible, estimate portion sizes, and calculate macros. Be honest if you're uncertain — give your best estimate and round to the nearest 5g for macros.

Reply as the coach first — warm, direct, brief, no emoji. Then on a new line provide the structured data.

Use this exact format:
COACH: [your reply here]
MACROS: {"foods": ["food 1", "food 2"], "protein": 0, "carbs": 0, "fat": 0, "calories": 0}

If you genuinely cannot identify the food, say so in COACH and write MACROS: null`

const TEXT_PROMPT = `The client has described a meal in text.

Estimate portion sizes and calculate macros based on the description. Be honest if you're uncertain — give your best estimate and round to the nearest 5g for macros.

Reply as the coach first — warm, direct, brief, no emoji. Then on a new line provide the structured data.

Use this exact format:
COACH: [your reply here]
MACROS: {"foods": ["food 1", "food 2"], "protein": 0, "carbs": 0, "fat": 0, "calories": 0}

If the description is too vague to estimate, say so in COACH and write MACROS: null`

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

export async function POST(request) {
  const user = await getAuthenticatedUser()
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { imagePath, textDescription } = await request.json()
  if (!imagePath && !textDescription) {
    return Response.json({ error: 'No image or description provided' }, { status: 400 })
  }

  const db = getServiceClient()
  const anthropic = new Anthropic()
  let claudeResponse

  if (imagePath) {
    // Photo path: generate a 60-second signed URL so Claude can fetch the private image
    const { data: signedData, error: signedError } = await db.storage
      .from('meal-photos')
      .createSignedUrl(imagePath, 60)

    if (signedError || !signedData?.signedUrl) {
      console.error('Signed URL error:', signedError)
      return Response.json({ error: 'Failed to access image' }, { status: 500 })
    }

    try {
      claudeResponse = await anthropic.messages.create({
        model: 'claude-sonnet-4-5',
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'url', url: signedData.signedUrl },
            },
            {
              type: 'text',
              text: PHOTO_PROMPT,
            },
          ],
        }],
      })
    } catch (err) {
      console.error('Anthropic error:', err)
      return Response.json({ error: 'AI unavailable' }, { status: 502 })
    }
  } else {
    // Text path: describe the meal in words
    try {
      claudeResponse = await anthropic.messages.create({
        model: 'claude-sonnet-4-5',
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: `Meal description: ${textDescription.trim()}`,
        }],
        system: TEXT_PROMPT,
      })
    } catch (err) {
      console.error('Anthropic error:', err)
      return Response.json({ error: 'AI unavailable' }, { status: 502 })
    }
  }

  console.log('Meal token usage:', claudeResponse.usage)

  const rawText = claudeResponse.content[0].text

  // Split Claude's response into the coaching reply and the macro data
  const coachMatch = rawText.match(/COACH:\s*([\s\S]*?)(?=\nMACROS:|$)/)
  const macrosMatch = rawText.match(/MACROS:\s*(\{[\s\S]*?\}|null)/)

  const coachText = coachMatch ? coachMatch[1].trim() : rawText.trim()
  let macros = null
  if (macrosMatch && macrosMatch[1] !== 'null') {
    try {
      macros = JSON.parse(macrosMatch[1])
    } catch (e) {
      console.error('Failed to parse macros:', e)
    }
  }

  // Save the coach reply to the messages table (for chat context)
  const { data: assistantMsg, error: msgError } = await db
    .from('messages')
    .insert({ client_id: user.id, role: 'assistant', content: coachText })
    .select()
    .single()

  if (msgError) {
    console.error('Failed to save message:', msgError)
    return Response.json({ error: 'Failed to save message' }, { status: 500 })
  }

  // Save the meal record
  const { error: mealInsertError } = await db.from('meals').insert({
    client_id: user.id,
    photo_url: imagePath || null,
    parsed_macros: macros,
    raw_text: textDescription || rawText,
  })

  if (mealInsertError) {
    console.error('Failed to save meal:', mealInsertError)
    return Response.json({ error: 'Failed to save meal', detail: mealInsertError.message }, { status: 500 })
  }

  return Response.json({ assistantMessage: assistantMsg, macros })
}
