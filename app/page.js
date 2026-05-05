'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState('password') // default to password now
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  // Detect expired magic link error in the URL hash and show a clean message
  useEffect(() => {
    const hash = window.location.hash
    if (hash.includes('error=access_denied') || hash.includes('otp_expired')) {
      setError('That login link has expired. Sign in with your password below.')
      setMode('password')
      window.history.replaceState(null, '', window.location.pathname)
    }
  }, [])

  const handleMagicLink = async () => {
    setError('')
    setLoading(true)
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/dashboard` }
    })
    if (error) setError(error.message)
    else setSent(true)
    setLoading(false)
  }

  const handlePassword = async () => {
    setError('')
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      // Hard redirect so cookies are fully committed before server reads them
      window.location.href = '/dashboard'
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-gray-50">
      <div className="max-w-md w-full bg-white p-8 rounded-2xl shadow">
        <h1 className="text-2xl font-bold mb-1">J.ai</h1>
        <p className="text-gray-500 text-sm mb-6">Sign in to your account</p>

        {sent ? (
          <p className="text-green-600 text-sm">Check your email for a login link.</p>
        ) : (
          <>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="Email"
              className="w-full p-3 border rounded-xl mb-3 text-sm"
            />

            {mode === 'password' && (
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Password"
                className="w-full p-3 border rounded-xl mb-3 text-sm"
                onKeyDown={e => e.key === 'Enter' && handlePassword()}
              />
            )}

            <button
              onClick={mode === 'magic' ? handleMagicLink : handlePassword}
              disabled={loading || !email}
              className="w-full bg-black text-white p-3 rounded-xl text-sm font-medium disabled:opacity-50"
            >
              {loading ? 'Please wait...' : mode === 'magic' ? 'Send magic link' : 'Sign in'}
            </button>

            {error && <p className="text-red-500 mt-3 text-sm">{error}</p>}

            <button
              onClick={() => { setMode(m => m === 'magic' ? 'password' : 'magic'); setError('') }}
              className="w-full mt-3 text-xs text-gray-400 underline"
            >
              {mode === 'magic' ? 'Sign in with password instead' : 'Send magic link instead'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
