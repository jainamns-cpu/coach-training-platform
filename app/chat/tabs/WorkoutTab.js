'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'

export default function WorkoutTab({ user }) {
  const [workouts, setWorkouts] = useState([])
  const [input, setInput] = useState('')
  const [listening, setListening] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [feedback, setFeedback] = useState(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  const loadWorkouts = async () => {
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
    const { data } = await supabase
      .from('workouts')
      .select('*')
      .eq('client_id', user.id)
      .gte('created_at', sevenDaysAgo.toISOString())
      .order('created_at', { ascending: false })
    setWorkouts(data || [])
    setLoading(false)
  }

  useEffect(() => { loadWorkouts() }, [])

  const startVoice = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) { alert('Voice not supported on this browser'); return }
    const r = new SR()
    r.lang = 'en-US'
    r.interimResults = false
    r.onstart = () => setListening(true)
    r.onend = () => setListening(false)
    r.onresult = e => setInput(e.results[0][0].transcript)
    r.start()
  }

  const logWorkout = async () => {
    if (!input.trim() || submitting) return
    setSubmitting(true)
    setFeedback(null)
    try {
      const res = await fetch('/api/workout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: input.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || res.status)
      setFeedback(data.reply || 'Logged.')
      setInput('')
      await loadWorkouts()
    } catch (e) {
      setFeedback(`Error: ${e.message}`)
    }
    setSubmitting(false)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      logWorkout()
    }
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto bg-bone">

      {/* Header */}
      <div className="px-5 pt-10 pb-3 flex-shrink-0">
        <p className="text-xs text-muted font-body font-medium uppercase tracking-wide">J.ai</p>
        <h1 className="text-2xl font-bold font-familjen text-ink mt-0.5">Workout log</h1>
      </div>

      <div className="px-5 pb-6 space-y-3">

        {/* Log input card */}
        <div className="bg-surface rounded-2xl p-3.5 border border-ink/6 space-y-3">
          <p className="text-sm font-bold font-familjen text-ink">Log today's session</p>
          <div className="flex gap-2">
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="e.g. 5km run, 30 min. Upper body — bench, rows, shoulder press."
              rows={2}
              className="flex-1 bg-bone border border-ink/15 rounded-xl px-3 py-2.5 text-sm font-body text-ink placeholder-muted resize-none focus:outline-none focus:border-ink/30 transition-colors"
            />
            <button
              onClick={startVoice}
              className={`self-start mt-0.5 w-10 h-10 rounded-xl border flex items-center justify-center flex-shrink-0 transition-colors ${
                listening
                  ? 'bg-ink border-ink text-white'
                  : 'bg-bone border-ink/15 text-muted'
              }`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            </button>
          </div>
          <button
            onClick={logWorkout}
            disabled={submitting || !input.trim()}
            className="w-full bg-coral text-white rounded-xl py-2.5 text-sm font-semibold font-body disabled:opacity-40 active:opacity-80 transition-opacity"
          >
            {submitting ? 'Logging...' : 'Log workout'}
          </button>
          {feedback && (
            <div className="bg-clay/10 border border-clay/15 rounded-xl px-3 py-2.5">
              <p className="text-sm font-body text-ink">{feedback}</p>
            </div>
          )}
        </div>

        {/* Recent workouts */}
        <p className="text-xs font-bold font-familjen text-ink px-1 pt-1">Last 7 days</p>

        {loading ? (
          <div className="space-y-2">
            <div className="h-16 bg-ink/8 rounded-2xl" />
            <div className="h-16 bg-ink/8 rounded-2xl" />
          </div>
        ) : workouts.length === 0 ? (
          <div className="bg-surface rounded-2xl p-5 border border-ink/6 text-center">
            <p className="text-muted text-sm font-body">No sessions logged yet.</p>
            <p className="text-muted/60 text-xs font-body mt-1">Log your first workout above.</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {workouts.map(w => (
              <div key={w.id} className="bg-surface rounded-2xl p-3.5 border border-ink/6">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <p className="text-sm font-body text-ink leading-snug">{w.description}</p>
                    {/* coach_reply is an AI coach response — clay accent */}
                    {w.coach_reply && (
                      <p className="text-xs font-body text-clay mt-1.5 leading-snug">{w.coach_reply}</p>
                    )}
                  </div>
                  <span className="flex-shrink-0 text-[10px] font-space text-muted">
                    {new Date(w.created_at).toLocaleDateString('en-GB', {
                      weekday: 'short', month: 'short', day: 'numeric',
                    })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  )
}
