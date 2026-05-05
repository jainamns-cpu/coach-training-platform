'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'

const ACTIVITY_LEVELS = [
  { value: 'sedentary',  label: 'Sedentary',   desc: 'Desk job, little movement',     multiplier: 1.2   },
  { value: 'light',      label: 'Light',        desc: '1–3 workouts / week',           multiplier: 1.375 },
  { value: 'moderate',   label: 'Moderate',     desc: '3–5 workouts / week',           multiplier: 1.55  },
  { value: 'active',     label: 'Active',       desc: '6–7 workouts / week',           multiplier: 1.725 },
  { value: 'very_active',label: 'Very active',  desc: 'Physical job + daily training', multiplier: 1.9   },
]

const GOALS = [
  { value: 'aggressive_cut', label: 'Aggressive fat loss', adjustment: -600, proteinMultiplier: 2.4, fatMultiplier: 0.8 },
  { value: 'cut',            label: 'Fat loss',            adjustment: -400, proteinMultiplier: 2.2, fatMultiplier: 0.9 },
  { value: 'maintenance',    label: 'Maintenance',         adjustment: 0,    proteinMultiplier: 2.0, fatMultiplier: 1.0 },
  { value: 'lean_bulk',      label: 'Lean bulk',           adjustment: +200, proteinMultiplier: 1.8, fatMultiplier: 1.0 },
  { value: 'bulk',           label: 'Bulk',                adjustment: +400, proteinMultiplier: 1.8, fatMultiplier: 1.1 },
]

function calculate(weight, height, age, sex, activityLevel, goalType) {
  if (!weight || !height || !age || !sex || !activityLevel || !goalType) return null

  const activity = ACTIVITY_LEVELS.find(a => a.value === activityLevel)
  const goal     = GOALS.find(g => g.value === goalType)
  if (!activity || !goal) return null

  // BMR — Mifflin-St Jeor
  const bmr = sex === 'male'
    ? (10 * weight) + (6.25 * height) - (5 * age) + 5
    : (10 * weight) + (6.25 * height) - (5 * age) - 161

  const tdee     = Math.round(bmr * activity.multiplier)
  const calories = Math.round(tdee + goal.adjustment)

  // Macros
  const protein = Math.round(weight * goal.proteinMultiplier)
  const fat     = Math.round(weight * goal.fatMultiplier)
  const carbCals = calories - (protein * 4) - (fat * 9)
  const carbs   = Math.max(0, Math.round(carbCals / 4))

  return { bmr: Math.round(bmr), tdee, calories, protein, carbs, fat, adjustment: goal.adjustment }
}

function StatPill({ label, value, sub, color }) {
  return (
    <div className={`rounded-2xl p-4 text-center ${color}`}>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs font-medium mt-0.5">{label}</p>
      {sub && <p className="text-[10px] mt-0.5 opacity-70">{sub}</p>}
    </div>
  )
}

