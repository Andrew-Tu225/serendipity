'use client'

import Image from 'next/image'
import { useState, type ReactNode } from 'react'
import rooftopImage from './assets/rooftop-dinner.png'
import DiscoverMap from '@/components/map/discover-map'
import { ReviewComposer } from '@/components/experience/review-composer'
import { mapPlace, type PlaceExperiences } from '@/types/discovery'
import type { Coordinates, MapPlace } from '@/types/places'
import { useSession } from '@/components/auth/session-provider'
import { ProfileView } from '@/components/profile/profile-view'
import { HomeRecommendations } from '@/components/recommendations/home-recommendations'
import { FriendAvatar } from '@/components/map/friend-avatar'

type IconName =
  | 'home'
  | 'compass'
  | 'plus'
  | 'users'
  | 'user'
  | 'bell'
  | 'map'
  | 'heart'
  | 'bookmark'
  | 'arrow'
  | 'close'
  | 'sparkle'
  | 'pin'
  | 'globe'
  | 'lock'

function Icon({ name, size = 22, filled = false }: { name: IconName; size?: number; filled?: boolean }) {
  const paths: Record<IconName, ReactNode> = {
    home: <><path d="m3 11 9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M9 20v-6h6v6"/></>,
    compass: <><circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2.2 4.8-4.8 2.2 2.2-4.8 4.8-2.2Z"/></>,
    plus: <><path d="M12 5v14M5 12h14"/></>,
    users: <><path d="M16 19v-1.5a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4V19"/><circle cx="9.5" cy="7.5" r="3.5"/><path d="M17 4.6a3.5 3.5 0 0 1 0 6.8M20 19v-1.5a4 4 0 0 0-2.5-3.7"/></>,
    user: <><circle cx="12" cy="8" r="4"/><path d="M4.5 21a7.5 7.5 0 0 1 15 0"/></>,
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></>,
    map: <><path d="m9 18-5 2V6l5-2 6 2 5-2v14l-5 2-6-2Z"/><path d="M9 4v14M15 6v14"/></>,
    heart: <path d="M20.8 4.7a5.5 5.5 0 0 0-7.8 0L12 5.8l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.4 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z"/>,
    bookmark: <path d="M6 4.8A1.8 1.8 0 0 1 7.8 3h8.4A1.8 1.8 0 0 1 18 4.8V21l-6-3.5L6 21V4.8Z"/>,
    arrow: <><path d="M5 12h14M13 6l6 6-6 6"/></>,
    close: <><path d="m6 6 12 12M18 6 6 18"/></>,
    sparkle: <><path d="m12 3 1.2 4.1a5 5 0 0 0 3.4 3.4L21 12l-4.4 1.5a5 5 0 0 0-3.4 3.4L12 21l-1.2-4.1a5 5 0 0 0-3.4-3.4L3 12l4.4-1.5a5 5 0 0 0 3.4-3.4L12 3Z"/></>,
    pin: <><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></>,
    globe: <><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.2 3 14.8 0 18M12 3c-3 3.2-3 14.8 0 18"/></>,
    lock: <><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></>,
  }

  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  )
}

