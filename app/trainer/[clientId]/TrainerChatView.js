'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'

export default function TrainerChatView({ client, initialMessages }) {
  const [messages, setMessages] = useState(initialMessages)
  const [input, setInput] = useState('')
  const [trainerActive, setTrainerActive] = useState(client.trainer_active)
  const [sending, setSending] = useState(false)
  const [activeSection, setActiveSection] = useState('chat') // 'chat' | 'profile'
  const messagesEndRef = useRef(null)

  // Profile state
  const [name, setName] = useState(client.name || '')
  const [profileNotes, setProfileNotes] = useState(client.profile_notes || '')
  const [savingProfile, setSavingProfile] = useState(false)
  const [profileSaved, setProfileSaved] = useState(false)

  // Targets state
  const [targets, setTargets] = useState({
    calories: client.target_calories || '',
    protein:  client.target_protein  || '',
    carbs:    client.target_carbs    || '',
    fat:      client.target_fat      || '',
  })
  const [generatingTargets, setGeneratingTargets] = useState(false)
  const [savingTargets, setSavingTargets] = useState(false)
  const [targetsSaved, setTargetsSaved] = useState(false)

  const displayName = name || client.email

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const toggleJumpIn = async () => {
    const res = await fetch('/api/trainer/jumpin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId: client.id, active: !trainerActive }),
    })
    if (res.ok) setTrainerActive(!trainerActive)
  }

  const sendMessage = async () => {
    if (!input.trim() || sending) return
    setSending(true)
    const text = input.trim()
    setInput('')

    const res = await fetch('/api/trainer/message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId: client.id, content: text }),
    })

    if (res.ok) {
      const { message } = await res.json()
      setMessages(prev => [...prev, message])
    }
    setSending(false)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const saveProfile = async () => {
    setSavingProfile(true)
    setProfileSaved(false)
    const res = await fetch('/api/trainer/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId: client.id, name, profileNotes }),
    })
    if (res.ok) setProfileSaved(true)
    setSavingProfile(false)
  }

  const suggestTargets = async () => {
    if (!profileNotes.trim()) {
      alert('Add a client profile first so Claude has context.')
      return
    }
    setGeneratingTargets(true)
    const res = await fetch('/api/trainer/targets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId: client.id, profileNotes }),
    })
    if (res.ok) {
      const data = await res.json()
      setTargets({
        calories: data.calories || '',
        protein:  data.protein  || '',
        carbs:    data.carbs    || '',
        fat:      data.fat      || '',
      })
    }
    setGeneratingTargets(false)
  }

  const saveTargets = async () => {
    setSavingTargets(true)
    setTargetsSaved(false)
    const res = await fetch('/api/trainer/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId: client.id,
        targets: {
          calories: parseInt(targets.calories) || 0,
          protein:  parseInt(targets.protein)  || 0,
          carbs:    parseInt(targets.carbs)    || 0,
          fat:      parseInt(targets.fat)      || 0,
        },
      }),
    })
    if (res.ok) setTargetsSaved(true)
    setSavingTargets(false)
  }

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b p-4 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/trainer" className="text-gray-400 text-sm">
              ← Back
            </Link>
            <h1 className="font-semibold">{displayName}</h1>
          </div>
          <div className="flex items-center gap-2">
            {/* Section toggle */}
            <div className="flex bg-gray-100 rounded-lg p-0.5">
              {['chat', 'profile'].map(s => (
                <button
                  key={s}
                  onClick={() => setActiveSection(s)}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-colors capitalize ${
                    activeSection === s ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
            <button
              onClick={toggleJumpIn}
              className={`text-sm font-medium px-4 py-1.5 rounded-full ${
                trainerActive ? 'bg-gray-200 text-gray-700' : 'bg-black text-white'
              }`}
            >
              {trainerActive ? 'Step out' : 'Jump in'}
            </button>
          </div>
        </div>
        {trainerActive && (
          <p className="text-xs text-amber-500 mt-1 pl-1">
            You're in — Claude is paused for this client
          </p>
        )}
      </header>

      {activeSection === 'chat' ? (
        <>
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 && (
              <p className="text-center text-gray-400 mt-8">No messages yet.</p>
            )}
            {messages.map(msg => (
              <div
                key={msg.id}
                className={`flex ${msg.role === 'user' ? 'justify-start' : 'justify-end'}`}
              >
                <div
                  className={`max-w-[80%] p-3 rounded-2xl whitespace-pre-wrap text-sm ${
                    msg.role === 'user' ? 'bg-white border' : 'bg-black text-white'
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Input area */}
          {trainerActive ? (
            <div className="p-4 bg-white border-t flex-shrink-0">
              <div className="flex gap-2">
                <input
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Reply as coach..."
                  className="flex-1 p-3 border rounded-full text-sm"
                  disabled={sending}
                />
                <button
                  onClick={sendMessage}
                  disabled={sending || !input.trim()}
                  className="bg-black text-white px-6 rounded-full disabled:opacity-50 text-sm"
                >
                  Send
                </button>
              </div>
            </div>
          ) : (
            <div className="p-4 bg-gray-50 border-t flex-shrink-0 text-center text-sm text-gray-400">
              Read-only — tap Jump in to reply
            </div>
          )}
        </>
      ) : (
        /* Profile section */
        <div className="flex-1 overflow-y-auto p-4 space-y-4">

          {/* Name */}
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
            <p className="text-sm font-semibold text-gray-800 mb-2">Display name</p>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={client.email}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400"
            />
          </div>

          {/* Profile notes */}
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
            <p className="text-sm font-semibold text-gray-800 mb-1">Client profile</p>
            <p className="text-xs text-gray-400 mb-2">Goal, age, weight, training frequency, dietary preferences, notes…</p>
            <textarea
              value={profileNotes}
              onChange={e => setProfileNotes(e.target.value)}
              placeholder="e.g. 28yr female, goal: fat loss, 70kg, trains 4x/week, no dietary restrictions, works a stressful office job, poor sleep"
              rows={4}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 resize-none"
            />
            <button
              onClick={saveProfile}
              disabled={savingProfile}
              className="mt-2 w-full bg-gray-900 text-white rounded-xl py-2.5 text-sm font-medium disabled:opacity-50"
            >
              {savingProfile ? 'Saving...' : 'Save profile'}
            </button>
            {profileSaved && <p className="text-xs text-green-600 text-center mt-1.5">Saved</p>}
          </div>

          {/* Targets */}
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold text-gray-800">Daily targets</p>
              <button
                onClick={suggestTargets}
                disabled={generatingTargets}
                className="text-xs font-medium text-white bg-gray-900 px-3 py-1.5 rounded-lg disabled:opacity-50"
              >
                {generatingTargets ? 'Generating...' : 'Suggest with Claude'}
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[
                { key: 'calories', label: 'Calories', unit: 'kcal' },
                { key: 'protein',  label: 'Protein',  unit: 'g' },
                { key: 'carbs',    label: 'Carbs',    unit: 'g' },
                { key: 'fat',      label: 'Fat',      unit: 'g' },
              ].map(({ key, label, unit }) => (
                <div key={key}>
                  <label className="text-xs text-gray-500 mb-1 block">{label} ({unit})</label>
                  <input
                    type="number"
                    value={targets[key]}
                    onChange={e => setTargets(prev => ({ ...prev, [key]: e.target.value }))}
                    placeholder="0"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900"
                  />
                </div>
              ))}
            </div>
            <button
              onClick={saveTargets}
              disabled={savingTargets}
              className="mt-3 w-full bg-gray-900 text-white rounded-xl py-2.5 text-sm font-medium disabled:opacity-50"
            >
              {savingTargets ? 'Saving...' : 'Save targets'}
            </button>
            {targetsSaved && <p className="text-xs text-green-600 text-center mt-1.5">Targets saved</p>}
          </div>

        </div>
      )}
    </div>
  )
}
