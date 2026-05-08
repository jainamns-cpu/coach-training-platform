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
// Pill state: solid = both, partial = one, empty = neither.
function buildWeekDays(meals7, checkins7) {
  const today = new Date()
  const mealDates    = new Set(meals7.map(m    => toLocalDateStr(m.created_at)))
  const checkinDates = new Set(checkins7.map(c => toLocalDateStr(c.created_at)))

  const days = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(today.getDate() - i)
    const dateStr      = d.toLocaleDateString('en-CA')
    const label        = d.toLocaleDateString('en-GB', { weekday: 'short' }).charAt(0)
    const loggedMeal   = mealDates.has(dateStr)
    const loggedCheckin = checkinDates.has(dateStr)
    days.push({ dateStr, label, loggedMeal, loggedCheckin, isToday: i === 0 })
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
//
// Render flow (no flash, no skeleton):
//   1. Initialise state to time-aware fallback — renders immediately.
//   2. If isNewClient → skip cache + API, keep fallback forever.
//   3. If clientId missing → same.
//   4. Check localStorage — if hit and < 6 h old → swap in cached greeting.
//   5. Miss / stale → fallback already visible, fire API in background.
//   6. API success → swap displayed greeting + write cache.
//   7. API failure / empty → fallback stays, no crash.
// ---------------------------------------------------------------------------

const GREETING_TTL = 6 * 60 * 60 * 1000 // 6 hours in ms

function RecallGreeting({ clientId, displayName, isNewClient }) {
  // Initialise to fallback — something is always visible before any async work.
  const [greeting, setGreeting] = useState(() => timeAwareGreeting(displayName))

  useEffect(() => {
    // New client or no ID — nothing to look up.
    if (!clientId || isNewClient) return

    // Cancellation flag — prevents setGreeting firing on an unmounted
    // component or after clientId has changed and the effect re-ran.
    let cancelled = false

    const today    = new Date().toLocaleDateString('en-CA')
    const cacheKey = `recallGreeting:${clientId}:${today}`

    // ── 1. Try localStorage ──────────────────────────────────────────────
    try {
      const raw = localStorage.getItem(cacheKey)
      if (raw) {
        const { greeting: cached, cachedAt } = JSON.parse(raw)
        if (cached && Date.now() - cachedAt < GREETING_TTL) {
          if (!cancelled) setGreeting(cached)
          return // Fresh cache hit — no API call needed.
        }
      }
    } catch {} // Storage read failed — fall through to API. Never crash.

    // ── 2. Cache miss or stale — fetch in background ─────────────────────
    // Fallback is already displayed; we swap silently when the API responds.
    fetch('/api/recall-greeting', { method: 'GET' })
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (cancelled) return // Component unmounted or clientId changed.
        const g = data?.greeting
        if (!g) return // Empty or missing — keep fallback.

        setGreeting(g)

        // ── 3. Write to localStorage ──────────────────────────────────────
        try {
          localStorage.setItem(cacheKey, JSON.stringify({ greeting: g, cachedAt: Date.now() }))
        } catch {} // Write failed (storage full, private mode) — non-critical.
      })
      .catch(() => {}) // Network or parse error — fallback stays. No crash.

    return () => { cancelled = true }
  }, [clientId, isNewClient])

  return (
    <p className="text-xl leading-snug text-gray-900 font-normal mt-0.5">
      {greeting}
    </p>
  )
}

// ---------------------------------------------------------------------------
// TodaysFocus — one primary action + two fixed secondary buttons.
// ---------------------------------------------------------------------------

// Pure function — no side effects, easy to unit-test.
// Returns { label, action } based on client state and time of day.
function decideTodaysFocus({ isNewClient, todayMeals, hasTodayCheckin }, hour) {
  // 1. Brand new client — onboard them into chat first.
  if (isNewClient) {
    return { label: 'Say hi to your coach', action: 'chat' }
  }

  const noMealsToday   = (todayMeals || []).length === 0
  const noCheckinToday = !hasTodayCheckin
  const isMorning      = hour < 11
  const isEvening      = hour >= 20

  // 2. Morning: meal log is the top priority.
  if (isMorning && noMealsToday) {
    return { label: 'Log your first meal of the day', action: 'nutrition' }
  }

  // 3. Evening: check-in or chat takes over from meal logging.
  if (isEvening) {
    if (noCheckinToday) {
      return { label: 'Quick check-in: how was today?', action: 'wellbeing' }
    }
    return { label: 'Chat with your coach', action: 'chat' }
  }

  // 4. Standard daytime priority: meal → check-in → chat.
  if (noMealsToday) {
    return { label: 'Log your first meal of the day', action: 'nutrition' }
  }
  if (noCheckinToday) {
    return { label: 'Quick check-in: how are you feeling?', action: 'wellbeing' }
  }
  return { label: 'Chat with your coach', action: 'chat' }
}

