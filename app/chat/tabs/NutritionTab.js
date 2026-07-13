'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase'

// DEFAULTS used when no targets are set, so bars still fill meaningfully
const DEFAULTS = { protein: 150, carbs: 250, fat: 70, calories: 2200 }

// Returns the right coral shade based on how close the macro is to its target.
// Under 50% → coral-soft (muted, low progress)
// 50–89%    → coral     (standard, on track)
// 90%+      → coral-deep (at/over target)
function coralForPct(pct) {
  if (pct >= 90) return 'bg-coral-deep'
  if (pct >= 50) return 'bg-coral'
  return 'bg-coral-soft'
}

function ProgressBar({ label, value, target }) {
  const effectiveTarget = target > 0 ? target : DEFAULTS[label.toLowerCase()] || 100
  const hasTarget = target > 0
  const rawPct = Math.round((value / effectiveTarget) * 100)
  const pct = Math.min(100, rawPct)
  const fillColor = coralForPct(rawPct) // rawPct so ≥90% catches over-target too
  return (
    <div>
      <div className="flex justify-between mb-1">
        <span className="text-xs font-medium font-body text-ink">{label}</span>
        <span className="text-xs font-space text-muted">
          {value}g{hasTarget ? ` / ${target}g` : ''}
        </span>
      </div>
      <div className="w-full bg-ink/8 rounded-full h-1.5">
        <div
          className={`h-1.5 rounded-full transition-all duration-500 ${fillColor} ${!hasTarget ? 'opacity-50' : ''}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

function groupByDay(meals) {
  const groups = {}
  meals.forEach(m => {
    const day = new Date(m.created_at).toLocaleDateString('en-GB', {
      weekday: 'long', month: 'short', day: 'numeric',
    })
    if (!groups[day]) groups[day] = []
    groups[day].push(m)
  })
  return groups
}

function MealRow({ meal, onDelete, onSave }) {
  const [editing, setEditing] = useState(false)
  const [macros, setMacros] = useState({
    protein:  meal.parsed_macros?.protein  || 0,
    carbs:    meal.parsed_macros?.carbs    || 0,
    fat:      meal.parsed_macros?.fat      || 0,
    calories: meal.parsed_macros?.calories || 0,
  })
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    await onSave(meal.id, { ...meal.parsed_macros, ...macros })
    setEditing(false)
    setSaving(false)
  }

  return (
    <div className="px-4 py-3 border-b border-ink/5 last:border-0">
      {editing ? (
        <div className="space-y-2">
          <p className="text-xs font-medium font-body text-muted mb-2">
            {meal.parsed_macros?.foods?.join(', ') || 'Meal'}
          </p>
          <div className="grid grid-cols-4 gap-1.5">
            {['protein', 'carbs', 'fat', 'calories'].map(key => (
              <div key={key}>
                <label className="text-[10px] font-body text-muted block mb-0.5 capitalize">
                  {key === 'calories' ? 'Cal' : key}
                </label>
                <input
                  type="number"
                  value={macros[key]}
                  onChange={e => setMacros(prev => ({ ...prev, [key]: parseInt(e.target.value) || 0 }))}
                  className="w-full border border-ink/15 rounded-lg px-2 py-1 text-xs font-space text-ink bg-bone focus:outline-none focus:border-ink/30"
                />
              </div>
            ))}
          </div>
          <div className="flex gap-2 pt-1">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 bg-coral text-white rounded-lg py-1.5 text-xs font-medium font-body disabled:opacity-50 active:opacity-80 transition-opacity"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
            <button
              onClick={() => setEditing(false)}
              className="flex-1 bg-bone text-ink border border-ink/10 rounded-lg py-1.5 text-xs font-medium font-body active:bg-ink/5 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-body text-ink truncate">
              {meal.parsed_macros?.foods?.join(', ') || 'Meal'}
            </p>
            <p className="text-xs font-space text-muted mt-0.5">
              P: {meal.parsed_macros?.protein}g · C: {meal.parsed_macros?.carbs}g · F: {meal.parsed_macros?.fat}g · {meal.parsed_macros?.calories} cal
            </p>
          </div>
          <div className="flex gap-1 flex-shrink-0">
            <button
              onClick={() => setEditing(true)}
              className="w-7 h-7 rounded-lg bg-bone flex items-center justify-center text-muted active:bg-ink/8 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
            <button
              onClick={() => onDelete(meal.id)}
              className="w-7 h-7 rounded-lg bg-bone flex items-center justify-center text-coral/70 active:bg-coral/8 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function NutritionTab({ user, client }) {
  const [meals, setMeals] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [inputMode, setInputMode] = useState('text')
  const [textInput, setTextInput] = useState('')
  const [photoDesc, setPhotoDesc] = useState('')
  const [photoHint, setPhotoHint] = useState(false)
  const [listening, setListening] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [feedback, setFeedback] = useState(null)
  const fileRef = useRef(null)
  const supabase = createClient()

  const targets = {
    calories: client?.target_calories || 0,
    protein:  client?.target_protein  || 0,
    carbs:    client?.target_carbs    || 0,
    fat:      client?.target_fat      || 0,
  }
  const hasTargets = targets.protein > 0

  const loadMeals = async () => {
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
    const { data } = await supabase
      .from('meals')
      .select('*')
      .eq('client_id', user.id)
      .gte('created_at', sevenDaysAgo.toISOString())
      .not('parsed_macros', 'is', null)
      .order('created_at', { ascending: false })
    setMeals(data || [])
    setLoading(false)
  }

  useEffect(() => { loadMeals() }, [])

  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
  const todayMeals = meals.filter(m => new Date(m.created_at) >= todayStart)
  const todayTotals = todayMeals.reduce(
    (acc, m) => ({
      protein:  acc.protein  + (m.parsed_macros?.protein  || 0),
      carbs:    acc.carbs    + (m.parsed_macros?.carbs    || 0),
      fat:      acc.fat      + (m.parsed_macros?.fat      || 0),
      calories: acc.calories + (m.parsed_macros?.calories || 0),
    }),
    { protein: 0, carbs: 0, fat: 0, calories: 0 }
  )

  const pastMeals = meals.filter(m => new Date(m.created_at) < todayStart)
  const pastDays = new Set(pastMeals.map(m => new Date(m.created_at).toDateString())).size
  const avg = key => pastDays > 0
    ? Math.round(pastMeals.reduce((s, m) => s + (m.parsed_macros?.[key] || 0), 0) / pastDays)
    : 0

  const startVoice = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) { alert('Voice not supported on this browser'); return }
    const r = new SR()
    r.lang = 'en-US'
    r.interimResults = false
    r.onstart = () => setListening(true)
    r.onend = () => setListening(false)
    r.onresult = e => setTextInput(e.results[0][0].transcript)
    r.start()
  }

  const submitText = async () => {
    if (!textInput.trim() || submitting) return
    setSubmitting(true)
    setFeedback(null)
    try {
      const res = await fetch('/api/meal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ textDescription: textInput.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || data.error)
      setFeedback(data.macros
        ? `Logged — P: ${data.macros.protein}g  C: ${data.macros.carbs}g  F: ${data.macros.fat}g  ~${data.macros.calories} cal`
        : 'Logged')
      setTextInput('')
      await loadMeals()
    } catch (e) {
      setFeedback(`Error: ${e.message}`)
    }
    setSubmitting(false)
  }

  const submitPhoto = async (file) => {
    if (!file || submitting) return
    if (!photoDesc.trim()) {
      setPhotoHint(true)
      return
    }
    setPhotoHint(false)
    setSubmitting(true)
    setFeedback(null)
    try {
      const ext = file.name.split('.').pop()
      const path = `${user.id}/${Date.now()}.${ext}`
      const { error: uploadErr } = await supabase.storage.from('meal-photos').upload(path, file)
      if (uploadErr) throw uploadErr
      const res = await fetch('/api/meal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imagePath: path, textDescription: photoDesc.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setFeedback(data.macros
        ? `Logged — P: ${data.macros.protein}g  C: ${data.macros.carbs}g  F: ${data.macros.fat}g  ~${data.macros.calories} cal`
        : 'Logged')
      setPhotoDesc('')
      setPhotoHint(false)
      await loadMeals()
    } catch (e) {
      setFeedback('Something went wrong. Try again.')
    }
    setSubmitting(false)
  }

  const deleteMeal = async (id) => {
    await supabase.from('meals').delete().eq('id', id)
    setMeals(prev => prev.filter(m => m.id !== id))
  }

  const saveMeal = async (id, updatedMacros) => {
    await supabase.from('meals').update({ parsed_macros: updatedMacros }).eq('id', id)
    setMeals(prev => prev.map(m => m.id === id ? { ...m, parsed_macros: updatedMacros } : m))
  }

  const grouped = groupByDay(meals)

  return (
    <div className="flex flex-col h-full overflow-y-auto bg-bone">

      {/* Header */}
      <div className="px-5 pt-10 pb-3 flex-shrink-0">
        <p className="text-xs text-muted font-body font-medium uppercase tracking-wide">J.ai</p>
        <h1 className="text-2xl font-bold font-familjen text-ink mt-0.5">Food log</h1>
      </div>

      <div className="px-5 pb-6 space-y-3">

        {/* Today's progress */}
        <div className="bg-surface rounded-2xl p-3.5 border border-ink/6">
          <div className="flex items-baseline justify-between mb-3">
            <p className="text-sm font-bold font-familjen text-ink">Today</p>
            <span className="text-sm font-space text-ink">
              {todayTotals.calories}{hasTargets ? ` / ${targets.calories}` : ''} kcal
            </span>
          </div>
          <div className="space-y-2.5">
            <ProgressBar label="Protein" value={todayTotals.protein} target={targets.protein} />
            <ProgressBar label="Carbs"   value={todayTotals.carbs}   target={targets.carbs}   />
            <ProgressBar label="Fat"     value={todayTotals.fat}     target={targets.fat}     />
          </div>
          {!hasTargets && (
            <p className="text-[10px] font-body text-muted mt-2.5">Bars show estimated progress — set targets via the trainer dashboard for accurate tracking.</p>
          )}
        </div>

        {/* 7-day averages */}
        {pastDays > 0 && (
          <div className="bg-surface rounded-2xl p-3.5 border border-ink/6">
            <p className="text-sm font-bold font-familjen text-ink mb-3">7-day average / day</p>
            <div className="grid grid-cols-4 gap-2 text-center">
              {[
                { label: 'Cal',     val: avg('calories'), unit: '' },
                { label: 'Protein', val: avg('protein'),  unit: 'g' },
                { label: 'Carbs',   val: avg('carbs'),    unit: 'g' },
                { label: 'Fat',     val: avg('fat'),      unit: 'g' },
              ].map(({ label, val, unit }) => (
                <div key={label} className="bg-bone rounded-xl py-2.5">
                  <p className="text-base font-space font-bold text-ink">{val}{unit}</p>
                  <p className="text-[10px] font-body text-muted mt-0.5">{label}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Log meal button */}
        <button
          onClick={() => { setShowAdd(v => !v); setFeedback(null) }}
          className="w-full bg-coral text-white rounded-2xl py-4 text-sm font-semibold font-body active:opacity-80 transition-opacity"
        >
          {showAdd ? 'Cancel' : '+ Log a meal'}
        </button>

        {/* Log meal panel */}
        {showAdd && (
          <div className="bg-surface rounded-2xl p-3.5 border border-ink/6 space-y-3">
            {/* Mode toggle */}
            <div className="flex bg-bone rounded-xl p-1">
              {['text', 'photo'].map(mode => (
                <button
                  key={mode}
                  onClick={() => setInputMode(mode)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-medium font-body transition-colors ${
                    inputMode === mode
                      ? 'bg-surface text-ink border border-ink/8 shadow-sm'
                      : 'text-muted'
                  }`}
                >
                  {mode === 'text' ? 'Describe' : 'Photo'}
                </button>
              ))}
            </div>

            {inputMode === 'text' ? (
              <>
                <div className="flex gap-2">
                  <input
                    value={textInput}
                    onChange={e => setTextInput(e.target.value)}
                    placeholder="e.g. 2 eggs, toast with butter, coffee"
                    className="flex-1 bg-bone border border-ink/15 rounded-xl px-3 py-2.5 text-sm font-body text-ink placeholder-muted focus:outline-none focus:border-ink/30 transition-colors"
                  />
                  <button
                    onClick={startVoice}
                    className={`px-3 rounded-xl border transition-colors ${
                      listening
                        ? 'bg-ink border-ink text-white'
                        : 'border-ink/15 text-muted bg-bone'
                    }`}
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                    </svg>
                  </button>
                </div>
                <button
                  onClick={submitText}
                  disabled={submitting || !textInput.trim()}
                  className="w-full bg-coral text-white rounded-xl py-2.5 text-sm font-medium font-body disabled:opacity-40 active:opacity-80 transition-opacity"
                >
                  {submitting ? 'Logging...' : 'Log meal'}
                </button>
              </>
            ) : (
              <>
                <input
                  value={photoDesc}
                  onChange={e => { setPhotoDesc(e.target.value); setPhotoHint(false) }}
                  placeholder="What is it and roughly how much?"
                  className="w-full bg-bone border border-ink/15 rounded-xl px-3 py-2.5 text-sm font-body text-ink placeholder-muted focus:outline-none focus:border-ink/30 transition-colors"
                />
                {photoHint && (
                  <p className="text-xs text-muted font-body -mt-1">
                    Add a quick description — what is it and roughly how much? Makes the estimate much more accurate.
                  </p>
                )}
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={e => e.target.files[0] && submitPhoto(e.target.files[0])}
                />
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={submitting}
                  className="w-full border-2 border-dashed border-ink/15 rounded-xl py-6 text-center text-sm font-body text-muted font-medium disabled:opacity-50 active:bg-ink/5 transition-colors"
                >
                  {submitting ? 'Analysing...' : 'Tap to take or upload a photo'}
                </button>
              </>
            )}

            {feedback && (
              <p className={`text-xs font-body rounded-lg px-3 py-2 ${
                feedback.startsWith('Error')
                  ? 'text-coral bg-coral/8'
                  : 'text-ink bg-ink/5'
              }`}>{feedback}</p>
            )}
          </div>
        )}

        {/* Meal log by day */}
        {loading ? (
          <div className="space-y-2">
            <div className="h-20 bg-ink/8 rounded-2xl" />
            <div className="h-20 bg-ink/8 rounded-2xl" />
          </div>
        ) : meals.length === 0 ? (
          <p className="text-muted text-sm font-body text-center py-4">No meals logged in the last 7 days.</p>
        ) : (
          Object.entries(grouped).map(([day, dayMeals]) => {
            const dayTotals = dayMeals.reduce(
              (a, m) => ({
                protein:  a.protein  + (m.parsed_macros?.protein  || 0),
                carbs:    a.carbs    + (m.parsed_macros?.carbs    || 0),
                fat:      a.fat      + (m.parsed_macros?.fat      || 0),
                calories: a.calories + (m.parsed_macros?.calories || 0),
              }),
              { protein: 0, carbs: 0, fat: 0, calories: 0 }
            )
            return (
              <div key={day} className="bg-surface rounded-2xl border border-ink/6 overflow-hidden">
                {/* Day header */}
                <div className="px-4 py-2.5 border-b border-ink/5 flex items-center justify-between">
                  <span className="text-xs font-bold font-familjen text-ink">{day}</span>
                  <span className="text-xs font-space text-muted">{dayTotals.calories} kcal</span>
                </div>
                {/* Meal rows */}
                {dayMeals.map((meal, i) => (
                  <MealRow
                    key={meal.id || i}
                    meal={meal}
                    onDelete={deleteMeal}
                    onSave={saveMeal}
                  />
                ))}
                {/* Day totals footer */}
                <div className="px-4 py-2 bg-bone border-t border-ink/5">
                  <p className="text-xs font-space text-muted">
                    Total — P: {dayTotals.protein}g · C: {dayTotals.carbs}g · F: {dayTotals.fat}g
                  </p>
                </div>
              </div>
            )
          })
        )}

      </div>
    </div>
  )
}
