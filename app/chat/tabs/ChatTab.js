'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase'

export default function ChatTab({ user }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)
  const [listening, setListening] = useState(false)
  const messagesEndRef = useRef(null)
  const supabase = createClient()

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from('messages')
        .select('*')
        .eq('client_id', user.id)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(50)

      const sorted = data ? [...data].reverse() : []

      if (sorted.length === 0) {
        // First-time user — seed welcome message
        const res = await fetch('/api/welcome', { method: 'POST' })
        if (res.ok) {
          const { message } = await res.json()
          setMessages(message ? [message] : [])
        }
      } else {
        setMessages(sorted)
        // Returning user — check if they've gone quiet and need a nudge
        const res = await fetch('/api/reengage', { method: 'POST' })
        if (res.ok) {
          const { message } = await res.json()
          if (message) setMessages(prev => [...prev, message])
        }
      }
      setLoading(false)
    }
    load()
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

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

  const sendMessage = async () => {
    if (!input.trim() || sending) return
    setSending(true)
    const text = input.trim()
    setInput('')

    const tempId = `temp-${Date.now()}`
    setMessages(prev => [...prev, { id: tempId, role: 'user', content: text }])

    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: text }),
    })

    if (res.ok) {
      const { userMessage, assistantMessage } = await res.json()
      setMessages(prev => {
        const without = prev.filter(m => m.id !== tempId)
        const updated = userMessage ? [...without, userMessage] : without
        return assistantMessage ? [...updated, assistantMessage] : updated
      })
    } else {
      setMessages(prev => prev.filter(m => m.id !== tempId))
    }

    setSending(false)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col h-full bg-bone">
        <div className="px-5 pt-10 pb-3 flex-shrink-0">
          <div className="h-3 w-16 bg-ink/8 rounded mb-2" />
          <div className="h-7 w-24 bg-ink/8 rounded" />
        </div>
        <div className="flex-1 flex items-center justify-center">
          <p className="text-muted text-sm font-body">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-bone">
      {/* Header */}
      <div className="px-5 pt-10 pb-3 flex-shrink-0">
        <p className="text-xs text-muted font-body font-medium uppercase tracking-wide">J.ai</p>
        <h1 className="text-2xl font-bold font-familjen text-ink mt-0.5">Chat</h1>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 pb-2 space-y-2">
        {messages.map(msg => (
          <div
            key={msg.id}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[78%] px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap font-body ${
                msg.role === 'user'
                  ? 'bg-ink text-white rounded-br-sm'
                  : 'bg-clay/10 text-ink rounded-bl-sm border border-clay/15'
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex justify-start">
            <div className="bg-clay/10 border border-clay/15 rounded-2xl rounded-bl-sm px-4 py-3">
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 bg-clay/50 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 bg-clay/50 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 bg-clay/50 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input bar */}
      <div className="px-4 py-3 bg-surface border-t border-ink/6 flex-shrink-0">
        <div className="flex items-end gap-2">
          {/* Voice button */}
          <button
            onClick={startVoice}
            className={`flex-shrink-0 w-10 h-10 rounded-full border flex items-center justify-center transition-colors ${
              listening
                ? 'bg-ink border-ink text-white'
                : 'border-ink/15 text-muted bg-bone'
            }`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
          </button>

          {/* Text input */}
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Message your coach..."
            rows={1}
            className="flex-1 bg-bone border border-ink/15 rounded-2xl px-4 py-2.5 text-sm text-ink placeholder-muted font-body resize-none focus:outline-none focus:border-ink/30 transition-colors"
            style={{ maxHeight: '100px', overflowY: 'auto' }}
          />

          {/* Send button — coral, primary action */}
          <button
            onClick={sendMessage}
            disabled={sending || !input.trim()}
            className="flex-shrink-0 w-10 h-10 bg-coral text-white rounded-full flex items-center justify-center disabled:opacity-40 transition-opacity active:opacity-80"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 10l7-7m0 0l7 7m-7-7v18" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}
