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
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Header */}
      <div className="px-5 pt-12 pb-4">
        <p className="text-xs text-rose-500 font-medium uppercase tracking-wide">Training</p>
        <h1 className="text-2xl font-bold text-gray-900 mt-0.5">Workout log</h1>
      </div>

      <div className="px-5 pb-8 space-y-4">

        {/* Log input */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-3">
          <p className="text-sm font-semibold text-gray-800">Log today's session</p>
          <div className="flex gap-2">
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="e.g. 5km run, 30 min. Upper body — bench, rows, shoulder press."
              rows={2}
              className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 resize-none focus:outline-none focus:border-gray-400 transition-colors"
            />
            <button
              onClick={startVoice}
              className={`self-start mt-0.5 w-10 h-10 rounded-xl border flex items-center justify-center flex-shrink-0 transition-colors ${
                listening ? 'bg-rose-500 border-rose-500 text-white' : 'border-gray-200 text-gray-400'
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
            className="w-full bg-rose-600 text-white rounded-xl py-2.5 text-sm font-semibold disabled:opacity-50 active:bg-rose-700 transition-colors"
          >
            {submitting ? 'Logging...' : 'Log workout'}
          </button>
          {feedback && (
            <div className="bg-rose-50 border border-rose-100 rounded-xl px-3 py-2.5">
              <p className="text-sm text-rose-800">{feedback}</p>
            </div>
          )}
        </div>

        {/* Recent workouts */}
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3 px-1">Last 7 days</p>
          {loading ? (
            <p className="text-gray-400 text-sm text-center py-4">Loading...</p>
          ) : workouts.length === 0 ? (
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 text-center">
              <p className="text-gray-400 text-sm">No sessions logged yet.</p>
              <p className="text-gray-300 text-xs mt-1">Log your first workout above.</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {workouts.map(w => (
                <div key={w.id} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <p className="text-sm text-gray-800 leading-snug">{w.description}</p>
                      {w.coach_reply && (
                        <p className="text-xs text-gray-500 mt-1.5 leading-snug">{w.coach_reply}</p>
                      )}
                    </div>
                    <div className="flex-shrink-0 text-right">
                      <span className="text-[10px] text-gray-400">
                        {new Date(w.created_at).toLocaleDateString('en-GB', {
                          weekday: 'short', month: 'short', day: 'numeric',
                        })}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
