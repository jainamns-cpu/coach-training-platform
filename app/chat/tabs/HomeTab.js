'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'

// Created once at module scope — safe to share, prevents a new client
// being constructed on every render and avoids footgun dependency array warnings.
const supabase = createClient()

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// 'YYYY-MM-DD' in the user's LOCAL timezone — avoids UTC-offset bugs when
// splitting on 'T' directly from ISO strings.
function toLocalDateStr(isoString) {
  return new Date(isoString).toLocaleDateString('en-CA')
}

// Compute streak: consecutive days (back from today or yesterday) with any
// logged activity. "Strict" semantics — no "at risk" state.
//   - Today has activity  → count back from today
//   - Today empty, yesterday has activity → count back from yesterday
//   - Both empty → 0
function computeStreak(activityDates) {
  const today = new Date()
  const todayStr = today.toLocaleDateString('en-CA')

  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  const yesterdayStr = yesterday.toLocaleDateString('en-CA')

  let startDate
  if (activityDates.has(todayStr)) {
    startDate = today
  } else if (activityDates.has(yesterdayStr)) {
    startDate = yesterday
  } else {
    return 0
  }

  let streak = 0
  const cursor = new Date(startDate)
  while (true) {
    const dayStr = cursor.toLocaleDateString('en-CA')
    if (activityDates.has(dayStr)) {
      streak++
      cursor.setDate(cursor.getDate() - 1)
    } else {
      break
    }
  }
  return streak
}

// Build the 7-day strip array — always exactly 7 items, oldest first.
// A day is "logged" if it has at least one meal.
function buildWeekDays(meals7) {
  const today    = new Date()
  const mealDates = new Set(meals7.map(m => toLocalDateStr(m.created_at)))

  const days = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(today.getDate() - i)
    const dateStr    = d.toLocaleDateString('en-CA')
    const loggedMeal = mealDates.has(dateStr)
    days.push({ dateStr, loggedMeal, isToday: i === 0 })
  }
  return days
}

// Human-readable relative day for RecentContext lines.
// "today" / "yesterday" / "N days ago"
function relativeDay(isoString) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const then = new Date(isoString)
  then.setHours(0, 0, 0, 0)
  const diffDays = Math.round((today - then) / (1000 * 60 * 60 * 24))
  if (diffDays === 0) return 'today'
  if (diffDays === 1) return 'yesterday'
  return `${diffDays} days ago`
}

// Shared time-of-day fallback — mirrors the logic in /api/recall-greeting.
// Inlined here so client code never imports from a server route.
function timeAwareGreeting(name) {
  const hour = new Date().getHours()
  const safeName = name || 'there'
  if (hour < 12) return `Good morning, ${safeName}.`
  if (hour < 18) return `Hi, ${safeName}.`
  return `Good evening, ${safeName}.`
}

// ---------------------------------------------------------------------------
// RecallGreeting — personalized one-liner at the top of the home screen.
// ---------------------------------------------------------------------------

const GREETING_TTL = 6 * 60 * 60 * 1000 // 6 hours in ms

function RecallGreeting({ clientId, displayName, isNewClient }) {
  const [greeting, setGreeting] = useState(() => timeAwareGreeting(displayName))

  useEffect(() => {
    if (!clientId || isNewClient) return

    let cancelled = false

    const today    = new Date().toLocaleDateString('en-CA')
    const cacheKey = `recallGreeting:${clientId}:${today}`

    try {
      const raw = localStorage.getItem(cacheKey)
      if (raw) {
        const { greeting: cached, cachedAt } = JSON.parse(raw)
        if (cached && Date.now() - cachedAt < GREETING_TTL) {
          if (!cancelled) setGreeting(cached)
          return
        }
      }
    } catch {}

    fetch('/api/recall-greeting', { method: 'GET' })
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (cancelled) return
        const g = data?.greeting
        if (!g) return
        setGreeting(g)
        try {
          localStorage.setItem(cacheKey, JSON.stringify({ greeting: g, cachedAt: Date.now() }))
        } catch {}
      })
      .catch(() => {})

    return () => { cancelled = true }
  }, [clientId, isNewClient])

  return (
    <p className="text-xl leading-snug text-clay font-familjen font-normal mt-0.5">
      {greeting}
    </p>
  )
}

// ---------------------------------------------------------------------------
// TodaysFocus — one primary action + two fixed secondary buttons.
// ---------------------------------------------------------------------------

// Pure function — no check-in awareness, just meal and chat nudges.
function decideTodaysFocus({ isNewClient, todayMeals }, hour) {
  if (isNewClient) {
    return { label: 'Say hi to your coach', action: 'chat' }
  }

  const noMealsToday = (todayMeals || []).length === 0
  const isMorning    = hour < 11
  const isEvening    = hour >= 20

  if (isMorning && noMealsToday) {
    return { label: 'Log your first meal of the day', action: 'nutrition' }
  }
  if (isEvening) {
    return { label: 'Chat with your coach', action: 'chat' }
  }
  if (noMealsToday) {
    return { label: 'Log your first meal of the day', action: 'nutrition' }
  }
  return { label: 'Chat with your coach', action: 'chat' }
}

