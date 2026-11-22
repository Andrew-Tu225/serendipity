'use client'

import Image from 'next/image'
import { useRef, useState, type ReactNode } from 'react'
import potteryImage from './assets/pottery-workshop.png'
import rooftopImage from './assets/rooftop-dinner.png'
import DiscoverMap from '@/components/map/discover-map'
import { ReviewComposer } from '@/components/experience/review-composer'
import { mapPlace, type PlaceExperiences } from '@/types/discovery'
import type { Coordinates, MapPlace } from '@/types/places'
import { FriendAvatar } from '@/components/map/friend-avatar'
import { ProfileExperiencePanels } from '@/components/profile/profile-experiences'
import { demoPlaceLists } from '@/components/profile/demo-place-lists'
import { ProfilePlaceLists, type ListOwner } from '@/components/profile/profile-place-lists'
import { ProfileConnections } from '@/components/profile/profile-connections'
import { useProfileExperiences } from '@/hooks/use-profile-experiences'
import { Icon, type IconName } from '@/components/ui/icon'
import type { ConnectionDirection } from '@/types/profile'

const filters = ['For you', 'Food', 'Creative', 'Outdoors', 'Music']

type ProfileScreen = { kind: 'lists'; owner: ListOwner }
  | { kind: ConnectionDirection; owner: { name: string; demo: boolean }; count: number }