function TodaysFocus({ homeData, onTabChange }) {
  // Compute hour at render time so it reflects reality if the page is left open.
  const hour   = new Date().getHours()
  const focus  = decideTodaysFocus(homeData, hour)

  return (
    <div className="space-y-3">
      {/* Primary — full-width, dark, visually dominant */}
      <button
        onClick={() => onTabChange(focus.action)}
        className="w-full bg-gray-900 text-white text-base font-semibold py-5 rounded-2xl active:bg-gray-800 transition-colors"
      >
        {focus.label}
      </button>

      {/* Secondaries — always these two, side by side, lower contrast */}
      <div className="flex gap-3">
        <button
          onClick={() => onTabChange('nutrition')}
          className="flex-1 bg-gray-100 text-gray-700 text-sm font-medium py-3 rounded-xl active:bg-gray-200 transition-colors"
        >
          Log meal
        </button>
        <button
          onClick={() => onTabChange('chat')}
          className="flex-1 bg-gray-100 text-gray-700 text-sm font-medium py-3 rounded-xl active:bg-gray-200 transition-colors"
        >
          Chat
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// WeeklyStrip — 7-day activity strip with summary lines.
// ---------------------------------------------------------------------------

function WeeklyStrip({ weekDays, weeklyAvgCal, weeklyAvgProtein, daysLogged }) {
  // Cheap insurance — data layer should always deliver exactly 7 items.
  if (!weekDays || weekDays.length !== 7) return null

  const hasAverages = weeklyAvgCal > 0 || weeklyAvgProtein > 0
  const hasActivity = daysLogged > 0

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
      <p className="text-sm font-semibold text-gray-800 mb-4">This week</p>

      {/* 7 pills — one per day */}
      <div className="flex justify-between">
        {weekDays.map((day) => {
          // Pill fill state
          const full    = day.loggedMeal && day.loggedCheckin
          const partial = day.loggedMeal || day.loggedCheckin
          const pillBg  = full ? 'bg-gray-900' : partial ? 'bg-gray-300' : 'bg-gray-100'

          // Today gets a ring regardless of fill
          const todayRing = day.isToday ? 'ring-2 ring-gray-900 ring-offset-2' : ''

          // Day label — narrow weekday initial from the stored date string
          const label = new Date(day.dateStr + 'T12:00:00')
            .toLocaleDateString('en-GB', { weekday: 'narrow' })

          return (
            <div key={day.dateStr} className="flex flex-col items-center gap-1.5">
              <div
                className={`w-8 h-8 rounded-full cursor-default ${pillBg} ${todayRing}`}
              />
              <span className="text-[11px] text-gray-400">{label}</span>
            </div>
          )
        })}
      </div>

      {/* Summary lines — conditional */}
      {hasActivity && (
        <div className="mt-3 space-y-0.5">
          {hasAverages && (
            <p className="text-sm text-gray-500">
              Avg: {weeklyAvgCal.toLocaleString()} kcal · {weeklyAvgProtein}g protein
            </p>
          )}
          <p className="text-sm text-gray-500">{daysLogged}/7 days logged</p>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// RecentContext — up to 3 lines of recent activity. Hidden if no data.
// ---------------------------------------------------------------------------

function RecentContext({ recentMeal, recentCheckin, recentWorkout }) {
  const lines = []

  // ── Last meal ──────────────────────────────────────────────────────────────
  if (recentMeal) {
    const food = recentMeal.parsed_macros?.foods?.join(', ') || recentMeal.raw_text
    if (food) {
      const when = relativeDay(recentMeal.created_at)
      const h    = new Date(recentMeal.created_at).getHours()
      const time = `${h % 12 || 12}${h >= 12 ? 'pm' : 'am'}`
      const prefix = when === 'today' ? `today at ${time}` : when === 'yesterday' ? `yesterday at ${time}` : `${when} at ${time}`
      lines.push(`Last meal: ${prefix} — ${food}`)
    }
  }

  // ── Last check-in ──────────────────────────────────────────────────────────
  if (recentCheckin) {
    const when = relativeDay(recentCheckin.created_at)
    // "N days ago's" is grammatically broken — switch phrasing for that case.
    const label = when === 'today'
      ? "Today's check-in"
      : when === 'yesterday'
        ? "Yesterday's check-in"
        : `Last check-in (${when})`
    lines.push(`${label}: mood ${recentCheckin.mood} · stress ${recentCheckin.stress}`)
  }

  // ── Last workout ───────────────────────────────────────────────────────────
  if (recentWorkout) {
    const desc = recentWorkout.description?.trim()
    if (desc) {
      const when      = relativeDay(recentWorkout.created_at)
      const truncated = desc.length > 60 ? desc.slice(0, 60) + '…' : desc
      lines.push(`Last workout: ${when} — ${truncated}`)
    }
  }

  // Hide the section entirely if there's nothing to show.
  if (lines.length === 0) return null

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
      <p className="text-sm font-semibold text-gray-800 mb-3">Recent</p>
      <div className="space-y-1.5">
        {lines.map((line, i) => (
          <p key={i} className="text-sm text-gray-500">{line}</p>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// HomeTab
// ---------------------------------------------------------------------------

export default function HomeTab({ user, client, onTabChange }) {
  // Single state object. null = still loading.
  // Shape documented inline so it's easy to console.log and debug.
  const [homeData, setHomeData] = useState(null)

  useEffect(() => {
    const load = async () => {
      const todayStr = new Date().toLocaleDateString('en-CA')

      // 7-day window: midnight 6 days ago → now (covers today + 6 prior days)
      const sevenDaysAgo = new Date()
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6)
      sevenDaysAgo.setHours(0, 0, 0, 0)

      // 60-day window for streak calculation
      const sixtyDaysAgo = new Date()
      sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 59)
      sixtyDaysAgo.setHours(0, 0, 0, 0)

      const sevenISO = sevenDaysAgo.toISOString()
      const sixtyISO = sixtyDaysAgo.toISOString()

      // The Supabase browser client returns a PostgrestBuilder (thenable) not
      // a real Promise, so .catch() isn't on its prototype. Wrapping each
      // query in Promise.resolve() converts it to a native Promise first.
      const q = (query, fallback) => Promise.resolve(query).catch(() => fallback)

      // All 9 queries in one Promise.all. Per-query fallback so one failure
      // doesn't kill the rest — partial data is better than nothing.
      const [
        mealCountRes,       // 0 — lifetime meal count (new-client check)
        checkinCountRes,    // 1 — lifetime check-in count
        messageCountRes,    // 2 — lifetime user message count
        mealDates60Res,     // 3 — meal dates last 60 days (streak)
        checkinDates60Res,  // 4 — check-in dates last 60 days (streak)
        msgDates60Res,      // 5 — user message dates last 60 days (streak)
        meals7Res,          // 6 — full meal rows last 7 days (strip + averages + today)
        checkins7Res,       // 7 — full check-in rows last 7 days (strip + recent)
        recentWorkoutRes,   // 8 — most recent workout (RecentContext)
      ] = await Promise.all([
        q(supabase
          .from('meals')
          .select('*', { count: 'exact', head: true })
          .eq('client_id', user.id),
          { count: 0 }),

        q(supabase
          .from('check_ins')
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
          .from('check_ins')
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
          .from('check_ins')
          .select('mood, stress, notes, created_at')
          .eq('client_id', user.id)
          .gte('created_at', sevenISO)
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

      const meals7    = meals7Res.data    || []
      const checkins7 = checkins7Res.data || []

      // ── New-client check ─────────────────────────────────────────────────
      // Zero of everything ever (not just last 7 days).
      const isNewClient = (
        (mealCountRes.count    || 0) === 0 &&
        (checkinCountRes.count || 0) === 0 &&
        (messageCountRes.count || 0) === 0
      )

      // ── Streak ───────────────────────────────────────────────────────────
      // Union of all activity dates from last 60 days into one Set.
      const activityDates60 = new Set([
        ...(mealDates60Res.data    || []).map(m => toLocalDateStr(m.created_at)),
        ...(checkinDates60Res.data || []).map(c => toLocalDateStr(c.created_at)),
        ...(msgDates60Res.data     || []).map(m => toLocalDateStr(m.created_at)),
      ])
      const streak = computeStreak(activityDates60)

      // ── Today's state (derived from 7-day sets, no extra query) ──────────
      const todayMeals    = meals7.filter(m => toLocalDateStr(m.created_at) === todayStr)
      const hasTodayCheckin = checkins7.some(c => toLocalDateStr(c.created_at) === todayStr)

      // ── Weekly strip ─────────────────────────────────────────────────────
      const weekDays = buildWeekDays(meals7, checkins7)

      // ── Weekly averages (per logged day, not per calendar day) ───────────
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

      // ── Days logged this week (at least one action) ──────────────────────
      const daysLogged = weekDays.filter(d => d.loggedMeal || d.loggedCheckin).length

      // ── Most recent items for RecentContext ──────────────────────────────
      const recentMeal    = meals7[0]             || null  // desc order, so [0] is latest
      const recentCheckin = checkins7[0]          || null
      const recentWorkout = recentWorkoutRes.data || null

      setHomeData({
        isNewClient,      // bool — drives TodaysFocus new-client path
        streak,           // number — consecutive days with activity
        todayMeals,       // [] — today's logged meals (TodaysFocus + calorie totals)
        hasTodayCheckin,  // bool — has client checked in today (TodaysFocus)
        weekDays,         // [7] — { dateStr, label, loggedMeal, loggedCheckin, isToday }
        weeklyAvgCal,     // number — avg kcal on days with meals
        weeklyAvgProtein, // number — avg protein on days with meals
        daysLogged,       // number — days in last 7 with any activity
        recentMeal,       // obj|null — most recent meal row
        recentCheckin,    // obj|null — most recent check-in row
        recentWorkout,    // obj|null — most recent workout row
      })
    }

    load()
  }, [user.id])

  // ── Derived values ────────────────────────────────────────────────────────
  const latestCheckin = homeData?.recentCheckin || null  // wellbeing snapshot
  const displayName   = client?.name || user?.email?.split('@')[0] || 'there'

  // homeData === null means the fetch hasn't resolved yet
  if (homeData === null) {
    return (
      <div className="flex flex-col h-full overflow-y-auto">
        <div className="px-5 pt-12 pb-4">
          <div className="h-3 w-16 bg-gray-100 rounded mb-2" />
          <div className="h-7 w-48 bg-gray-100 rounded" />
        </div>
        <div className="px-5 space-y-4">
          <div className="h-28 bg-gray-100 rounded-2xl" />
          <div className="h-28 bg-gray-100 rounded-2xl" />
          <div className="h-20 bg-gray-100 rounded-2xl" />
        </div>
      </div>
    )
  }

  // ── Existing UI (unchanged — steps 3–6 will replace each section) ─────────
  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Header — RecallGreeting replaces the old static h1 */}
      <div className="px-5 pt-12 pb-4">
        <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">J.ai</p>
        <RecallGreeting
          clientId={user.id}
          displayName={displayName}
          isNewClient={homeData.isNewClient}
        />
      </div>

      {/* TodaysFocus — sits between greeting and data cards */}
      <div className="px-5 pb-4">
        <TodaysFocus homeData={homeData} onTabChange={onTabChange} />
      </div>

      <div className="px-5 pb-8 space-y-4">

        {/* WeeklyStrip — 7-day activity view */}
        <WeeklyStrip
          weekDays={homeData.weekDays}
          weeklyAvgCal={homeData.weeklyAvgCal}
          weeklyAvgProtein={homeData.weeklyAvgProtein}
          daysLogged={homeData.daysLogged}
        />

        {/* RecentContext — 1-3 lines of latest activity, hidden if none */}
        <RecentContext
          recentMeal={homeData.recentMeal}
          recentCheckin={homeData.recentCheckin}
          recentWorkout={homeData.recentWorkout}
        />

        {/* Wellbeing snapshot */}
        {latestCheckin && (
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
            <p className="text-sm font-semibold text-gray-800 mb-3">Wellbeing</p>
            <div className="flex gap-4">
              <div className="flex-1 bg-blue-50 rounded-xl p-3 text-center">
                <p className="text-2xl font-bold text-blue-600">{latestCheckin.mood}</p>
                <p className="text-[11px] text-blue-400 mt-0.5">Mood</p>
              </div>
              <div className="flex-1 bg-blue-50 rounded-xl p-3 text-center">
                <p className="text-2xl font-bold text-blue-600">{latestCheckin.stress}</p>
                <p className="text-[11px] text-blue-400 mt-0.5">Stress</p>
              </div>
            </div>
          </div>
        )}

        {/* Quick actions grid removed — replaced by TodaysFocus above */}

      </div>
    </div>
  )
}
