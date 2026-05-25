'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import HomeTab from './tabs/HomeTab'
import NutritionTab from './tabs/NutritionTab'
import ChatTab from './tabs/ChatTab'
import WorkoutTab from './tabs/WorkoutTab'
import WellbeingTab from './tabs/WellbeingTab'

function HomeIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  )
}
function NutritionIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  )
}
function ChatIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
    </svg>
  )
}
function WorkoutIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  )
}
function WellbeingIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
    </svg>
  )
}

const TABS = [
  { id: 'home',      label: 'Home',      Icon: HomeIcon      },
  { id: 'nutrition', label: 'Nutrition', Icon: NutritionIcon },
  { id: 'chat',      label: 'Chat',      Icon: ChatIcon      },
  { id: 'workout',   label: 'Workout',   Icon: WorkoutIcon   },
  { id: 'wellbeing', label: 'Wellbeing', Icon: WellbeingIcon },
]

const TAB_CONFIG = {
  home:      { bg: 'bg-white',    activeColor: 'text-gray-900'  },
  nutrition: { bg: 'bg-green-50', activeColor: 'text-green-600' },
  chat:      { bg: 'bg-gray-50',  activeColor: 'text-gray-900'  },
  workout:   { bg: 'bg-rose-50',  activeColor: 'text-rose-600'  },
  wellbeing: { bg: 'bg-blue-50',  activeColor: 'text-blue-600'  },
}

export default function AppPage() {
  const [activeTab, setActiveTab] = useState('home')
  const [user, setUser] = useState(null)
  const [client, setClient] = useState(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const init = async () => {
      let { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        const { data: refreshed } = await supabase.auth.refreshSession()
        user = refreshed?.user
      }
      if (!user) { router.push('/'); return }
      setUser(user)
      const { data: clientData } = await supabase
        .from('clients').select('*').eq('id', user.id).single()
      setClient(clientData)
      setLoading(false)
    }
    init()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') router.push('/')
    })
    return () => subscription.unsubscribe()
  }, [])

  if (loading) {
    return (
      <div className="flex justify-center min-h-screen bg-bone">
        <div className="w-full max-w-[440px] flex items-center justify-center h-screen">
          <p className="text-muted text-sm font-body">Loading...</p>
        </div>
      </div>
    )
  }

  const { bg } = TAB_CONFIG[activeTab]

  return (
    <div className="flex justify-center min-h-screen bg-bone">
      <div className={`w-full max-w-[440px] flex flex-col h-screen ${bg} transition-colors duration-200`}>
        <div className="flex-1 overflow-hidden">
          {activeTab === 'home'      && <HomeTab user={user} client={client} onTabChange={setActiveTab} />}
          {activeTab === 'nutrition' && <NutritionTab user={user} client={client} />}
          {activeTab === 'chat'      && <ChatTab user={user} />}
          {activeTab === 'workout'   && <WorkoutTab user={user} />}
          {activeTab === 'wellbeing' && <WellbeingTab user={user} client={client} />}
        </div>

        <nav className="bg-surface border-t border-ink/6 flex-shrink-0">
          <div className="flex">
            {TABS.map(({ id, label, Icon }) => {
              const isActive = activeTab === id
              return (
                <button
                  key={id}
                  onClick={() => setActiveTab(id)}
                  className={`flex-1 flex flex-col items-center py-3 gap-0.5 transition-colors ${
                    isActive ? 'text-coral' : 'text-muted'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  <span className="text-[10px] font-medium font-body">{label}</span>
                </button>
              )
            })}
          </div>
        </nav>
      </div>
    </div>
  )
}