function App() {
  const [activeTab, setActiveTab] = useState('Home')
  const [discovered, setDiscovered] = useState(false)
  const [activeFilter, setActiveFilter] = useState('For you')
  const [liked, setLiked] = useState(false)
  const [saved, setSaved] = useState(false)
  const [sheet, setSheet] = useState<'post' | 'soon' | null>(null)
  const [posted, setPosted] = useState(false)
  const [selectedPlace, setSelectedPlace] = useState<MapPlace | null>(null)
  const [reviewTarget, setReviewTarget] = useState<MapPlace | null>(null)
  const [reviewPoint, setReviewPoint] = useState<Coordinates | null>(null)
  const [picking, setPicking] = useState(false)
  const [reviewBusy, setReviewBusy] = useState(false)
  const [reviewRevision, setReviewRevision] = useState(0)
  const [reviewedPlace, setReviewedPlace] = useState<MapPlace | null>(null)
  const [profileScreen, setProfileScreen] = useState<ProfileScreen | null>(null)
  const [demoLists, setDemoLists] = useState(demoPlaceLists)
  const profileTrigger = useRef<HTMLButtonElement>(null)

  function closeProfileScreen() {
    setProfileScreen(null)
    requestAnimationFrame(() => profileTrigger.current?.focus())
  }

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
    setReviewedPlace(mapPlace(result.place))
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

  const pageEyebrow = activeTab === 'Buddy' ? 'Your people' : activeTab === 'Profile' ? 'Your vibe' : activeTab === 'Discover' ? 'Around you' : 'Good morning, Mia'
  const pageTitle = activeTab === 'Buddy' ? 'Taste buddies' : activeTab === 'Profile' ? 'Profile' : activeTab === 'Discover' ? 'Discover' : 'What feels fun?'

  return (
    <main className="min-h-dvh bg-[#ebe5f5] text-[#292333] sm:py-6">
      <div className={`app-shell${activeTab === 'Discover' ? ' is-discover' : ''}`}>
        {activeTab !== 'Discover' && !profileScreen && (
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

        <div className="app-content" hidden={profileScreen !== null}>
          <div className="discovery-mount" hidden={activeTab !== 'Discover'}>
            {discovered && <DiscoverMap active={activeTab === 'Discover'} revision={reviewRevision} reviewedPlace={reviewedPlace}
              selected={selectedPlace} onSelect={setSelectedPlace} onReview={startReview}
              picking={picking} onCancelPick={() => setPicking(false)}
              onPick={(point) => { setReviewPoint(point); setPicking(false); setSheet('post') }}/>}
          </div>
          {activeTab === 'Buddy' ? (
            <BuddyView />
          ) : activeTab === 'Profile' ? (
            <ProfileView demoListCount={demoLists.length} onOpenScreen={(screen, trigger) => {
              profileTrigger.current = trigger
              setProfileScreen(screen)
            }} />
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

            </>
          )}
        </div>

        {posted && <div className="review-saved" role="status">Your experience was shared <button onClick={() => setPosted(false)} aria-label="Dismiss confirmation">×</button></div>}

        {!profileScreen && <nav className="bottom-nav" aria-label="Primary navigation">
          <NavButton label="Home" icon="home" active={activeTab === 'Home'} onClick={() => changeTab('Home')}/>
          <NavButton label="Discover" icon="pin" active={activeTab === 'Discover'} onClick={() => changeTab('Discover')}/>
          <button className="add-button" onClick={() => changeTab('Add')} aria-label="Add a post"><span><Icon name="plus" size={27}/></span><small>Add</small></button>
          <NavButton label="Buddy" icon="users" active={activeTab === 'Buddy'} onClick={() => changeTab('Buddy')}/>
          <NavButton label="Profile" icon="user" active={activeTab === 'Profile'} onClick={() => changeTab('Profile')}/>
        </nav>}

        {profileScreen?.kind === 'lists' && (
          <ProfilePlaceLists owner={profileScreen.owner} demoLists={demoLists}
            onAdd={(list) => setDemoLists((current) => [list, ...current])}
            onClose={closeProfileScreen} />
        )}
        {profileScreen && profileScreen.kind !== 'lists' && (
          <ProfileConnections direction={profileScreen.kind} owner={profileScreen.owner}
            count={profileScreen.count} onClose={closeProfileScreen} />
        )}

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

function ProfileView({ demoListCount, onOpenScreen }: {
  demoListCount: number
  onOpenScreen: (screen: ProfileScreen, trigger: HTMLButtonElement) => void
}) {
  const { profile, retry } = useProfileExperiences()
  const [customizing, setCustomizing] = useState(false)
  const [character, setCharacter] = useState<CharacterOptions>({
    features: 'feminine',
    hairStyle: 'wavy',
    hairColor: '#5a392c',
    shirt: '#8664a0',
    pants: '#4d526b',
    shoes: '#eee8f2',
    hat: 'none',
  })
  const identity = profile.status === 'demo' ? {
    owner: { name: 'Mia Morgan', demo: true } as const,
    followers: 382,
    following: 214,
    lists: demoListCount,
  } : profile.status === 'ready' ? {
    owner: { name: profile.data.display_name || 'Your profile', demo: false, bookmarkCount: profile.data.bookmark_count } as const,
    followers: profile.data.follower_count,
    following: profile.data.following_count,
    lists: 1,
  } : null

  return (
    <section className="profile-view">
      <div className="profile-card">
        <button className="avatar character-avatar" onClick={() => setCustomizing(true)} aria-label="Customize your character">
          <CharacterFigure options={character} compact/>
          <span><Icon name="sparkle" size={13}/></span>
        </button>
        {identity && <>
          <div className="profile-name">
            <h2>{identity.owner.name}</h2>
            {identity.owner.demo && <p>@miatastes · Brooklyn, NY</p>}
          </div>
          {identity.owner.demo && <p className="profile-bio">Always looking for tiny restaurants, tactile workshops, and plans worth crossing town for.</p>}
          <div className="profile-stats">
            <button type="button" aria-label="Followers" onClick={(event) => onOpenScreen({ kind: 'followers', owner: identity.owner, count: identity.followers }, event.currentTarget)}>
              <strong>{identity.followers}</strong><span>Followers</span>
            </button>
            <button type="button" aria-label="Following" onClick={(event) => onOpenScreen({ kind: 'following', owner: identity.owner, count: identity.following }, event.currentTarget)}>
              <strong>{identity.following}</strong><span>Following</span>
            </button>
            <button type="button" aria-label="Lists" onClick={(event) => onOpenScreen({ kind: 'lists', owner: identity.owner }, event.currentTarget)}>
              <strong>{identity.lists}</strong><span>Lists</span>
            </button>
          </div>
        </>}
      </div>

      {profile.status === 'demo' && <><ProfileExperiencePanels /><ActivityCalendar /></>}
      {profile.status === 'ready' && <ProfileExperiencePanels data={profile.data} />}
      {profile.status === 'loading' && <p className="profile-experience-message" role="status">Loading your experiences…</p>}
      {profile.status === 'error' && (
        <div className="profile-experience-message" role="alert">
          Couldn’t load your experiences. <button type="button" className="profile-history-button" onClick={retry}>Try again</button>
        </div>
      )}
      {customizing && <CharacterCustomizer value={character} onChange={setCharacter} onClose={() => setCustomizing(false)}/>}
    </section>
  )
}

type CharacterOptions = {
  features: 'feminine' | 'masculine'
  hairStyle: 'short' | 'wavy' | 'curly' | 'bun'
  hairColor: string
  shirt: string
  pants: string
  shoes: string
  hat: 'none' | 'cap' | 'beanie'
}

function CharacterCustomizer({ value, onChange, onClose }: { value: CharacterOptions; onChange: (value: CharacterOptions) => void; onClose: () => void }) {
  const update = <K extends keyof CharacterOptions>(key: K, next: CharacterOptions[K]) => onChange({ ...value, [key]: next })

  return (
    <section className="character-studio" role="dialog" aria-modal="true" aria-label="Customize your character">
      <header className="studio-header">
        <button onClick={onClose} aria-label="Back to profile"><Icon name="arrow" size={20}/></button>
        <div><p className="eyebrow">YOUR LOOK</p><h2>Customize character</h2></div>
        <button className="studio-done" onClick={onClose}>Done</button>
      </header>
      <div className="character-preview">
        <CharacterFigure options={value}/>
        <p>This is how friends see you on the map</p>
      </div>
      <div className="customizer-controls">
        <ControlGroup title="Features">
          <div className="option-pills">
            {(['feminine', 'masculine'] as const).map((option) => <button key={option} className={value.features === option ? 'selected' : ''} onClick={() => update('features', option)}>{option === 'feminine' ? 'Feminine' : 'Masculine'}</button>)}
          </div>
        </ControlGroup>
        <ControlGroup title="Hair style">
          <div className="option-pills four">
            {(['short', 'wavy', 'curly', 'bun'] as const).map((option) => <button key={option} className={value.hairStyle === option ? 'selected' : ''} onClick={() => update('hairStyle', option)}>{option[0].toUpperCase() + option.slice(1)}</button>)}
          </div>
        </ControlGroup>
        <ControlGroup title="Hair color">
          <ColorSwatches colors={['#211d20', '#5a392c', '#9a6038', '#e1b36d', '#a75b75', '#74558f']} value={value.hairColor} onChange={(color) => update('hairColor', color)}/>
        </ControlGroup>
        <ControlGroup title="Shirt">
          <ColorSwatches colors={['#8664a0', '#d5747f', '#4e8379', '#d79d4f', '#517099', '#332e38']} value={value.shirt} onChange={(color) => update('shirt', color)}/>
        </ControlGroup>
        <ControlGroup title="Pants">
          <ColorSwatches colors={['#4d526b', '#2f3037', '#6e5547', '#8290a3', '#786078']} value={value.pants} onChange={(color) => update('pants', color)}/>
        </ControlGroup>
        <ControlGroup title="Shoes">
          <ColorSwatches colors={['#eee8f2', '#28252a', '#966a50', '#b66972', '#6e7184']} value={value.shoes} onChange={(color) => update('shoes', color)}/>
        </ControlGroup>
        <ControlGroup title="Hat">
          <div className="option-pills">
            {(['none', 'cap', 'beanie'] as const).map((option) => <button key={option} className={value.hat === option ? 'selected' : ''} onClick={() => update('hat', option)}>{option[0].toUpperCase() + option.slice(1)}</button>)}
          </div>
        </ControlGroup>
      </div>
    </section>
  )
}

function ControlGroup({ title, children }: { title: string; children: ReactNode }) {
  return <div className="control-group"><p>{title}</p>{children}</div>
}

function ColorSwatches({ colors, value, onChange }: { colors: string[]; value: string; onChange: (color: string) => void }) {
  return <div className="color-swatches">{colors.map((color) => <button key={color} className={value === color ? 'selected' : ''} style={{ backgroundColor: color }} onClick={() => onChange(color)} aria-label={`Choose color ${color}`}/>)}</div>
}

function CharacterFigure({ options, compact = false }: { options: CharacterOptions; compact?: boolean }) {
  const feminine = options.features === 'feminine'
  return (
    <svg className={compact ? 'character-figure compact' : 'character-figure'} viewBox="0 0 180 320" aria-hidden="true">
      <ellipse cx="90" cy="307" rx="48" ry="8" fill="rgba(55,42,63,.13)"/>
      <path d="M61 185 55 279h31l5-94ZM92 185l3 94h31l-8-94Z" fill={options.pants}/>
      <path d="M52 274h36v24H43c0-10 3-18 9-24ZM94 274h34c7 6 10 14 9 24H94Z" fill={options.shoes}/>
      <path d={feminine ? 'M56 123c12-15 55-15 68 0l9 72H47Z' : 'M51 124c16-16 62-16 78 0l4 71H47Z'} fill={options.shirt}/>
      <path d="m55 132-26 54M125 132l26 54" fill="none" stroke="#dca985" strokeWidth="18" strokeLinecap="round"/>
      <circle cx="27" cy="190" r="10" fill="#dca985"/><circle cx="153" cy="190" r="10" fill="#dca985"/>
      <rect x="80" y="101" width="20" height="29" rx="9" fill="#dca985"/>
      {options.hairStyle === 'wavy' && <path d="M50 72C50 25 70 11 91 11s43 15 42 63c15 30 4 62-14 74l-8-47H67l-7 48c-23-15-24-48-10-77Z" fill={options.hairColor}/>}
      {options.hairStyle === 'short' && <path d="M54 77C52 34 67 17 91 17c27 0 39 21 37 58l-15-20c-19 8-38 7-59 22Z" fill={options.hairColor}/>}
      {options.hairStyle === 'curly' && <><circle cx="59" cy="53" r="23" fill={options.hairColor}/><circle cx="86" cy="35" r="25" fill={options.hairColor}/><circle cx="116" cy="48" r="24" fill={options.hairColor}/><circle cx="126" cy="78" r="23" fill={options.hairColor}/><circle cx="54" cy="84" r="22" fill={options.hairColor}/></>}
      {options.hairStyle === 'bun' && <><circle cx="91" cy="23" r="24" fill={options.hairColor}/><path d="M53 76C52 34 69 20 91 20s39 16 38 56l-15-20c-19 7-38 6-61 20Z" fill={options.hairColor}/></>}
      <path d={feminine ? 'M58 68c0-35 14-49 33-49s34 16 33 49v26c0 25-14 40-33 40S58 119 58 94Z' : 'M57 69c0-34 15-48 34-48s35 15 34 48v27c0 24-15 39-34 39S57 120 57 96Z'} fill="#dca985"/>
      <path d="M57 70C57 37 71 19 91 19s35 18 35 50c-10-3-18-9-24-18-10 8-24 13-45 19Z" fill={options.hairColor}/>
      <path d="M58 70c7-2 15-18 19-34 11 18 27 24 48 22" fill="none" stroke={options.hairColor} strokeWidth="14" strokeLinecap="round"/>
      {feminine ? <><path d="m69 82 8-2M105 80l8 2" stroke="#3f303a" strokeWidth="3" strokeLinecap="round"/><path d="M72 86h8M102 86h8" stroke="#3f303a" strokeWidth="2.5" strokeLinecap="round"/></> : <><path d="M69 80h11M102 80h11" stroke="#3f303a" strokeWidth="4" strokeLinecap="round"/></>}
      <circle cx="76" cy="87" r="3" fill="#3f303a"/><circle cx="107" cy="87" r="3" fill="#3f303a"/>
      <path d="M81 111c7 6 14 6 21 0" fill="none" stroke="#9b565c" strokeWidth="3" strokeLinecap="round"/>
      {options.hat === 'cap' && <><path d="M50 49c6-30 26-42 44-42 22 0 37 15 39 41Z" fill={options.shirt}/><path d="M91 46h57c-8 10-31 12-57 8Z" fill={options.shirt}/></>}
      {options.hat === 'beanie' && <><path d="M53 54C53 18 70 2 91 2s38 17 38 52Z" fill={options.shirt}/><rect x="50" y="43" width="81" height="17" rx="8" fill={options.shirt}/></>}
    </svg>
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

export default App