function TodaysFocus({ homeData, onTabChange }) {
  const hour  = new Date().getHours()
  const focus = decideTodaysFocus(homeData, hour)

  return (
    <div className="space-y-3">
      <button
        onClick={() => onTabChange(focus.action)}
        className="w-full bg-coral text-white text-base font-semibold font-body py-5 rounded-2xl active:opacity-90 transition-opacity"
      >
        {focus.label}
      </button>

      <div className="flex gap-3">
        <button
          onClick={() => onTabChange('nutrition')}
          className="flex-1 bg-bone text-ink text-sm font-medium font-body py-3 rounded-xl border border-ink/10 active:bg-ink/5 transition-colors"
        >
          Log meal
        </button>
        <button
          onClick={() => onTabChange('chat')}
          className="flex-1 bg-bone text-ink text-sm font-medium font-body py-3 rounded-xl border border-ink/10 active:bg-ink/5 transition-colors"
        >
          Chat
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// WeeklyStrip — 7-day meal activity strip.
// ---------------------------------------------------------------------------

function WeeklyStrip({ weekDays, weeklyAvgCal, weeklyAvgProtein, daysLogged }) {
  if (!weekDays || weekDays.length !== 7) return null

  const hasAverages = weeklyAvgCal > 0 || weeklyAvgProtein > 0
  const hasActivity = daysLogged > 0

  return (
    <div className="bg-surface rounded-2xl p-3.5 border border-ink/6">
      <p className="text-sm font-bold font-familjen text-ink mb-3">This week</p>

      <div className="flex gap-2">
        {weekDays.map((day) => {
          const pillBg   = day.loggedMeal
            ? (day.isToday ? 'bg-coral' : 'bg-ink')
            : 'bg-ink/10'
          const todayRing = day.isToday ? 'ring-2 ring-coral ring-offset-2' : ''
          const label = new Date(day.dateStr + 'T12:00:00')
            .toLocaleDateString('en-GB', { weekday: 'narrow' })

          return (
            <div key={day.dateStr} className="flex flex-col items-center gap-1">
              <div className={`w-7 h-7 rounded-full cursor-default ${pillBg} ${todayRing}`} />
              <span className="text-[10px] text-muted font-body">{label}</span>
            </div>
          )
        })}
      </div>

      {hasActivity && (
        <div className="mt-3 space-y-0.5">
          {hasAverages && (
            <p className="text-sm text-ink">
              <span className="font-space">Avg: {weeklyAvgCal.toLocaleString()} kcal · {weeklyAvgProtein}g</span>
              <span className="font-body"> protein</span>
            </p>
          )}
          <p className="text-sm text-ink font-space">{daysLogged}/7 days logged</p>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// RecentContext — up to 2 lines: last meal + last workout.
// ---------------------------------------------------------------------------

function RecentContext({ recentMeal, recentWorkout }) {
  const lines = []

  if (recentMeal) {
    const food = recentMeal.parsed_macros?.foods?.join(', ') || recentMeal.raw_text
    if (food) {
      const when   = relativeDay(recentMeal.created_at)
      const h      = new Date(recentMeal.created_at).getHours()
      const time   = `${h % 12 || 12}${h >= 12 ? 'pm' : 'am'}`
      const prefix = when === 'today' ? `today at ${time}` : when === 'yesterday' ? `yesterday at ${time}` : `${when} at ${time}`
      lines.push(`Last meal: ${prefix} — ${food}`)
    }
  }

  if (recentWorkout) {
    const desc = recentWorkout.description?.trim()
    if (desc) {
      const when      = relativeDay(recentWorkout.created_at)
      const truncated = desc.length > 60 ? desc.slice(0, 60) + '…' : desc
      lines.push(`Last workout: ${when} — ${truncated}`)
    }
  }

  if (lines.length === 0) return null

  return (
    <div className="bg-surface rounded-2xl p-3.5 border border-ink/6">
      <p className="text-sm font-bold font-familjen text-ink mb-2.5">Recent</p>
      <div className="space-y-1.5">
        {lines.map((line, i) => (
          <p key={i} className="text-sm text-muted font-body">{line}</p>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// HomeTab
// ---------------------------------------------------------------------------

export default function HomeTab({ user, client, onTabChange }) {
  const [homeData, setHomeData] = useState(null)

  useEffect(() => {
    const load = async () => {
      const todayStr = new Date().toLocaleDateString('en-CA')

      // 7-day window
      const sevenDaysAgo = new Date()
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6)
      sevenDaysAgo.setHours(0, 0, 0, 0)

      // 60-day window for streak
      const sixtyDaysAgo = new Date()
      sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 59)
      sixtyDaysAgo.setHours(0, 0, 0, 0)

      const sevenISO = sevenDaysAgo.toISOString()
      const sixtyISO = sixtyDaysAgo.toISOString()

      const q = (query, fallback) => Promise.resolve(query).catch(() => fallback)

      const [
        mealCountRes,       // 0 — lifetime meal count (new-client check)
        messageCountRes,    // 1 — lifetime user message count
        mealDates60Res,     // 2 — meal dates last 60 days (streak)
        msgDates60Res,      // 3 — user message dates last 60 days (streak)
        meals7Res,          // 4 — full meal rows last 7 days
        recentWorkoutRes,   // 5 — most recent workout
      ] = await Promise.all([
        q(supabase
          .from('meals')
          .select('*', { count: 'exact', head: true })
          .eq('client_id', user.id),
          { count: 0 }),

        q(supabase
          .from('messages')
          .select('*', { count: 'exact', head: true })
          .eq('client_id', user.id)
          .eq('role', 'user'),
          { count: 0 }),

        q(supabase
          .from('meals')
          .select('created_at')
          .eq('client_id', user.id)
          .gte('created_at', sixtyISO),
          { data: [] }),

        q(supabase
          .from('messages')
          .select('created_at')
          .eq('client_id', user.id)
          .eq('role', 'user')
          .gte('created_at', sixtyISO),
          { data: [] }),

        q(supabase
          .from('meals')
          .select('parsed_macros, created_at, raw_text')
          .eq('client_id', user.id)
          .gte('created_at', sevenISO)
          .not('parsed_macros', 'is', null)
          .order('created_at', { ascending: false }),
          { data: [] }),

        q(supabase
          .from('workouts')
          .select('description, created_at')
          .eq('client_id', user.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .single(),
          { data: null }),
      ])

      const meals7 = meals7Res.data || []

      // ── New-client: no meals and no messages ever ────────────────────────
      const isNewClient = (
        (mealCountRes.count    || 0) === 0 &&
        (messageCountRes.count || 0) === 0
      )

      // ── Streak: meal days + message days (last 60) ───────────────────────
      const activityDates60 = new Set([
        ...(mealDates60Res.data || []).map(m => toLocalDateStr(m.created_at)),
        ...(msgDates60Res.data  || []).map(m => toLocalDateStr(m.created_at)),
      ])
      const streak = computeStreak(activityDates60)

      // ── Today's meals ────────────────────────────────────────────────────
      const todayMeals = meals7.filter(m => toLocalDateStr(m.created_at) === todayStr)

      // ── Weekly strip — meal days only ────────────────────────────────────
      const weekDays = buildWeekDays(meals7)

      // ── Weekly averages ──────────────────────────────────────────────────
      const uniqueMealDays = new Set(meals7.map(m => toLocalDateStr(m.created_at))).size
      const mealTotals = meals7.reduce(
        (acc, m) => ({
          calories: acc.calories + (m.parsed_macros?.calories || 0),
          protein:  acc.protein  + (m.parsed_macros?.protein  || 0),
        }),
        { calories: 0, protein: 0 }
      )
      const weeklyAvgCal     = uniqueMealDays > 0 ? Math.round(mealTotals.calories / uniqueMealDays) : 0
      const weeklyAvgProtein = uniqueMealDays > 0 ? Math.round(mealTotals.protein  / uniqueMealDays) : 0
      const daysLogged       = weekDays.filter(d => d.loggedMeal).length

      // ── Most recent items ────────────────────────────────────────────────
      const recentMeal    = meals7[0]             || null
      const recentWorkout = recentWorkoutRes.data || null

      setHomeData({
        isNewClient,
        streak,
        todayMeals,
        weekDays,
        weeklyAvgCal,
        weeklyAvgProtein,
        daysLogged,
        recentMeal,
        recentWorkout,
      })
    }

    load()
  }, [user.id])

  const displayName = client?.name || user?.email?.split('@')[0] || 'there'

  if (homeData === null) {
    return (
      <div className="flex flex-col h-full overflow-y-auto bg-bone">
        <div className="px-5 pt-10 pb-3">
          <div className="h-3 w-16 bg-ink/8 rounded mb-2" />
          <div className="h-7 w-48 bg-ink/8 rounded" />
        </div>
        <div className="px-5 space-y-3">
          <div className="h-28 bg-ink/8 rounded-2xl" />
          <div className="h-24 bg-ink/8 rounded-2xl" />
          <div className="h-20 bg-ink/8 rounded-2xl" />
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto bg-bone">
      {/* Header */}
      <div className="px-5 pt-10 pb-3">
        <p className="text-xs text-muted font-body font-medium uppercase tracking-wide">J.ai</p>
        <RecallGreeting
          clientId={user.id}
          displayName={displayName}
          isNewClient={homeData.isNewClient}
        />
      </div>

      <div className="px-5 pb-3">
        <TodaysFocus homeData={homeData} onTabChange={onTabChange} />
      </div>

      <div className="px-5 pb-6 space-y-3">
        <WeeklyStrip
          weekDays={homeData.weekDays}
          weeklyAvgCal={homeData.weeklyAvgCal}
          weeklyAvgProtein={homeData.weeklyAvgProtein}
          daysLogged={homeData.daysLogged}
        />
        <RecentContext
          recentMeal={homeData.recentMeal}
          recentWorkout={homeData.recentWorkout}
        />
      </div>
    </div>
  )
}
