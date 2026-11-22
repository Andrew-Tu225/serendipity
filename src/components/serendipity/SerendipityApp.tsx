'use client'

import { useRef, useState, type ReactNode } from 'react'
import DiscoverMap from '@/components/map/discover-map'
import { ReviewComposer } from '@/components/experience/review-composer'
import { HomeDiscoveryFeed } from '@/components/home/home-discovery-feed'
import { mapPlace, type PlaceExperiences } from '@/types/discovery'
import type { Coordinates, MapPlace } from '@/types/places'
import { CharacterFigure } from '@/components/profile/character-figure'
import { CharacterPortrait } from '@/components/profile/character-portrait'
import { ProfileExperiencePanels } from '@/components/profile/profile-experiences'
import { demoPlaceLists } from '@/components/profile/demo-place-lists'
import { ProfilePlaceLists, type ListOwner } from '@/components/profile/profile-place-lists'
import { ProfileConnections } from '@/components/profile/profile-connections'
import { SettingsMenu } from '@/components/profile/settings-menu'
import { BuddyDeckCard } from '@/components/buddy/buddy-deck-card'
import { BuddyChat } from '@/components/buddy/buddy-messages'
import { BuddyInbox } from '@/components/buddy/buddy-inbox'
import { BuddyMatchSheet } from '@/components/buddy/buddy-match-sheet'
import { demoBuddyMessages } from '@/components/buddy/demo-buddies'
import { useBuddyDeck } from '@/hooks/use-buddy-deck'
import { useProfileExperiences } from '@/hooks/use-profile-experiences'
import { Icon, type IconName } from '@/components/ui/icon'
import type { ConnectionDirection } from '@/types/profile'
import { defaultCharacter, hairColors, hairStyles, miaCharacter, shirtColors, skinTones, type CharacterAppearance } from '@/types/character'
import { authClient } from '@/lib/api-client/auth'
import { profileClient } from '@/lib/api-client/profile'
import type { BuddyMessage, BuddyPerson, BuddySuggestion } from '@/types/buddies'

type ProfileScreen = { kind: 'lists'; owner: ListOwner }
  | { kind: ConnectionDirection; owner: { name: string; demo: boolean }; count: number }
type BuddyScreen = { kind: 'inbox' } | { kind: 'compose'; buddy: BuddySuggestion }
  | { kind: 'chat'; buddy: BuddyPerson; initialMessage?: BuddyMessage }

