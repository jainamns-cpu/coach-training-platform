'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'

function MacroRing({ label, value, target, color }) {
  const pct = target > 0 ? Math.min(100, Math.round((value / target) * 100)) : 0
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative w-14 h-14">
        <svg className="w-14 h-14 -rotate-90" viewBox="0 0 56 56">
          <circle cx="28" cy="28" r="22" fill="none" stroke="#f3f4f6" strokeWidth="5" />
          <circle
            cx="28" cy="28" r="22" fill="none"
            stroke={color} strokeWidth="5"
            strokeDasharray={`${2 * Math.PI * 22}`}
            strokeDashoffset={`${2 * Math.PI * 22 * (1 - pct / 100)}`}
            strokeLinecap="round"
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-[11px] font-semibold text-gray-800">
          {pct}%
        </span>
      </div>
      <span className="text-[10px] text-gray-500 font-medium">{label}</span>
      <span className="text-[11px] text-gray-700 font-semibold">{value}g</span>
    </div>
  )
}

export default function HomeTab({ user, client, onTabChange }) {
  const [todayMeals, setTodayMeals] = useState([])
  const [latestCheckin, setLatestCheckin] = useState(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  const targets = {
    calories: client?.target_calories || 0,
    protein:  client?.target_protein  || 0,
    carbs:    client?.target_carbs    || 0,
    fat:      client?.target_fat      || 0,
  }

  useEffect(() => {
    const load = async () => {
      const todayStart = new Date()
      todayStart.setHours(0, 0, 0, 0)

      const [mealsRes, checkinRes] = await Promise.all([
        supabase
          .from('meals')
          .select('parsed_macros, created_at')
          .eq('client_id', user.id)
          .gte('created_at', todayStart.toISOString())
          .not('parsed_macros', 'is', null),
        supabase
          .from('check_ins')
          .select('mood, stress, created_at')
          .eq('client_id', user.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .single(),
      ])

      setTodayMeals(mealsRes.data || [])
      setLatestCheckin(checkinRes.data || null)
      setLoading(false)
    }
    load()
  }, [])

  const totals = todayMeals.reduce(
    (acc, m) => ({
      protein:  acc.protein  + (m.parsed_macros?.protein  || 0),
      carbs:    acc.carbs    + (m.parsed_macros?.carbs    || 0),
      fat:      acc.fat      + (m.parsed_macros?.fat      || 0),
      calories: acc.calories + (m.parsed_macros?.calories || 0),
    }),
    { protein: 0, carbs: 0, fat: 0, calories: 0 }
  )

  const displayName = client?.name || user?.email?.split('@')[0] || 'there'
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  const DEFAULTS = { calories: 2200, protein: 150, carbs: 250, fat: 70 }
  const hasTargets = targets.protein > 0

  const effectiveCal = hasTargets ? targets.calories : DEFAULTS.calories
  const calPct = Math.min(100, Math.round((totals.calories / effectiveCal) * 100))

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Header */}
      <div className="px-5 pt-12 pb-4">
        <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">J.ai</p>
        <h1 className="text-2xl font-bold text-gray-900 mt-0.5">
          {greeting}, {displayName}
        </h1>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-gray-400 text-sm">Loading...</p>
        </div>
      ) : (
        <div className="px-5 pb-8 space-y-4">

          {/* Calories card */}
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold text-gray-800">Calories today</span>
              <span className="text-xs text-gray-400">
                {hasTargets ? `${targets.calories} target` : `${DEFAULTS.calories} est. target`}
              </span>
            </div>
            <div className="flex items-end gap-2 mb-3">
              <span className="text-3xl font-bold text-gray-900">{totals.calories}</span>
              <span className="text-sm text-gray-400 mb-1">kcal</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-2">
              <div
                className={`h-2 rounded-full transition-all duration-500 ${hasTargets ? 'bg-gray-900' : 'bg-gray-400'}`}
                style={{ width: `${calPct}%` }}
              />
            </div>
            <p className="text-xs text-gray-400 mt-1.5">
              {calPct}% of {hasTargets ? 'daily target' : 'estimated target'}
            </p>
          </div>

          {/* Macro rings — always show, use defaults if no targets */}
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-semibold text-gray-800">Macros</p>
              {!hasTargets && <span className="text-[10px] text-gray-400">estimated targets</span>}
            </div>
            <div className="flex justify-around">
              <MacroRing label="Protein" value={totals.protein} target={hasTargets ? targets.protein : DEFAULTS.protein} color="#16a34a" />
              <MacroRing label="Carbs"   value={totals.carbs}   target={hasTargets ? targets.carbs   : DEFAULTS.carbs}   color="#ca8a04" />
              <MacroRing label="Fat"     value={totals.fat}     target={hasTargets ? targets.fat     : DEFAULTS.fat}     color="#dc2626" />
            </div>
          </div>

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

          {/* Quick actions */}
          <div className="grid grid-cols-3 gap-3">
            <button
              onClick={() => onTabChange('nutrition')}
              className="bg-green-50 rounded-2xl p-4 flex flex-col items-center gap-2 active:bg-green-100 transition-colors"
            >
              <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                <svg className="w-4 h-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
              </div>
              <span className="text-[11px] font-medium text-green-700">Log meal</span>
            </button>
            <button
              onClick={() => onTabChange('workout')}
              className="bg-rose-50 rounded-2xl p-4 flex flex-col items-center gap-2 active:bg-rose-100 transition-colors"
            >
              <div className="w-8 h-8 bg-rose-100 rounded-full flex items-center justify-center">
                <svg className="w-4 h-4 text-rose-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <span className="text-[11px] font-medium text-rose-700">Workout</span>
            </button>
            <button
              onClick={() => onTabChange('chat')}
              className="bg-gray-100 rounded-2xl p-4 flex flex-col items-center gap-2 active:bg-gray-200 transition-colors"
            >
              <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center">
                <svg className="w-4 h-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <span className="text-[11px] font-medium text-gray-600">Chat</span>
            </button>
          </div>

        </div>
      )}
    </div>
  )
}
