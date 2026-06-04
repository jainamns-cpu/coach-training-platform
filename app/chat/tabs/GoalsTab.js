'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'

// ─── Goal calculator constants ───────────────────────────────────────────────

const ACTIVITY_LEVELS = [
  { value: 'sedentary',   label: 'Sedentary',    desc: 'Desk job, little movement',     multiplier: 1.2   },
  { value: 'light',       label: 'Light',         desc: '1–3 workouts / week',           multiplier: 1.375 },
  { value: 'moderate',    label: 'Moderate',      desc: '3–5 workouts / week',           multiplier: 1.55  },
  { value: 'active',      label: 'Active',        desc: '6–7 workouts / week',           multiplier: 1.725 },
  { value: 'very_active', label: 'Very active',   desc: 'Physical job + daily training', multiplier: 1.9   },
]

const GOALS = [
  { value: 'aggressive_cut', label: 'Aggressive fat loss', adjustment: -600, proteinMult: 2.4, fatMult: 0.8 },
  { value: 'cut',            label: 'Fat loss',            adjustment: -400, proteinMult: 2.2, fatMult: 0.9 },
  { value: 'maintenance',    label: 'Maintenance',         adjustment: 0,    proteinMult: 2.0, fatMult: 1.0 },
  { value: 'lean_bulk',      label: 'Lean bulk',           adjustment: +200, proteinMult: 1.8, fatMult: 1.0 },
  { value: 'bulk',           label: 'Bulk',                adjustment: +400, proteinMult: 1.8, fatMult: 1.1 },
]

function calcTargets(weightKg, heightCm, age, sex, activityValue, goalValue) {
  if (!weightKg || !heightCm || !age || !sex || !activityValue || !goalValue) return null
  const activity = ACTIVITY_LEVELS.find(a => a.value === activityValue)
  const goal     = GOALS.find(g => g.value === goalValue)
  if (!activity || !goal) return null

  const bmr = sex === 'male'
    ? 10 * weightKg + 6.25 * heightCm - 5 * age + 5
    : 10 * weightKg + 6.25 * heightCm - 5 * age - 161

  const tdee     = Math.round(bmr * activity.multiplier)
  const calories = Math.round(tdee + goal.adjustment)
  const protein  = Math.round(weightKg * goal.proteinMult)
  const fat      = Math.round(weightKg * goal.fatMult)
  const carbs    = Math.max(0, Math.round((calories - protein * 4 - fat * 9) / 4))

  return { bmr: Math.round(bmr), tdee, calories, protein, carbs, fat, adjustment: goal.adjustment }
}

