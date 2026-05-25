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
      className={`w-9 h-9 rounded-xl text-sm font-semibold font-space transition-all ${
        selected
          ? 'bg-ink text-white scale-110'
          : 'bg-bone text-muted'
      }`}
    >
      {value}
    </button>
  )
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
    <div className="flex flex-col h-full overflow-y-auto bg-bone">

      {/* Header */}
      <div className="px-5 pt-10 pb-3 flex-shrink-0">
        <p className="text-xs text-muted font-body font-medium uppercase tracking-wide">J.ai</p>
        <h1 className="text-2xl font-bold font-familjen text-ink mt-0.5">Health & Goals</h1>
      </div>

      {/* Section toggle — ink selected, bone unselected */}
      <div className="px-5 mb-3">
        <div className="flex bg-surface rounded-2xl p-1 border border-ink/6">
          {[['checkin', 'Check-in'], ['goal', 'Goal']].map(([val, label]) => (
            <button
              key={val}
              onClick={() => setSection(val)}
              className={`flex-1 py-2 rounded-xl text-sm font-medium font-body transition-colors ${
                section === val
                  ? 'bg-ink text-white'
                  : 'text-muted'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-5 pb-6 space-y-3">

        {/* ── CHECK-IN SECTION ── */}
        {section === 'checkin' && (
          <>
            {checkedInToday && !submitted ? (
              <div className="bg-surface border border-ink/6 rounded-2xl p-4 text-center">
                <p className="text-sm font-body text-ink font-medium">Checked in today</p>
                <p className="text-xs font-body text-muted mt-0.5">Come back tomorrow for your next check-in.</p>
              </div>
            ) : submitted ? (
              <div className="bg-surface rounded-2xl p-4 border border-ink/6 space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-ink rounded-full flex items-center justify-center flex-shrink-0">
                    <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <p className="text-sm font-semibold font-body text-ink">Check-in saved</p>
                </div>
                {/* coachReply is an AI coach response — clay accent */}
                {coachReply && (
                  <p className="text-sm font-body text-ink leading-relaxed bg-clay/10 border border-clay/15 rounded-xl px-4 py-3">{coachReply}</p>
                )}
              </div>
            ) : (
              <div className="bg-surface rounded-2xl p-3.5 border border-ink/6 space-y-5">
                {/* Mood */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-bold font-familjen text-ink">Mood</p>
                    {mood !== null && <span className="text-xs font-space text-ink font-semibold">{mood}/10</span>}
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
                    <p className="text-sm font-bold font-familjen text-ink">Stress</p>
                    {stress !== null && <span className="text-xs font-space text-ink font-semibold">{stress}/10</span>}
                  </div>
                  <div className="flex gap-1.5 flex-wrap">
                    {[1,2,3,4,5,6,7,8,9,10].map(v => (
                      <ScoreButton key={v} value={v} selected={stress === v} onClick={setStress} />
                    ))}
                  </div>
                </div>

                {/* Weight */}
                <div>
                  <p className="text-sm font-bold font-familjen text-ink mb-2">
                    Weight <span className="font-normal font-body text-muted">(optional)</span>
                  </p>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center bg-bone border border-ink/15 rounded-xl overflow-hidden w-32">
                      <input type="number" step="0.1" value={weight} onChange={e => setWeight(e.target.value)}
                        placeholder="e.g. 75.5"
                        className="flex-1 px-3 py-2 text-sm font-space text-ink bg-transparent outline-none placeholder-muted" />
                      <span className="pr-3 text-xs font-body text-muted">kg</span>
                    </div>
                  </div>
                </div>

                {/* Notes */}
                <div>
                  <p className="text-sm font-bold font-familjen text-ink mb-2">
                    Notes <span className="font-normal font-body text-muted">(optional)</span>
                  </p>
                  <textarea value={notes} onChange={e => setNotes(e.target.value)}
                    placeholder="Sleep quality, energy, anything on your mind..."
                    rows={2}
                    className="w-full bg-bone border border-ink/15 rounded-xl px-3 py-2.5 text-sm font-body text-ink placeholder-muted resize-none focus:outline-none focus:border-ink/30 transition-colors" />
                </div>

                {/* Submit — coral */}
                <button
                  onClick={submitCheckin}
                  disabled={mood === null || stress === null || submitting}
                  className="w-full bg-coral text-white rounded-xl py-3 text-sm font-semibold font-body disabled:opacity-40 active:opacity-80 transition-opacity"
                >
                  {submitting ? 'Saving...' : 'Submit check-in'}
                </button>
              </div>
            )}

            {/* History */}
            {checkins.length > 0 && (
              <div>
                <p className="text-xs font-bold font-familjen text-ink mb-2.5 px-1">Last 7 days</p>
                <div className="space-y-2.5">
                  {checkins.map(c => (
                    <div key={c.id} className="bg-surface rounded-2xl p-3.5 border border-ink/6">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold font-familjen text-ink">
                          {new Date(c.created_at).toLocaleDateString('en-GB', { weekday: 'short', month: 'short', day: 'numeric' })}
                        </span>
                        {c.weight_kg && <span className="text-xs font-space text-muted">{c.weight_kg} kg</span>}
                      </div>
                      <div className="flex gap-3">
                        <div className="flex-1 bg-bone rounded-xl py-2 text-center">
                          <p className="text-lg font-bold font-space text-ink">{c.mood}</p>
                          <p className="text-[10px] font-body text-muted">Mood</p>
                        </div>
                        <div className="flex-1 bg-bone rounded-xl py-2 text-center">
                          <p className="text-lg font-bold font-space text-ink">{c.stress}</p>
                          <p className="text-[10px] font-body text-muted">Stress</p>
                        </div>
                      </div>
                      {c.notes && <p className="text-xs font-body text-muted mt-2 leading-snug">{c.notes}</p>}
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
            <div className="bg-surface rounded-2xl p-3.5 border border-ink/6 space-y-4">
              <p className="text-sm font-bold font-familjen text-ink">Your profile</p>

              {/* Sex — ink selected, bone unselected */}
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

              {/* Height with cm/inches toggle */}
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

              {/* Weight */}
              <div>
                <label className="text-xs font-body text-muted mb-1.5 block">
                  Weight <span className="text-muted/70">(auto-filled from last check-in)</span>
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
          </>
        )}

      </div>
    </div>
  )
}