export default function GoalTab({ user, client, onTargetsSaved }) {
  const supabase = createClient()

  const [sex,      setSex]      = useState(client?.sex            || '')
  const [age,      setAge]      = useState(client?.age            || '')
  const [height,   setHeight]   = useState(client?.height_cm      || '')
  const [weight,   setWeight]   = useState('')
  const [activity, setActivity] = useState(client?.activity_level || 'moderate')
  const [goal,     setGoal]     = useState(client?.goal_type      || 'maintenance')
  const [saving,   setSaving]   = useState(false)
  const [saved,    setSaved]    = useState(false)

  // Pull latest weight from check-ins
  useEffect(() => {
    const fetchWeight = async () => {
      const { data } = await supabase
        .from('check_ins')
        .select('weight_kg')
        .eq('client_id', user.id)
        .not('weight_kg', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()
      if (data?.weight_kg) setWeight(data.weight_kg)
    }
    fetchWeight()
  }, [])

  const result = calculate(
    parseFloat(weight),
    parseFloat(height),
    parseInt(age),
    sex,
    activity,
    goal
  )

  const selectedGoal     = GOALS.find(g => g.value === goal)
  const adjustmentLabel  = selectedGoal?.adjustment > 0
    ? `+${selectedGoal.adjustment} surplus`
    : selectedGoal?.adjustment < 0
    ? `${selectedGoal.adjustment} deficit`
    : 'maintenance'

  const saveTargets = async () => {
    if (!result) return
    setSaving(true)
    setSaved(false)
    await supabase.from('clients').update({
      sex, age: parseInt(age), height_cm: parseFloat(height),
      activity_level: activity, goal_type: goal,
      target_calories: result.calories,
      target_protein:  result.protein,
      target_carbs:    result.carbs,
      target_fat:      result.fat,
    }).eq('id', user.id)
    setSaving(false)
    setSaved(true)
    if (onTargetsSaved) onTargetsSaved(result)
  }

  const incomplete = !sex || !age || !height || !weight

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="px-5 pt-12 pb-4">
        <p className="text-xs text-violet-500 font-medium uppercase tracking-wide">Goals</p>
        <h1 className="text-2xl font-bold text-gray-900 mt-0.5">Calorie calculator</h1>
      </div>

      <div className="px-5 pb-8 space-y-4">

        {/* Profile inputs */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-4">
          <p className="text-sm font-semibold text-gray-800">Your profile</p>

          {/* Sex */}
          <div>
            <label className="text-xs text-gray-500 mb-1.5 block">Sex</label>
            <div className="flex gap-2">
              {['male', 'female'].map(s => (
                <button
                  key={s}
                  onClick={() => setSex(s)}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-medium capitalize transition-colors ${
                    sex === s ? 'bg-violet-600 text-white' : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Age + Height */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 mb-1.5 block">Age</label>
              <div className="flex items-center border border-gray-200 rounded-xl overflow-hidden">
                <input
                  type="number" value={age}
                  onChange={e => setAge(e.target.value)}
                  placeholder="28"
                  className="flex-1 px-3 py-2.5 text-sm text-gray-900 outline-none w-0"
                />
                <span className="pr-3 text-xs text-gray-400">yrs</span>
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1.5 block">Height</label>
              <div className="flex items-center border border-gray-200 rounded-xl overflow-hidden">
                <input
                  type="number" value={height}
                  onChange={e => setHeight(e.target.value)}
                  placeholder="175"
                  className="flex-1 px-3 py-2.5 text-sm text-gray-900 outline-none w-0"
                />
                <span className="pr-3 text-xs text-gray-400">cm</span>
              </div>
            </div>
          </div>

          {/* Weight */}
          <div>
            <label className="text-xs text-gray-500 mb-1.5 block">
              Weight <span className="text-gray-400">(auto-filled from last check-in)</span>
            </label>
            <div className="flex items-center border border-gray-200 rounded-xl overflow-hidden">
              <input
                type="number" step="0.1" value={weight}
                onChange={e => setWeight(e.target.value)}
                placeholder="75.0"
                className="flex-1 px-3 py-2.5 text-sm text-gray-900 outline-none w-0"
              />
              <span className="pr-3 text-xs text-gray-400">kg</span>
            </div>
          </div>

          {/* Activity */}
          <div>
            <label className="text-xs text-gray-500 mb-1.5 block">Activity level</label>
            <div className="space-y-1.5">
              {ACTIVITY_LEVELS.map(a => (
                <button
                  key={a.value}
                  onClick={() => setActivity(a.value)}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-left transition-colors ${
                    activity === a.value ? 'bg-violet-50 border border-violet-200' : 'bg-gray-50 border border-transparent'
                  }`}
                >
                  <span className={`text-sm font-medium ${activity === a.value ? 'text-violet-700' : 'text-gray-700'}`}>
                    {a.label}
                  </span>
                  <span className="text-xs text-gray-400">{a.desc}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Goal selection */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
          <p className="text-sm font-semibold text-gray-800 mb-3">Goal</p>
          <div className="space-y-1.5">
            {GOALS.map(g => (
              <button
                key={g.value}
                onClick={() => setGoal(g.value)}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-left transition-colors ${
                  goal === g.value ? 'bg-violet-50 border border-violet-200' : 'bg-gray-50 border border-transparent'
                }`}
              >
                <span className={`text-sm font-medium ${goal === g.value ? 'text-violet-700' : 'text-gray-700'}`}>
                  {g.label}
                </span>
                <span className={`text-xs font-medium ${
                  g.adjustment < 0 ? 'text-rose-500' : g.adjustment > 0 ? 'text-green-500' : 'text-gray-400'
                }`}>
                  {g.adjustment > 0 ? `+${g.adjustment}` : g.adjustment === 0 ? 'TDEE' : g.adjustment} cal
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Results */}
        {incomplete ? (
          <div className="bg-gray-50 border border-gray-100 rounded-2xl p-4 text-center">
            <p className="text-sm text-gray-400">Fill in your profile above to see your targets.</p>
          </div>
        ) : result ? (
          <div className="space-y-3">
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold text-gray-800">Your targets</p>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                  selectedGoal?.adjustment < 0 ? 'bg-rose-50 text-rose-600' :
                  selectedGoal?.adjustment > 0 ? 'bg-green-50 text-green-600' :
                  'bg-gray-100 text-gray-500'
                }`}>
                  {adjustmentLabel}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 mb-3">
                <StatPill
                  label="Daily calories"
                  value={result.calories}
                  sub={`TDEE ${result.tdee}`}
                  color="bg-violet-50 text-violet-700"
                />
                <StatPill
                  label="BMR"
                  value={result.bmr}
                  sub="at rest"
                  color="bg-gray-50 text-gray-600"
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <StatPill label="Protein" value={`${result.protein}g`} color="bg-green-50 text-green-700" />
                <StatPill label="Carbs"   value={`${result.carbs}g`}   color="bg-yellow-50 text-yellow-700" />
                <StatPill label="Fat"     value={`${result.fat}g`}     color="bg-red-50 text-red-600" />
              </div>
            </div>

            <button
              onClick={saveTargets}
              disabled={saving}
              className="w-full bg-violet-600 text-white rounded-2xl py-3.5 text-sm font-semibold disabled:opacity-50 active:bg-violet-700 transition-colors"
            >
              {saving ? 'Saving...' : 'Save as my targets'}
            </button>
            {saved && (
              <p className="text-xs text-center text-violet-600 font-medium">
                Targets saved — your progress bars will now reflect these.
              </p>
            )}
          </div>
        ) : null}

      </div>
    </div>
  )
}
