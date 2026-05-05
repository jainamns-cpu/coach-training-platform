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

// ─── Small components ─────────────────────────────────────────────────────────

function ScoreButton({ value, selected, onClick }) {
  return (
    <button
      onClick={() => onClick(value)}
      className={`w-9 h-9 rounded-xl text-sm font-semibold transition-all ${
        selected ? 'bg-blue-500 text-white shadow-sm scale-110' : 'bg-gray-100 text-gray-500'
      }`}
    >
      {value}
    </button>
  )
}

function StatPill({ label, value, sub, color }) {
  return (
    <div className={`rounded-2xl p-3 text-center ${color}`}>
      <p className="text-xl font-bold">{value}</p>
      <p className="text-[11px] font-medium mt-0.5">{label}</p>
      {sub && <p className="text-[10px] mt-0.5 opacity-60">{sub}</p>}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function WellbeingTab({ user, client }) {
  const supabase = createClient()
  const [section, setSection] = useState('checkin') // 'checkin' | 'goal'

  // ── Check-in state ──
  const [checkins,   setCheckins]   = useState([])
  const [loadingCI,  setLoadingCI]  = useState(true)
  const [mood,       setMood]       = useState(null)
  const [stress,     setStress]     = useState(null)
  const [weight,     setWeight]     = useState('')
  const [notes,      setNotes]      = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted,  setSubmitted]  = useState(false)
  const [coachReply, setCoachReply] = useState(null)

  // ── Goal state ──
  const [sex,        setSex]        = useState('')
  const [age,        setAge]        = useState('')
  const [heightCm,   setHeightCm]   = useState('')   // always stored as cm
  const [heightFt,   setHeightFt]   = useState('')
  const [heightIn,   setHeightIn]   = useState('')
  const [heightUnit, setHeightUnit] = useState('cm') // 'cm' | 'in'
  const [goalWeight, setGoalWeight] = useState('')
  const [activity,   setActivity]   = useState('moderate')
  const [goalType,   setGoalType]   = useState('maintenance')
  const [savingGoal, setSavingGoal] = useState(false)
  const [goalSaved,  setGoalSaved]  = useState(false)

  // ── Load check-ins ──
  const loadCheckins = async () => {
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
    const { data } = await supabase
      .from('check_ins').select('*')
      .eq('client_id', user.id)
      .gte('created_at', sevenDaysAgo.toISOString())
      .order('created_at', { ascending: false })
    setCheckins(data || [])
    setLoadingCI(false)
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
      // Also pre-fill inches equivalent
      const totalIn = Math.round(data.height_cm / 2.54)
      setHeightFt(Math.floor(totalIn / 12))
      setHeightIn(totalIn % 12)
    }
    if (data.activity_level) setActivity(data.activity_level)
    if (data.goal_type)      setGoalType(data.goal_type)
  }

  // ── Load latest weight from check-ins ──
  const loadLatestWeight = async () => {
    const { data } = await supabase
      .from('check_ins').select('weight_kg')
      .eq('client_id', user.id)
      .not('weight_kg', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1).single()
    if (data?.weight_kg) setGoalWeight(data.weight_kg)
  }

  useEffect(() => {
    loadCheckins()
    loadProfile()
    loadLatestWeight()
  }, [])

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

  // ── Check-in logic ──
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
  const checkedInToday = checkins.some(c => new Date(c.created_at) >= todayStart)

  const submitCheckin = async () => {
    if (mood === null || stress === null || submitting) return
    setSubmitting(true)
    await supabase.from('check_ins').insert({
      client_id: user.id, mood, stress,
      weight_kg: weight ? parseFloat(weight) : null,
      notes: notes.trim() || null,
    })
    const msg = `Daily check-in — Mood: ${mood}/10, Stress: ${stress}/10${
      weight ? `, Weight: ${weight}kg` : ''}${notes ? `. Notes: ${notes}` : ''}`
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: msg }),
    })
    if (res.ok) {
      const { assistantMessage } = await res.json()
      if (assistantMessage) setCoachReply(assistantMessage.content)
    }
    await loadCheckins()
    setSubmitting(false)
    setSubmitted(true)
  }

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
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Header */}
      <div className="px-5 pt-12 pb-4">
        <p className="text-xs text-blue-500 font-medium uppercase tracking-wide">Wellbeing</p>
        <h1 className="text-2xl font-bold text-gray-900 mt-0.5">Health & Goals</h1>
      </div>

      {/* Section toggle */}
      <div className="px-5 mb-4">
        <div className="flex bg-white rounded-2xl p-1 shadow-sm border border-gray-100">
          {[['checkin', 'Check-in'], ['goal', 'Goal']].map(([val, label]) => (
            <button
              key={val}
              onClick={() => setSection(val)}
              className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors ${
                section === val ? 'bg-blue-500 text-white shadow-sm' : 'text-gray-500'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-5 pb-8 space-y-4">

        {/* ── CHECK-IN SECTION ── */}
        {section === 'checkin' && (
          <>
            {checkedInToday && !submitted ? (
              <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 text-center">
                <p className="text-sm text-blue-700 font-medium">Checked in today</p>
                <p className="text-xs text-blue-500 mt-0.5">Come back tomorrow for your next check-in.</p>
              </div>
            ) : submitted ? (
              <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                    <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <p className="text-sm font-semibold text-gray-800">Check-in saved</p>
                </div>
                {coachReply && (
                  <p className="text-sm text-gray-700 leading-relaxed bg-blue-50 rounded-xl px-4 py-3">{coachReply}</p>
                )}
              </div>
            ) : (
              <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-5">
                {/* Mood */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-semibold text-gray-800">Mood</p>
                    {mood !== null && <span className="text-xs text-blue-500 font-medium">{mood}/10</span>}
                  </div>
                  <div className="flex gap-1.5 flex-wrap">
                    {[1,2,3,4,5,6,7,8,9,10].map(v => (
                      <ScoreButton key={v} value={v} selected={mood === v} onClick={setMood} />
                    ))}
                  </div>
                </div>
                {/* Stress */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-semibold text-gray-800">Stress</p>
                    {stress !== null && <span className="text-xs text-blue-500 font-medium">{stress}/10</span>}
                  </div>
                  <div className="flex gap-1.5 flex-wrap">
                    {[1,2,3,4,5,6,7,8,9,10].map(v => (
                      <ScoreButton key={v} value={v} selected={stress === v} onClick={setStress} />
                    ))}
                  </div>
                </div>
                {/* Weight */}
                <div>
                  <p className="text-sm font-semibold text-gray-800 mb-2">Weight <span className="font-normal text-gray-400">(optional)</span></p>
                  <div className="flex items-center gap-2">
                    <input type="number" step="0.1" value={weight} onChange={e => setWeight(e.target.value)}
                      placeholder="e.g. 75.5"
                      className="w-32 border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900 placeholder-gray-400" />
                    <span className="text-sm text-gray-400">kg</span>
                  </div>
                </div>
                {/* Notes */}
                <div>
                  <p className="text-sm font-semibold text-gray-800 mb-2">Notes <span className="font-normal text-gray-400">(optional)</span></p>
                  <textarea value={notes} onChange={e => setNotes(e.target.value)}
                    placeholder="Sleep quality, energy, anything on your mind..."
                    rows={2}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 resize-none" />
                </div>
                <button onClick={submitCheckin} disabled={mood === null || stress === null || submitting}
                  className="w-full bg-blue-600 text-white rounded-xl py-3 text-sm font-semibold disabled:opacity-50">
                  {submitting ? 'Saving...' : 'Submit check-in'}
                </button>
              </div>
            )}

            {/* History */}
            {checkins.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3 px-1">Last 7 days</p>
                <div className="space-y-2.5">
                  {checkins.map(c => (
                    <div key={c.id} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold text-gray-500">
                          {new Date(c.created_at).toLocaleDateString('en-GB', { weekday: 'short', month: 'short', day: 'numeric' })}
                        </span>
                        {c.weight_kg && <span className="text-xs text-gray-400">{c.weight_kg} kg</span>}
                      </div>
                      <div className="flex gap-3">
                        <div className="flex-1 bg-blue-50 rounded-xl py-2 text-center">
                          <p className="text-lg font-bold text-blue-600">{c.mood}</p>
                          <p className="text-[10px] text-blue-400">Mood</p>
                        </div>
                        <div className="flex-1 bg-blue-50 rounded-xl py-2 text-center">
                          <p className="text-lg font-bold text-blue-600">{c.stress}</p>
                          <p className="text-[10px] text-blue-400">Stress</p>
                        </div>
                      </div>
                      {c.notes && <p className="text-xs text-gray-500 mt-2 leading-snug">{c.notes}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* ── GOAL SECTION ── */}
        {section === 'goal' && (
          <>
            {/* Profile inputs */}
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-4">
              <p className="text-sm font-semibold text-gray-800">Your profile</p>

              {/* Sex */}
              <div>
                <label className="text-xs text-gray-500 mb-1.5 block">Sex</label>
                <div className="flex gap-2">
                  {['male', 'female'].map(s => (
                    <button key={s} onClick={() => setSex(s)}
                      className={`flex-1 py-2.5 rounded-xl text-sm font-medium capitalize transition-colors ${
                        sex === s ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-600'
                      }`}>{s}</button>
                  ))}
                </div>
              </div>

              {/* Age */}
              <div>
                <label className="text-xs text-gray-500 mb-1.5 block">Age</label>
                <div className="flex items-center border border-gray-200 rounded-xl overflow-hidden w-36">
                  <input type="number" value={age} onChange={e => setAge(e.target.value)} placeholder="28"
                    className="flex-1 px-3 py-2.5 text-sm text-gray-900 outline-none" />
                  <span className="pr-3 text-xs text-gray-400">yrs</span>
                </div>
              </div>

              {/* Height with cm/inches toggle */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs text-gray-500">Height</label>
                  <div className="flex bg-gray-100 rounded-lg p-0.5">
                    {['cm', 'in'].map(u => (
                      <button key={u} onClick={() => handleHeightUnitToggle(u)}
                        className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                          heightUnit === u ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
                        }`}>{u}</button>
                    ))}
                  </div>
                </div>
                {heightUnit === 'cm' ? (
                  <div className="flex items-center border border-gray-200 rounded-xl overflow-hidden w-36">
                    <input type="number" value={heightCm} onChange={e => setHeightCm(e.target.value)} placeholder="175"
                      className="flex-1 px-3 py-2.5 text-sm text-gray-900 outline-none" />
                    <span className="pr-3 text-xs text-gray-400">cm</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <div className="flex items-center border border-gray-200 rounded-xl overflow-hidden w-24">
                      <input type="number" value={heightFt} onChange={e => setHeightFt(e.target.value)} placeholder="5"
                        className="flex-1 px-3 py-2.5 text-sm text-gray-900 outline-none" />
                      <span className="pr-3 text-xs text-gray-400">ft</span>
                    </div>
                    <div className="flex items-center border border-gray-200 rounded-xl overflow-hidden w-24">
                      <input type="number" value={heightIn} onChange={e => setHeightIn(e.target.value)} placeholder="11"
                        className="flex-1 px-3 py-2.5 text-sm text-gray-900 outline-none" />
                      <span className="pr-3 text-xs text-gray-400">in</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Weight */}
              <div>
                <label className="text-xs text-gray-500 mb-1.5 block">
                  Weight <span className="text-gray-400">(auto-filled from last check-in)</span>
                </label>
                <div className="flex items-center border border-gray-200 rounded-xl overflow-hidden w-36">
                  <input type="number" step="0.1" value={goalWeight} onChange={e => setGoalWeight(e.target.value)} placeholder="75.0"
                    className="flex-1 px-3 py-2.5 text-sm text-gray-900 outline-none" />
                  <span className="pr-3 text-xs text-gray-400">kg</span>
                </div>
              </div>
            </div>

            {/* Activity level */}
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
              <p className="text-sm font-semibold text-gray-800 mb-3">Activity level</p>
              <div className="space-y-1.5">
                {ACTIVITY_LEVELS.map(a => (
                  <button key={a.value} onClick={() => setActivity(a.value)}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-left transition-colors ${
                      activity === a.value ? 'bg-blue-50 border border-blue-200' : 'bg-gray-50 border border-transparent'
                    }`}>
                    <span className={`text-sm font-medium ${activity === a.value ? 'text-blue-700' : 'text-gray-700'}`}>{a.label}</span>
                    <span className="text-xs text-gray-400">{a.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Goal type */}
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
              <p className="text-sm font-semibold text-gray-800 mb-3">Goal</p>
              <div className="space-y-1.5">
                {GOALS.map(g => (
                  <button key={g.value} onClick={() => setGoalType(g.value)}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-left transition-colors ${
                      goalType === g.value ? 'bg-blue-50 border border-blue-200' : 'bg-gray-50 border border-transparent'
                    }`}>
                    <span className={`text-sm font-medium ${goalType === g.value ? 'text-blue-700' : 'text-gray-700'}`}>{g.label}</span>
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
            {!sex || !age || !effectiveHeightCm || !goalWeight ? (
              <div className="bg-gray-50 border border-gray-100 rounded-2xl p-4 text-center">
                <p className="text-sm text-gray-400">Fill in your profile above to see your targets.</p>
              </div>
            ) : result ? (
              <>
                <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm font-semibold text-gray-800">Your targets</p>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      selectedGoal?.adjustment < 0 ? 'bg-rose-50 text-rose-600' :
                      selectedGoal?.adjustment > 0 ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-500'
                    }`}>{adjLabel}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 mb-2">
                    <StatPill label="Daily calories" value={result.calories} sub={`TDEE ${result.tdee}`} color="bg-blue-50 text-blue-700" />
                    <StatPill label="BMR" value={result.bmr} sub="at rest" color="bg-gray-50 text-gray-600" />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <StatPill label="Protein" value={`${result.protein}g`} color="bg-green-50 text-green-700" />
                    <StatPill label="Carbs"   value={`${result.carbs}g`}   color="bg-yellow-50 text-yellow-700" />
                    <StatPill label="Fat"     value={`${result.fat}g`}     color="bg-red-50 text-red-600" />
                  </div>
                </div>
                <button onClick={saveGoal} disabled={savingGoal}
                  className="w-full bg-blue-600 text-white rounded-2xl py-3.5 text-sm font-semibold disabled:opacity-50">
                  {savingGoal ? 'Saving...' : 'Save as my targets'}
                </button>
                {goalSaved && (
                  <p className="text-xs text-center text-blue-600 font-medium">
                    Saved — your progress bars now reflect these targets.
                  </p>
                )}
              </>
            ) : null}
          </>
        )}
      </div>
    </div>
  )
}
