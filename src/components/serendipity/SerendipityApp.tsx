'use client'

import Image from 'next/image'
import { useState, type ChangeEvent, type ReactNode } from 'react'
import potteryImage from './assets/pottery-workshop.png'
import rooftopImage from './assets/rooftop-dinner.png'
import DiscoverMap from '@/components/map/discover-map'
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

const filters = ['For you', 'Food', 'Creative', 'Outdoors', 'Music']
const experienceCriteria: Record<string, string[]> = {
  Restaurants: ['Flavor', 'Service', 'Atmosphere'],
  Hikes: ['Scenery', 'Physical effort', 'Difficulty'],
  Creative: ['Creativity', 'Guidance', 'Hands-on'],
  Nightlife: ['Energy', 'Music', 'Crowd'],
  Wellness: ['Relaxation', 'Care', 'Value'],
  Other: ['Novelty', 'Organization', 'Value'],
}

function App() {
  const [activeTab, setActiveTab] = useState('Home')
  const [discovered, setDiscovered] = useState(false)
  const [activeFilter, setActiveFilter] = useState('For you')
  const [liked, setLiked] = useState(false)
  const [saved, setSaved] = useState(false)
  const [sheet, setSheet] = useState<'post' | 'soon' | null>(null)
  const [posted, setPosted] = useState(false)
  const [media, setMedia] = useState<{ url: string; type: string; name: string } | null>(null)
  const [postCategory, setPostCategory] = useState('Restaurants')
  const [sentiment, setSentiment] = useState('liked')
  const [experienceRatings, setExperienceRatings] = useState<Record<string, number>>({ Flavor: 3, Service: 3, Atmosphere: 3 })
  const [labels, setLabels] = useState(['date night'])
  const [labelInput, setLabelInput] = useState('')

  const changeTab = (tab: string) => {
    if (tab === 'Add') {
      setSheet('post')
      return
    }
    setSheet(null)
    if (tab === 'Discover') setDiscovered(true)
    setActiveTab(tab)
  }

  const selectMedia = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (media) URL.revokeObjectURL(media.url)
    setMedia({ url: URL.createObjectURL(file), type: file.type, name: file.name })
  }

  const chooseCategory = (category: string) => {
    setPostCategory(category)
    setExperienceRatings(Object.fromEntries(experienceCriteria[category].map((criterion) => [criterion, 3])))
  }

  const addLabel = () => {
    const value = labelInput.trim().replace(/^#/, '')
    if (!value || labels.includes(value)) return
    setLabels((current) => [...current, value])
    setLabelInput('')
  }

  const pageEyebrow = activeTab === 'Buddy' ? 'Your people' : activeTab === 'Profile' ? 'Your vibe' : activeTab === 'Discover' ? 'Around you' : 'Good morning, Mia'
  const pageTitle = activeTab === 'Buddy' ? 'Taste buddies' : activeTab === 'Profile' ? 'Taste profile' : activeTab === 'Discover' ? 'Discover' : 'What feels fun?'

  return (
    <main className="min-h-dvh bg-[#ebe5f5] text-[#292333] sm:py-6">
      <div className="app-shell">
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

        <div className="app-content">
          <div className="discovery-mount" hidden={activeTab !== 'Discover'}>
            {discovered && <DiscoverMap active={activeTab === 'Discover'} />}
          </div>
          {activeTab === 'Buddy' ? (
            <BuddyView />
          ) : activeTab === 'Profile' ? (
            <ProfileView />
          ) : activeTab === 'Discover' ? null : (
            <>
              <section className="filters" aria-label="Experience categories">
                {filters.map((filter) => (
                  <button key={filter} className={activeFilter === filter ? 'filter active' : 'filter'} onClick={() => setActiveFilter(filter)}>
                    {filter}
                  </button>
                ))}
              </section>

              <section className="hero-card">
                <Image src={potteryImage} sizes="(max-width: 430px) 100vw, 430px" alt="Friends shaping clay at a sunlit pottery workshop"/>
                <div className="image-shade"/>
                <div className="match-pill"><Icon name="sparkle" size={13}/> 96% your vibe</div>
                <button className={`save-button ${saved ? 'selected' : ''}`} onClick={() => setSaved(!saved)} aria-label={saved ? 'Remove from saved' : 'Save experience'}>
                  <Icon name="bookmark" size={20} filled={saved}/>
                </button>
                <div className="hero-copy">
                  <div className="meta-row"><span>CREATIVE</span><i/><span>THIS SATURDAY</span></div>
                  <h2>Clay & rosé: a slow pottery afternoon</h2>
                  <p><Icon name="map" size={15}/> Mend Studio · 1.2 mi</p>
                </div>
              </section>

              <section className="social-row">
                <div className="friends"><span>EL</span><span>JR</span><span>+4</span></div>
                <p><strong>Elena</strong> and 5 others want to go</p>
                <button className={liked ? 'liked' : ''} onClick={() => setLiked(!liked)} aria-label={liked ? 'Unlike' : 'Like'}>
                  <Icon name="heart" size={21} filled={liked}/><span>{liked ? 129 : 128}</span>
                </button>
              </section>

              <section className="section-heading">
                <div><p className="eyebrow">NEAR YOU</p><h3>Worth leaving home for</h3></div>
                <button>See all <Icon name="arrow" size={16}/></button>
              </section>

              <article className="mini-card">
                <Image src={rooftopImage} sizes="430px" alt="Friends sharing dinner on a rooftop at sunset"/>
                <div className="mini-copy">
                  <span className="category">FOOD & DRINK</span>
                  <h4>Secret rooftop supper</h4>
                  <p>Fri, 7:30 PM · Greenpoint</p>
                  <div><span className="rating">4.9</span><span> · $48 per person</span></div>
                </div>
                <button aria-label="Save rooftop supper"><Icon name="bookmark" size={18}/></button>
              </article>

              {posted && <div className="toast"><Icon name="sparkle" size={16}/> Your experience was shared</div>}
            </>
          )}
        </div>

        <nav className="bottom-nav" aria-label="Primary navigation">
          <NavButton label="Home" icon="home" active={activeTab === 'Home'} onClick={() => changeTab('Home')}/>
          <NavButton label="Discover" icon="pin" active={activeTab === 'Discover'} onClick={() => changeTab('Discover')}/>
          <button className="add-button" onClick={() => changeTab('Add')} aria-label="Add a post"><span><Icon name="plus" size={27}/></span><small>Add</small></button>
          <NavButton label="Buddy" icon="users" active={activeTab === 'Buddy'} onClick={() => changeTab('Buddy')}/>
          <NavButton label="Profile" icon="user" active={activeTab === 'Profile'} onClick={() => changeTab('Profile')}/>
        </nav>

        {sheet && (
          <div className="sheet-backdrop" onMouseDown={(event) => event.currentTarget === event.target && setSheet(null)}>
            <section className="sheet" role="dialog" aria-modal="true" aria-label={sheet === 'post' ? 'Create a post' : 'Coming soon'}>
              <div className="sheet-handle"/>
              <button className="sheet-close" onClick={() => setSheet(null)} aria-label="Close"><Icon name="close" size={20}/></button>
              {sheet === 'post' ? (
                <>
                  <p className="eyebrow">SHARE THE GOOD STUFF</p>
                  <h2>Add an experience</h2>
                  <div className="post-section category-section">
                    <div className="form-title"><strong>Add to a list</strong><span>Pick the best fit</span></div>
                    <div className="category-options">
                      {Object.keys(experienceCriteria).map((category) => <button key={category} type="button" className={postCategory === category ? 'selected' : ''} onClick={() => chooseCategory(category)}>{category}</button>)}
                    </div>
                  </div>
                  <div className="post-section sentiment-section">
                    <div className="form-title"><strong>How was it?</strong><span>Your overall take</span></div>
                    <div className="sentiment-options">
                      <button type="button" className={sentiment === 'liked' ? 'selected' : ''} onClick={() => setSentiment('liked')}><i className="green"><Icon name="heart" size={19}/></i><span>I liked it</span></button>
                      <button type="button" className={sentiment === 'okay' ? 'selected' : ''} onClick={() => setSentiment('okay')}><i className="yellow">—</i><span>It was okay</span></button>
                      <button type="button" className={sentiment === 'disliked' ? 'selected' : ''} onClick={() => setSentiment('disliked')}><i className="red"><Icon name="close" size={19}/></i><span>I didn’t like it</span></button>
                    </div>
                  </div>
                  <label className="media-picker">
                    <input type="file" accept="image/*,video/*" onChange={selectMedia}/>
                    {media ? (
                      <div className="media-preview">
                        {media.type.startsWith('video/') ? <video src={media.url} controls/> : <Image src={media.url} unoptimized width={96} height={96} alt="Selected upload preview"/>}
                        <span>{media.name}</span>
                      </div>
                    ) : (
                      <div className="media-empty">
                        <span><Icon name="plus" size={23}/></span>
                        <div><strong>Add photos or video</strong><small>Share the moment, not just the review</small></div>
                      </div>
                    )}
                  </label>
                  <label>What did you do?<input placeholder="e.g. Sunset pasta class"/></label>
                  <div className="form-grid">
                    <label>Who did you go with?
                      <select defaultValue=""><option value="" disabled>Select people</option><option>Elena & James</option><option>Alex</option><option>My partner</option><option>Family</option><option>Went solo</option></select>
                    </label>
                    <label>Date visited<input type="date"/></label>
                  </div>
                  <div className="labels-field">
                    <label>Labels</label>
                    <div className="labels-input"><input value={labelInput} onChange={(event) => setLabelInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addLabel() } }} placeholder="Add a label"/><button type="button" onClick={addLabel}><Icon name="plus" size={16}/></button></div>
                    <div className="added-labels">{labels.map((label) => <button key={label} type="button" onClick={() => setLabels((current) => current.filter((item) => item !== label))}>#{label} <Icon name="close" size={10}/></button>)}</div>
                  </div>
                  <label>Favorite parts<textarea placeholder="The dish, view, moment, or detail you loved..." rows={2}/></label>
                  <label>Notes<textarea placeholder="Anything you want to remember for next time?" rows={2}/></label>
                  <div className="rating-block">
                    <div className="form-title"><strong>Rate this {postCategory.toLowerCase()} experience</strong><span>Criteria tailored to your list</span></div>
                    {Object.entries(experienceRatings).map(([label, value]) => (
                      <ScaleRating key={label} label={label} value={value} onChange={(rating) => setExperienceRatings((current) => ({ ...current, [label]: rating }))}/>
                    ))}
                  </div>
                  <button className="primary-button" onClick={() => { setSheet(null); setActiveTab('Home'); setPosted(true); window.setTimeout(() => setPosted(false), 2800) }}>Share experience <Icon name="arrow" size={18}/></button>
                </>
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

function ProfileView() {
  const [tastes, setTastes] = useState({ Sweet: 4, Spicy: 3, Umami: 5 })
  const [experienceStyle, setExperienceStyle] = useState({ Adventurous: 5, Chill: 4 })

  return (
    <section className="profile-view">
      <div className="profile-card">
        <div className="avatar">MM<span><Icon name="sparkle" size={13}/></span></div>
        <div className="profile-name"><h2>Mia Morgan</h2><p>@miatastes · Brooklyn, NY</p></div>
        <p className="profile-bio">Always looking for tiny restaurants, tactile workshops, and plans worth crossing town for.</p>
        <div className="profile-stats">
          <div><strong>38</strong><span>Experiences</span></div>
          <div><strong>126</strong><span>Saved</span></div>
          <div><strong>24</strong><span>Buddies</span></div>
        </div>
      </div>

      <div className="taste-panel">
        <div className="panel-heading"><div><p className="eyebrow">TASTE BUDS</p><h3>Your flavor profile</h3></div><span>1–5</span></div>
        <p className="panel-intro">Tap a number to tune your matches and recommendations.</p>
        {Object.entries(tastes).map(([label, value]) => (
          <ScaleRating key={label} label={label} value={value} onChange={(rating) => setTastes((current) => ({ ...current, [label]: rating }))}/>
        ))}
      </div>

      <div className="taste-panel experience-panel">
        <div className="panel-heading"><div><p className="eyebrow">EXPERIENCE ENERGY</p><h3>How you like to go out</h3></div><span>1–5</span></div>
        {Object.entries(experienceStyle).map(([label, value]) => (
          <ScaleRating key={label} label={label} value={value} onChange={(rating) => setExperienceStyle((current) => ({ ...current, [label]: rating }))}/>
        ))}
      </div>

      <ActivityCalendar />
    </section>
  )
}

function ActivityCalendar() {
  const outingDays = new Set([2, 6, 9, 14, 18, 21, 27])
  const days = Array.from({ length: 35 }, (_, index) => index < 6 ? null : index - 5)

  return (
    <section className="calendar-card">
      <div className="calendar-heading">
        <div><p className="eyebrow">ACTIVITY</p><h3>June 2025</h3></div>
        <div className="calendar-legend"><i/> Went out</div>
      </div>
      <div className="calendar-grid weekdays">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, index) => <span key={`${day}-${index}`}>{day}</span>)}
      </div>
      <div className="calendar-grid calendar-days">
        {days.map((day, index) => (
          <span key={index} className={day && outingDays.has(day) ? 'outing-day' : ''}>{day}</span>
        ))}
      </div>
      <p className="calendar-summary"><strong>7 nights out</strong> this month · your most social month yet</p>
    </section>
  )
}

function ScaleRating({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <div className="scale-row">
      <span>{label}</span>
      <div role="radiogroup" aria-label={`${label} rating`}>
        {[1, 2, 3, 4, 5].map((rating) => (
          <button key={rating} className={rating <= value ? 'selected' : ''} onClick={() => onChange(rating)} role="radio" aria-checked={rating === value} type="button">{rating}</button>
        ))}
      </div>
    </div>
  )
}

export default App
