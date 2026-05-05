import { createBrowserClient } from '@supabase/ssr'

export const createClient = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()

  if (!url || !key || typeof window === 'undefined') {
    // Return a dummy object during SSR/build so the page doesn't crash
    return { auth: { getUser: async () => ({ data: { user: null } }), getSession: async () => ({}), onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }), refreshSession: async () => ({}) }, from: () => ({ select: () => ({ eq: () => ({ single: async () => ({}) }) }) }) }
  }

  return createBrowserClient(url, key)
}