function App() {
  const { session } = useSession()
  const [activeTab, setActiveTab] = useState('Home')
  const [discovered, setDiscovered] = useState(false)
  const [sheet, setSheet] = useState<'post' | 'soon' | null>(null)
  const [posted, setPosted] = useState(false)
  const [selectedPlace, setSelectedPlace] = useState<MapPlace | null>(null)
  const [focusTarget, setFocusTarget] = useState<MapPlace | null>(null)
  const [reviewTarget, setReviewTarget] = useState<MapPlace | null>(null)
  const [reviewPoint, setReviewPoint] = useState<Coordinates | null>(null)
  const [picking, setPicking] = useState(false)
  const [reviewBusy, setReviewBusy] = useState(false)
  const [reviewRevision, setReviewRevision] = useState(0)

  const startReview = (place: MapPlace | null) => {
    setReviewTarget(place)
    setReviewPoint(null)
    setPosted(false)
    if (place?.app_id) {
      setPicking(false)
      setSheet('post')
    } else {
      setSheet(null)
      setPicking(true)
      setDiscovered(true)
      setActiveTab('Discover')
    }
  }
  const reviewSaved = (result: PlaceExperiences) => {
    setSelectedPlace(mapPlace(result.place))
    setReviewRevision((value) => value + 1)
    setReviewBusy(false)
    setSheet(null)
    setPosted(true)
    setActiveTab('Discover')
  }

  const changeTab = (tab: string) => {
    if (tab === 'Add') {
      startReview(null)
      return
    }
    setSheet(null)
    setPicking(false)
    if (tab === 'Discover') setDiscovered(true)
    setActiveTab(tab)
  }

  const pageEyebrow = activeTab === 'Buddy' ? 'Your people' : activeTab === 'Profile' ? 'Your vibe' : activeTab === 'Discover' ? 'Around you' : `Hello, ${session?.user.display_name?.trim().split(/\s+/)[0] || 'Explorer'}`
  const pageTitle = activeTab === 'Buddy' ? 'Taste buddies' : activeTab === 'Profile' ? 'Taste profile' : activeTab === 'Discover' ? 'Discover' : 'What feels fun?'

  return (
    <main className="min-h-dvh bg-[#ebe5f5] text-[#292333] sm:py-6">
      <div className={`app-shell${activeTab === 'Discover' ? ' is-discover' : ''}`}>
        {activeTab !== 'Discover' && (
          <>
            <div className="status-bar" aria-hidden="true">
              <span>9:41</span>
              <div className="status-icons"><span className="signal"/><span className="wifi"/><span className="battery"/></div>
            </div>

            <header className="topbar">
              <div>
                <p className="eyebrow">{pageEyebrow}</p>
                <h1>{pageTitle}</h1>
              </div>
              <button className="round-button" aria-label="Notifications"><Icon name="bell" size={20}/><span className="notification-dot"/></button>
            </header>
          </>
        )}

        <div className="app-content">
          <div className="discovery-mount" hidden={activeTab !== 'Discover'}>
            {discovered && <DiscoverMap active={activeTab === 'Discover'} revision={reviewRevision}
              selected={selectedPlace} focusTarget={focusTarget} onSelect={setSelectedPlace} onReview={startReview}
              picking={picking} onCancelPick={() => setPicking(false)}
              onPick={(point) => { setReviewPoint(point); setPicking(false); setSheet('post') }}/>}
          </div>
          {activeTab === 'Buddy' ? (
            <BuddyView />
          ) : activeTab === 'Profile' ? (
            <ProfileView />
          ) : activeTab === 'Discover' ? null : (
            <HomeRecommendations revision={reviewRevision} onExplore={() => changeTab('Discover')} onSelect={(place) => {
              setSelectedPlace(place)
              setFocusTarget(place)
              changeTab('Discover')
            }}/>
          )}
        </div>

        {posted && <div className="review-saved" role="status">Your experience was shared <button onClick={() => setPosted(false)} aria-label="Dismiss confirmation">×</button></div>}

        <nav className="bottom-nav" aria-label="Primary navigation">
          <NavButton label="Home" icon="home" active={activeTab === 'Home'} onClick={() => changeTab('Home')}/>
          <NavButton label="Discover" icon="pin" active={activeTab === 'Discover'} onClick={() => changeTab('Discover')}/>
          <button className="add-button" onClick={() => changeTab('Add')} aria-label="Add a post"><span><Icon name="plus" size={27}/></span><small>Add</small></button>
          <NavButton label="Buddy" icon="users" active={activeTab === 'Buddy'} onClick={() => changeTab('Buddy')}/>
          <NavButton label="Profile" icon="user" active={activeTab === 'Profile'} onClick={() => changeTab('Profile')}/>
        </nav>

        {sheet && (
          <div className="sheet-backdrop" onMouseDown={(event) => event.currentTarget === event.target && !reviewBusy && setSheet(null)}>
            <section className="sheet" onKeyDown={(event) => {
              if (event.key === 'Escape' && !reviewBusy) setSheet(null)
              if (event.key === 'Tab') {
                const fields = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href]'))
                const first = fields[0], last = fields[fields.length - 1]
                if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
                if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
              }
            }} role="dialog" aria-modal="true" aria-label={sheet === 'post' ? 'Create a post' : 'Coming soon'}>
              <div className="sheet-handle"/>
              <button autoFocus className="sheet-close" disabled={reviewBusy} onClick={() => setSheet(null)} aria-label="Close"><Icon name="close" size={20}/></button>
              {sheet === 'post' ? (
                <ReviewComposer target={reviewTarget} point={reviewPoint} onSaved={reviewSaved} onBusy={setReviewBusy}/>
              ) : (
                <div className="soon-state">
                  <span><Icon name="sparkle" size={28}/></span>
                  <p className="eyebrow">PLACEHOLDER</p>
                  <h2>{activeTab} is on its way</h2>
                  <p>We’re saving this spot for something special.</p>
                  <button className="primary-button" onClick={() => { setSheet(null); setActiveTab('Home') }}>Back home</button>
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </main>
  )
}

function NavButton({ label, icon, active, onClick }: { label: string; icon: IconName; active: boolean; onClick: () => void }) {
  return <button className={active ? 'nav-item active' : 'nav-item'} onClick={onClick}><Icon name={icon} size={22} filled={active}/><span>{label}</span></button>
}

function BuddyView() {
  const [matched, setMatched] = useState(false)
  const [mode, setMode] = useState<'local' | 'worldwide'>('local')
  return (
    <section className="buddy-view">
      <div className="buddy-modes" role="tablist" aria-label="Buddy location">
        <button className={mode === 'local' ? 'active' : ''} onClick={() => setMode('local')} role="tab" aria-selected={mode === 'local'}><Icon name="pin" size={15}/> Local</button>
        <button className={mode === 'worldwide' ? 'active' : ''} onClick={() => setMode('worldwide')} role="tab" aria-selected={mode === 'worldwide'}><Icon name="globe" size={15}/> Worldwide <Icon name="lock" size={11}/></button>
      </div>
      {mode === 'local' ? (
        <>
          <p className="buddy-intro">People who save what you save, skip what you skip, and are actually down to go.</p>
          <div className="local-progress">
            <div className="progress-copy"><span><Icon name="globe" size={16}/></span><p><strong>Worldwide is 70% unlocked</strong><small>Rate 3 more local experiences</small></p></div>
            <div className="progress-track"><i/></div>
          </div>
          <div className="buddy-card">
            <div className="buddy-photo"><Image src={rooftopImage} sizes="430px" alt="Alex, a suggested taste buddy"/><span>94% match</span></div>
            <div className="buddy-info">
              <div><h2>Alex, 28</h2><p>Brooklyn · 2 mi away</p></div>
              <span className="verified"><Icon name="sparkle" size={15}/></span>
            </div>
            <div className="taste-tags"><span>Natural wine</span><span>Live jazz</span><span>Hidden gems</span></div>
            <p className="overlap"><strong>12 shared saves</strong> including Clay & rosé and Sunday Jazz Club.</p>
            <button className={matched ? 'primary-button matched' : 'primary-button'} onClick={() => setMatched(!matched)}>
              {matched ? 'Buddy request sent' : 'Say hey'} <Icon name={matched ? 'users' : 'arrow'} size={18}/>
            </button>
          </div>
          <div className="buddy-note"><Icon name="heart" size={18}/><p><strong>Better together.</strong><br/>We only suggest people with real taste overlap.</p></div>
        </>
      ) : (
        <WorldwideLock />
      )}
    </section>
  )
}

function WorldwideLock() {
  return (
    <section className="worldwide-lock">
      <div className="world-map-preview" aria-hidden="true">
        <span className="continent americas"/><span className="continent europe"/><span className="continent asia"/>
        <i className="world-dot dot-one"/><i className="world-dot dot-two"/><i className="world-dot dot-three"/>
        <div className="locked-avatar avatar-paris"><FriendAvatar variant="one"/></div>
        <div className="locked-avatar avatar-tokyo"><FriendAvatar variant="two"/></div>
        <div className="locked-avatar avatar-mexico"><FriendAvatar variant="three"/></div>
        <span className="map-lock"><Icon name="lock" size={23}/></span>
      </div>
      <div className="worldwide-copy">
        <p className="eyebrow">WORLDWIDE BUDDIES</p>
        <h2>Match with locals wherever you go</h2>
        <p>Build a reliable taste profile at home first. Then we’ll introduce you to locals who know exactly where you should go.</p>
      </div>
      <div className="unlock-card">
        <div><span>7</span><small>of 10 local rankings</small></div>
        <div className="unlock-track"><i/></div>
        <p><Icon name="lock" size={13}/> Add 3 more rankings to unlock international matching</p>
      </div>
      <div className="unlock-benefits">
        <div><Icon name="users" size={17}/><span><strong>Meet trusted locals</strong><small>Matched by real taste overlap</small></span></div>
        <div><Icon name="map" size={17}/><span><strong>Skip tourist traps</strong><small>Get their genuinely favorite spots</small></span></div>
        <div><Icon name="globe" size={17}/><span><strong>Plan anywhere</strong><small>Your network travels with you</small></span></div>
      </div>
    </section>
  )
}


export default App