function App() {
  const [activeTab, setActiveTab] = useState('Home')
  const [discovered, setDiscovered] = useState(false)
  const [sheet, setSheet] = useState<'post' | 'soon' | null>(null)
  const [posted, setPosted] = useState(false)
  const [selectedPlace, setSelectedPlace] = useState<MapPlace | null>(null)
  const [reviewTarget, setReviewTarget] = useState<MapPlace | null>(null)
  const [reviewPoint, setReviewPoint] = useState<Coordinates | null>(null)
  const [picking, setPicking] = useState(false)
  const [reviewBusy, setReviewBusy] = useState(false)
  const [discoveryRevision, setDiscoveryRevision] = useState(0)
  const [reviewedPlace, setReviewedPlace] = useState<MapPlace | null>(null)
  const [profileScreen, setProfileScreen] = useState<ProfileScreen | null>(null)
  const [demoLists, setDemoLists] = useState(demoPlaceLists)
  const [demoCharacter, setDemoCharacter] = useState(miaCharacter)
  const profileTrigger = useRef<HTMLButtonElement>(null)
  const [buddyScreen, setBuddyScreen] = useState<BuddyScreen | null>(null)
  const [sampleMessages, setSampleMessages] = useState(demoBuddyMessages)
  const buddyDeck = useBuddyDeck(activeTab === 'Buddy')
  const inboxTrigger = useRef<HTMLButtonElement>(null)
  const subscreenOpen = profileScreen !== null || buddyScreen?.kind === 'inbox' || buddyScreen?.kind === 'chat'

  function closeProfileScreen() {
    setProfileScreen(null)
    requestAnimationFrame(() => profileTrigger.current?.focus())
  }

  function closeBuddyScreen() {
    setBuddyScreen(null)
    requestAnimationFrame(() => inboxTrigger.current?.focus())
  }

  function addSampleMessage(buddyId: string, message: BuddyMessage) {
    setSampleMessages((current) => ({ ...current, [buddyId]: [...(current[buddyId] ?? []), message] }))
  }

  function readSampleMessages(buddyId?: string) {
    setSampleMessages((current) => Object.fromEntries(Object.entries(current).map(([id, messages]) => [
      id, !buddyId || id === buddyId ? messages.map((message) => ({ ...message, unread: false })) : messages,
    ])))
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
    setDiscoveryRevision((value) => value + 1)
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

  const pageEyebrow = activeTab === 'Buddy' ? 'Your people' : activeTab === 'Profile' ? 'Your vibe' : activeTab === 'Discover' ? 'Around you' : 'London, Ontario'
  const pageTitle = activeTab === 'Buddy' ? 'Taste buddies' : activeTab === 'Profile' ? 'Profile' : activeTab === 'Discover' ? 'Discover' : 'Serendipity'

  return (
    <main className="min-h-dvh bg-[#ebe5f5] text-[#292333] sm:py-6">
      <div className={`app-shell${activeTab === 'Discover' ? ' is-discover' : ''}`}>
        {activeTab !== 'Discover' && !subscreenOpen && (
          <>
            <div className="status-bar" aria-hidden="true">
              <span>9:41</span>
              <div className="status-icons"><span className="signal"/><span className="wifi"/><span className="battery"/></div>
            </div>

            <header className={`topbar${activeTab === 'Home' ? ' home-topbar' : ''}`}>
              <div>
                <p className="eyebrow">{pageEyebrow}</p>
                <h1>{pageTitle}</h1>
              </div>
              {activeTab === 'Buddy' ? (
                <button ref={inboxTrigger} type="button" className="round-button" aria-label="Inbox" onClick={() => setBuddyScreen({ kind: 'inbox' })}>
                  <Icon name="message" size={20}/>
                </button>
              ) : activeTab === 'Profile' ? <SettingsMenu /> : (
                <button className="round-button" aria-label="Notifications"><Icon name="bell" size={20}/><span className="notification-dot"/></button>
              )}
            </header>
          </>
        )}

        <div className="app-content" hidden={subscreenOpen}>
          <div className="discovery-mount" hidden={activeTab !== 'Discover'}>
            {discovered && <DiscoverMap active={activeTab === 'Discover'} revision={discoveryRevision} reviewedPlace={reviewedPlace}
              selected={selectedPlace} onSelect={setSelectedPlace} onReview={startReview}
              picking={picking} onCancelPick={() => setPicking(false)}
              onPick={(point) => { setReviewPoint(point); setPicking(false); setSheet('post') }}/>}
          </div>
          {activeTab === 'Buddy' ? (
            <BuddyView deck={buddyDeck} onMessage={(buddy) => setBuddyScreen({ kind: 'compose', buddy })} />
          ) : activeTab === 'Profile' ? (
            <ProfileView demoListCount={demoLists.length} demoCharacter={demoCharacter} onDemoCharacter={setDemoCharacter}
              onCharacterSaved={() => {
                setReviewedPlace(null)
                setDiscoveryRevision((value) => value + 1)
              }} onOpenScreen={(screen, trigger) => {
              profileTrigger.current = trigger
              setProfileScreen(screen)
            }} />
          ) : activeTab === 'Discover' ? null : (
            <HomeDiscoveryFeed />
          )}
        </div>

        {posted && <div className="review-saved" role="status">Your experience was shared <button onClick={() => setPosted(false)} aria-label="Dismiss confirmation">×</button></div>}

        {!subscreenOpen && <nav className="bottom-nav" aria-label="Primary navigation">
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
        {buddyScreen?.kind === 'inbox' && (
          <BuddyInbox demo={buddyDeck.status === 'demo'} demoMessages={sampleMessages} onClose={closeBuddyScreen}
            onReadDemo={readSampleMessages} onOpen={(buddy) => setBuddyScreen({ kind: 'chat', buddy })} />
        )}
        {buddyScreen?.kind === 'compose' && (
          <BuddyMatchSheet buddy={buddyScreen.buddy} demo={buddyDeck.status === 'demo'} onClose={() => setBuddyScreen(null)}
            onSent={(message) => {
              const buddy = buddyScreen.buddy
              if (buddyDeck.status === 'demo') {
                addSampleMessage(buddy.id, message)
                readSampleMessages(buddy.id)
              }
              buddyDeck.remove(buddy.id)
              setBuddyScreen({ kind: 'chat', buddy, initialMessage: message })
            }} />
        )}
        {buddyScreen?.kind === 'chat' && (
          <BuddyChat key={buddyScreen.buddy.id} buddy={buddyScreen.buddy} demo={buddyDeck.status === 'demo'}
            initialMessage={buddyScreen.initialMessage}
            demoMessages={sampleMessages[buddyScreen.buddy.id] ?? []}
            onDemoMessage={(message) => addSampleMessage(buddyScreen.buddy.id, message)}
            onSent={() => buddyDeck.remove(buddyScreen.buddy.id)}
            onBack={() => setBuddyScreen({ kind: 'inbox' })} />
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

function BuddyView({ deck, onMessage }: { deck: ReturnType<typeof useBuddyDeck>; onMessage: (buddy: BuddySuggestion) => void }) {
  const [mode, setMode] = useState<'local' | 'worldwide'>('local')
  const buddy = deck.cards[0]
  return (
    <section className="buddy-view">
      <div className="buddy-modes" role="tablist" aria-label="Buddy location">
        <button className={mode === 'local' ? 'active' : ''} onClick={() => setMode('local')} role="tab" aria-selected={mode === 'local'}><Icon name="pin" size={15}/> {deck.status === 'demo' ? 'Local' : 'For you'}</button>
        <button className={mode === 'worldwide' ? 'active' : ''} onClick={() => setMode('worldwide')} role="tab" aria-selected={mode === 'worldwide'}><Icon name="globe" size={15}/> Worldwide <Icon name="lock" size={11}/></button>
      </div>
      {mode === 'local' ? (
        <>
          <p className="buddy-intro">Find people with similar tastes and make a plan.</p>
          {deck.status === 'demo' && (
            <div className="local-progress">
              <div className="progress-copy"><span><Icon name="globe" size={16}/></span><p><strong>Worldwide is 70% unlocked</strong><small>Rate 3 more local experiences</small></p></div>
              <div className="progress-track"><i/></div>
            </div>
          )}
          {(deck.status === 'ready' || deck.status === 'demo') && (buddy ? (
            <BuddyDeckCard key={buddy.id} buddy={buddy} busy={deck.skipping}
              onSkip={() => void deck.skip(buddy.id)} onMessage={() => onMessage(buddy)} />
          ) : <div className="buddy-card buddy-empty"><p>You’re caught up on Taste Buddies.</p>
            {deck.status === 'ready' && <button className="place-lists-action" type="button" onClick={deck.reload}>Check for more</button>}
          </div>)}
          {deck.status === 'loading' && <p className="place-lists-message" role="status">Loading Taste Buddies…</p>}
          {deck.status === 'error' && <p className="place-lists-message" role="alert">Couldn’t load Taste Buddies. <button className="profile-history-button" type="button" onClick={deck.reload}>Try again</button></p>}
          {deck.skipError && <p className="place-lists-message" role="alert">{deck.skipError}</p>}
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
        <div className="locked-avatar avatar-paris"><CharacterPortrait identity="Paris buddy" size={30}/></div>
        <div className="locked-avatar avatar-tokyo"><CharacterPortrait identity="Tokyo buddy" size={30}/></div>
        <div className="locked-avatar avatar-mexico"><CharacterPortrait identity="Mexico City buddy" size={30}/></div>
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

function ProfileView({ demoListCount, demoCharacter, onDemoCharacter, onCharacterSaved, onOpenScreen }: {
  demoListCount: number
  demoCharacter: CharacterAppearance
  onDemoCharacter: (character: CharacterAppearance) => void
  onCharacterSaved: () => void
  onOpenScreen: (screen: ProfileScreen, trigger: HTMLButtonElement) => void
}) {
  const { profile, retry, updateCharacter } = useProfileExperiences()
  const [draft, setDraft] = useState<CharacterAppearance | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const character = profile.status === 'ready'
    ? profile.data.character ?? defaultCharacter(profile.data.user_id)
    : demoCharacter

  async function saveCharacter() {
    if (!draft || saving) return
    if (profile.status === 'demo') {
      onDemoCharacter(draft)
      setDraft(null)
      return
    }
    if (profile.status !== 'ready') return
    setSaving(true)
    setSaveError('')
    try {
      const session = await authClient.getSession()
      if (session.user.id !== profile.data.user_id) throw new Error('Your session changed. Open Profile again to edit your character.')
      updateCharacter(await profileClient.saveCharacter(draft, session.csrf_token))
      onCharacterSaved()
      setDraft(null)
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Couldn’t save your character. Try again.')
    } finally {
      setSaving(false)
    }
  }
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

  if (profile.status === 'loading') {
    return (
      <section className="profile-view profile-loading" role="status" aria-live="polite">
        <span className="profile-spinner" aria-hidden="true"/>
        <span className="sr-only">Loading your profile…</span>
      </section>
    )
  }
  if (profile.status === 'error') {
    return (
      <section className="profile-view">
        <div className="profile-experience-message" role="alert">
          Couldn’t load your profile. <button type="button" className="profile-history-button" onClick={retry}>Try again</button>
        </div>
      </section>
    )
  }

  return (
    <section className="profile-view">
      <div className="profile-card">
        <button className="avatar character-avatar" disabled={!identity} onClick={() => { setSaveError(''); setDraft(character) }} aria-label="Customize your character">
          <CharacterPortrait identity={identity?.owner.name ?? 'Mia Morgan'} appearance={character}/>
          <span className="character-edit-badge"><Icon name="sparkle" size={13}/></span>
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
      {draft && <CharacterCustomizer value={draft} onChange={setDraft} onClose={() => setDraft(null)}
        onSave={saveCharacter} saving={saving} error={saveError}/>}
    </section>
  )
}


function CharacterCustomizer({ value, onChange, onClose, onSave, saving, error }: {
  value: CharacterAppearance
  onChange: (value: CharacterAppearance) => void
  onClose: () => void
  onSave: () => void
  saving: boolean
  error: string
}) {
  const update = <K extends keyof CharacterAppearance>(key: K, next: CharacterAppearance[K]) => onChange({ ...value, [key]: next })

  return (
    <section className="character-studio" role="dialog" aria-modal="true" aria-label="Customize your character">
      <header className="studio-header">
        <button onClick={onClose} disabled={saving} aria-label="Back to profile"><Icon name="arrow" size={20}/></button>
        <div><p className="eyebrow">YOUR LOOK</p><h2>Customize character</h2></div>
        <button className="studio-done" onClick={onSave} disabled={saving}>{saving ? 'Saving…' : 'Done'}</button>
      </header>
      <div className="character-preview">
        <CharacterFigure options={value}/>
        <p>Your profile picture shows your face and shoulders</p>
      </div>
      {error && <p className="character-save-error" role="alert">{error}</p>}
      <fieldset className="customizer-controls" disabled={saving}>
        <ControlGroup title="Features">
          <div className="option-pills">
            {(['feminine', 'masculine'] as const).map((option) => <button key={option} className={value.features === option ? 'selected' : ''} onClick={() => update('features', option)}>{option === 'feminine' ? 'Feminine' : 'Masculine'}</button>)}
          </div>
        </ControlGroup>
        <ControlGroup title="Hair style">
          <div className="option-pills four">
            {hairStyles.map((option) => <button key={option} className={value.hairStyle === option ? 'selected' : ''} onClick={() => update('hairStyle', option)}>{option[0].toUpperCase() + option.slice(1)}</button>)}
          </div>
        </ControlGroup>
        <ControlGroup title="Hair color">
          <ColorSwatches colors={hairColors} value={value.hairColor} onChange={(color) => update('hairColor', color)}/>
        </ControlGroup>
        <ControlGroup title="Skin tone">
          <ColorSwatches colors={skinTones} value={value.skinTone} onChange={(color) => update('skinTone', color)}/>
        </ControlGroup>
        <ControlGroup title="Shirt">
          <ColorSwatches colors={shirtColors} value={value.shirt} onChange={(color) => update('shirt', color)}/>
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
      </fieldset>
    </section>
  )
}

function ControlGroup({ title, children }: { title: string; children: ReactNode }) {
  return <div className="control-group"><p>{title}</p>{children}</div>
}

function ColorSwatches({ colors, value, onChange }: { colors: string[]; value: string; onChange: (color: string) => void }) {
  return <div className="color-swatches">{colors.map((color) => <button key={color} className={value === color ? 'selected' : ''} style={{ backgroundColor: color }} onClick={() => onChange(color)} aria-label={`Choose color ${color}`}/>)}</div>
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