function StatPill({ label, value, sub }) {
  return (
    <div className="bg-bone rounded-2xl p-3 text-center">
      <p className="text-xl font-bold font-space text-ink">{value}</p>
      <p className="text-[11px] font-body font-medium text-ink mt-0.5">{label}</p>
      {sub && <p className="text-[10px] font-body text-muted mt-0.5">{sub}</p>}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function GoalsTab({ user, client }) {
  const supabase = createClient()

  // ── Weight logger state ──
  const [weightInput,    setWeightInput]    = useState('')
  const [loggingWeight,  setLoggingWeight]  = useState(false)
  const [weightHistory,  setWeightHistory]  = useState([])

  // ── Goal state ──
  const [sex,        setSex]        = useState('')
  const [age,        setAge]        = useState('')
  const [heightCm,   setHeightCm]   = useState('')
  const [heightFt,   setHeightFt]   = useState('')
  const [heightIn,   setHeightIn]   = useState('')
  const [heightUnit, setHeightUnit] = useState('cm')
  const [goalWeight, setGoalWeight] = useState('')
  const [activity,   setActivity]   = useState('moderate')
  const [goalType,   setGoalType]   = useState('maintenance')
  const [savingGoal, setSavingGoal] = useState(false)
  const [goalSaved,  setGoalSaved]  = useState(false)

  // ── Load weight history from weights table ──
  const loadWeightHistory = async () => {
    const { data } = await supabase
      .from('weights')
      .select('weight_kg, logged_at')
      .eq('client_id', user.id)
      .order('logged_at', { ascending: false })
      .limit(5)
    setWeightHistory(data || [])
  }

  // ── Load latest weight → pre-fill goal calculator ──
  const loadLatestWeight = async () => {
    const { data } = await supabase
      .from('weights')
      .select('weight_kg')
      .eq('client_id', user.id)
      .order('logged_at', { ascending: false })
      .limit(1)
      .single()
    if (data?.weight_kg) setGoalWeight(data.weight_kg)
  }

  // ── Load saved goal profile from DB ──
  const loadProfile = async () => {
    const { data } = await supabase
      .from('clients').select('sex, age, height_cm, activity_level, goal_type')
      .eq('id', user.id).single()
    if (!data) return
    if (data.sex)            setSex(data.sex)
    if (data.age)            setAge(data.age)
    if (data.height_cm) {
      setHeightCm(data.height_cm)
      const totalIn = Math.round(data.height_cm / 2.54)
      setHeightFt(Math.floor(totalIn / 12))
      setHeightIn(totalIn % 12)
    }
    if (data.activity_level) setActivity(data.activity_level)
    if (data.goal_type)      setGoalType(data.goal_type)
  }

  useEffect(() => {
    loadProfile()
    loadLatestWeight()
    loadWeightHistory()
  }, [])

  // ── Log weight ──
  const logWeight = async () => {
    const kg = parseFloat(weightInput)
    if (!kg || loggingWeight) return
    setLoggingWeight(true)
    await supabase.from('weights').insert({ client_id: user.id, weight_kg: kg })
    setWeightInput('')
    await loadWeightHistory()
    await loadLatestWeight()
    setLoggingWeight(false)
  }

  // ── Height conversions ──
  const handleHeightUnitToggle = (unit) => {
    setHeightUnit(unit)
    if (unit === 'in' && heightCm) {
      const totalIn = Math.round(parseFloat(heightCm) / 2.54)
      setHeightFt(Math.floor(totalIn / 12))
      setHeightIn(totalIn % 12)
    }
    if (unit === 'cm' && (heightFt || heightIn)) {
      const cm = Math.round(((parseInt(heightFt) || 0) * 12 + (parseInt(heightIn) || 0)) * 2.54)
      setHeightCm(cm)
    }
  }

  const effectiveHeightCm = heightUnit === 'cm'
    ? parseFloat(heightCm)
    : Math.round(((parseInt(heightFt) || 0) * 12 + (parseInt(heightIn) || 0)) * 2.54)

  // ── Goal logic ──
  const result = calcTargets(
    parseFloat(goalWeight), effectiveHeightCm,
    parseInt(age), sex, activity, goalType
  )

  const selectedGoal = GOALS.find(g => g.value === goalType)
  const adjLabel = selectedGoal?.adjustment > 0
    ? `+${selectedGoal.adjustment} surplus`
    : selectedGoal?.adjustment < 0 ? `${selectedGoal.adjustment} deficit`
    : 'maintenance'

  const saveGoal = async () => {
    if (!result) return
    setSavingGoal(true)
    setGoalSaved(false)
    await supabase.from('clients').update({
      sex, age: parseInt(age),
      height_cm: effectiveHeightCm,
      activity_level: activity, goal_type: goalType,
      target_calories: result.calories, target_protein: result.protein,
      target_carbs: result.carbs, target_fat: result.fat,
    }).eq('id', user.id)
    setSavingGoal(false)
    setGoalSaved(true)
  }

  // ── Render ──
  return (
    <div className="flex flex-col h-full overflow-y-auto bg-bone">

      {/* Header */}
      <div className="px-5 pt-10 pb-3 flex-shrink-0">
        <p className="text-xs text-muted font-body font-medium uppercase tracking-wide">J.ai</p>
        <h1 className="text-2xl font-bold font-familjen text-ink mt-0.5">Goals</h1>
      </div>

      <div className="px-5 pb-6 space-y-3">

        {/* Weight logger */}
        <div className="bg-surface rounded-2xl p-3.5 border border-ink/6 space-y-3">
          <p className="text-sm font-bold font-familjen text-ink">Log weight</p>
          <div className="flex gap-2">
            <div className="flex items-center bg-bone border border-ink/15 rounded-xl overflow-hidden flex-1">
              <input
                type="number" step="0.1" value={weightInput}
                onChange={e => setWeightInput(e.target.value)}
                placeholder="75.0"
                className="flex-1 px-3 py-2.5 text-sm font-space text-ink bg-transparent outline-none placeholder-muted"
              />
              <span className="pr-3 text-xs font-body text-muted">kg</span>
            </div>
            <button
              onClick={logWeight}
              disabled={loggingWeight || !weightInput}
              className="bg-coral text-white rounded-xl px-4 py-2.5 text-sm font-semibold font-body disabled:opacity-40 active:opacity-80 transition-opacity"
            >
              {loggingWeight ? 'Saving…' : 'Log'}
            </button>
          </div>

          {/* Last 5 entries */}
          {weightHistory.length > 0 && (
            <div className="space-y-1.5 pt-1">
              {weightHistory.map((entry, i) => {
                const date = new Date(entry.logged_at).toLocaleDateString('en-GB', {
                  weekday: 'short', day: 'numeric', month: 'short',
                })
                return (
                  <div key={i} className="flex items-center justify-between">
                    <span className="text-xs font-body text-muted">{date}</span>
                    <span className="text-sm font-space text-ink">{entry.weight_kg} kg</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Profile inputs */}
        <div className="bg-surface rounded-2xl p-3.5 border border-ink/6 space-y-4">
          <p className="text-sm font-bold font-familjen text-ink">Your profile</p>

          {/* Sex */}
          <div>
            <label className="text-xs font-body text-muted mb-1.5 block">Sex</label>
            <div className="flex gap-2">
              {['male', 'female'].map(s => (
                <button key={s} onClick={() => setSex(s)}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-medium font-body capitalize transition-colors ${
                    sex === s ? 'bg-ink text-white' : 'bg-bone text-ink'
                  }`}>{s}</button>
              ))}
            </div>
          </div>

          {/* Age */}
          <div>
            <label className="text-xs font-body text-muted mb-1.5 block">Age</label>
            <div className="flex items-center bg-bone border border-ink/15 rounded-xl overflow-hidden w-36">
              <input type="number" value={age} onChange={e => setAge(e.target.value)} placeholder="28"
                className="flex-1 px-3 py-2.5 text-sm font-space text-ink bg-transparent outline-none placeholder-muted" />
              <span className="pr-3 text-xs font-body text-muted">yrs</span>
            </div>
          </div>

          {/* Height */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-body text-muted">Height</label>
              <div className="flex bg-bone rounded-lg p-0.5">
                {['cm', 'in'].map(u => (
                  <button key={u} onClick={() => handleHeightUnitToggle(u)}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium font-body transition-colors ${
                      heightUnit === u ? 'bg-surface text-ink shadow-sm' : 'text-muted'
                    }`}>{u}</button>
                ))}
              </div>
            </div>
            {heightUnit === 'cm' ? (
              <div className="flex items-center bg-bone border border-ink/15 rounded-xl overflow-hidden w-36">
                <input type="number" value={heightCm} onChange={e => setHeightCm(e.target.value)} placeholder="175"
                  className="flex-1 px-3 py-2.5 text-sm font-space text-ink bg-transparent outline-none placeholder-muted" />
                <span className="pr-3 text-xs font-body text-muted">cm</span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <div className="flex items-center bg-bone border border-ink/15 rounded-xl overflow-hidden w-24">
                  <input type="number" value={heightFt} onChange={e => setHeightFt(e.target.value)} placeholder="5"
                    className="flex-1 px-3 py-2.5 text-sm font-space text-ink bg-transparent outline-none placeholder-muted" />
                  <span className="pr-3 text-xs font-body text-muted">ft</span>
                </div>
                <div className="flex items-center bg-bone border border-ink/15 rounded-xl overflow-hidden w-24">
                  <input type="number" value={heightIn} onChange={e => setHeightIn(e.target.value)} placeholder="11"
                    className="flex-1 px-3 py-2.5 text-sm font-space text-ink bg-transparent outline-none placeholder-muted" />
                  <span className="pr-3 text-xs font-body text-muted">in</span>
                </div>
              </div>
            )}
          </div>

          {/* Weight — auto-filled from weights table */}
          <div>
            <label className="text-xs font-body text-muted mb-1.5 block">
              Weight <span className="text-muted/70">(auto-filled from last entry)</span>
            </label>
            <div className="flex items-center bg-bone border border-ink/15 rounded-xl overflow-hidden w-36">
              <input type="number" step="0.1" value={goalWeight} onChange={e => setGoalWeight(e.target.value)} placeholder="75.0"
                className="flex-1 px-3 py-2.5 text-sm font-space text-ink bg-transparent outline-none placeholder-muted" />
              <span className="pr-3 text-xs font-body text-muted">kg</span>
            </div>
          </div>
        </div>

        {/* Activity level */}
        <div className="bg-surface rounded-2xl p-3.5 border border-ink/6">
          <p className="text-sm font-bold font-familjen text-ink mb-3">Activity level</p>
          <div className="space-y-1.5">
            {ACTIVITY_LEVELS.map(a => (
              <button key={a.value} onClick={() => setActivity(a.value)}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-left transition-colors ${
                  activity === a.value ? 'bg-ink' : 'bg-bone'
                }`}>
                <span className={`text-sm font-medium font-body ${activity === a.value ? 'text-white' : 'text-ink'}`}>{a.label}</span>
                <span className={`text-xs font-body ${activity === a.value ? 'text-white/60' : 'text-muted'}`}>{a.desc}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Goal type */}
        <div className="bg-surface rounded-2xl p-3.5 border border-ink/6">
          <p className="text-sm font-bold font-familjen text-ink mb-3">Goal</p>
          <div className="space-y-1.5">
            {GOALS.map(g => (
              <button key={g.value} onClick={() => setGoalType(g.value)}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-left transition-colors ${
                  goalType === g.value ? 'bg-ink' : 'bg-bone'
                }`}>
                <span className={`text-sm font-medium font-body ${goalType === g.value ? 'text-white' : 'text-ink'}`}>{g.label}</span>
                <span className={`text-xs font-space ${goalType === g.value ? 'text-white/60' : 'text-muted'}`}>
                  {g.adjustment > 0 ? `+${g.adjustment}` : g.adjustment === 0 ? 'TDEE' : g.adjustment} cal
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Results */}
        {!sex || !age || !effectiveHeightCm || !goalWeight ? (
          <div className="bg-surface border border-ink/6 rounded-2xl p-4 text-center">
            <p className="text-sm font-body text-muted">Fill in your profile above to see your targets.</p>
          </div>
        ) : result ? (
          <>
            <div className="bg-surface rounded-2xl p-3.5 border border-ink/6">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-bold font-familjen text-ink">Your targets</p>
                <span className="text-xs font-body font-medium text-muted px-2 py-0.5 bg-bone rounded-full">{adjLabel}</span>
              </div>
              <div className="grid grid-cols-2 gap-2 mb-2">
                <StatPill label="Daily calories" value={result.calories} sub={`TDEE ${result.tdee}`} />
                <StatPill label="BMR" value={result.bmr} sub="at rest" />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <StatPill label="Protein" value={`${result.protein}g`} />
                <StatPill label="Carbs"   value={`${result.carbs}g`}   />
                <StatPill label="Fat"     value={`${result.fat}g`}     />
              </div>
            </div>

            {/* Save — coral */}
            <button
              onClick={saveGoal}
              disabled={savingGoal}
              className="w-full bg-coral text-white rounded-2xl py-4 text-sm font-semibold font-body disabled:opacity-40 active:opacity-80 transition-opacity"
            >
              {savingGoal ? 'Saving...' : 'Save as my targets'}
            </button>

            {goalSaved && (
              <p className="text-xs font-body text-center text-ink font-medium">
                Saved — your progress bars now reflect these targets.
              </p>
            )}
          </>
        ) : null}

      </div>
    </div>
  )
}
