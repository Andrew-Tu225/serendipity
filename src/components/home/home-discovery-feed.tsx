'use client'

import Image, { type StaticImageData } from 'next/image'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import potteryImage from '@/components/serendipity/assets/pottery-workshop.png'
import rooftopImage from '@/components/serendipity/assets/rooftop-dinner.png'
import { CharacterPortrait } from '@/components/profile/character-portrait'

const heroSlides = [
  {
    image: '/london-covent-market.svg',
    place: 'Covent Garden Market',
    eyebrow: 'LONDON, ONTARIO',
    title: 'A little local goes a long way.',
    description: 'See what your people found downtown.',
    alt: 'Illustration of the clock tower at Covent Garden Market in London, Ontario',
  },
  {
    image: '/london-victoria-park.svg',
    place: 'Victoria Park',
    eyebrow: 'RIGHT AROUND THE CORNER',
    title: 'Your next favourite place is out there.',
    description: 'Start with the places your friends love.',
    alt: 'Illustration of a leafy path and historic park gate at Victoria Park',
  },
]

type Verdict = 'good' | 'okay' | 'bad'
type Category = 'Food' | 'Outdoors' | 'Creative'

type FeedExperience = {
  id: string
  author: string
  time: string
  place: string
  area: string
  category: Category
  rating: string
  verdict: Verdict
  review: string
  image: string | StaticImageData
  imageAlt: string
  likes: number
  comments: number
  mediaType?: 'video'
}

const experiences: FeedExperience[] = [
  {
    id: 'elena-market', author: 'Elena Rivera', time: '2h',
    place: 'Covent Garden Market', area: 'Downtown London', category: 'Food',
    rating: '4.8', verdict: 'good', review: 'Went for one thing, left with a whole afternoon of little discoveries.',
    image: '/london-covent-market.svg', imageAlt: 'Covent Garden Market clock tower', likes: 24, comments: 3,
  },
  {
    id: 'james-park', author: 'James Wu', time: 'Yesterday',
    place: 'Victoria Park', area: 'Central London', category: 'Outdoors',
    rating: '4.5', verdict: 'good', review: 'The long way around is the best way around. Take a coffee and wander.',
    image: '/london-victoria-park.svg', imageAlt: 'A quiet path through Victoria Park', likes: 18, comments: 5,
  },
  {
    id: 'maya-studio', author: 'Maya Patel', time: 'Yesterday',
    place: 'A pottery afternoon', area: 'Old East Village', category: 'Creative',
    rating: '3.0', verdict: 'okay', review: 'A bit messier than I expected, but honestly that was half the fun.',
    image: potteryImage, imageAlt: 'Friends making pottery together', likes: 11, comments: 2, mediaType: 'video',
  },
  {
    id: 'alex-dinner', author: 'Alex Morgan', time: '2 days',
    place: 'Dinner with a view', area: 'Downtown London', category: 'Food',
    rating: '2.0', verdict: 'bad', review: 'The view was lovely. The rest of the evening missed the mark for me.',
    image: rooftopImage, imageAlt: 'Friends sharing dinner on a rooftop at sunset', likes: 7, comments: 4,
  },
]

const filters: Array<'For you' | Category> = ['For you', 'Outdoors', 'Food', 'Creative']

function Icon({ name, size = 20, filled = false }: { name: 'spark' | 'leaf' | 'food' | 'creative' | 'search' | 'pin' | 'heart' | 'comment' | 'share' | 'bookmark' | 'play' | 'next'; size?: number; filled?: boolean }) {
  const paths = {
    spark: <path d="m12 2 1.7 6.3L20 10l-6.3 1.7L12 18l-1.7-6.3L4 10l6.3-1.7L12 2Zm6 12 .9 3.1L22 18l-3.1.9L18 22l-.9-3.1L14 18l3.1-.9L18 14Z"/>,
    leaf: <><path d="M20 4c-8 0-13 3.4-13 9a5 5 0 0 0 5 5c5.6 0 8-6 8-14Z"/><path d="M4 21c2-5 6-8 11-11"/></>,
    food: <><path d="M4 3v7m4-7v7M4 7h4m-2 3v11M17 3c-3 2-4 6-2 9h2v9m0-18v9"/></>,
    creative: <><path d="M12 3a9 9 0 1 0 0 18h1.2a2 2 0 0 0 1.4-3.4 1.9 1.9 0 0 1 1.4-3.2H18a3 3 0 0 0 3-3c0-4.6-4-8.4-9-8.4Z"/><circle cx="7.5" cy="10" r=".8"/><circle cx="11" cy="7" r=".8"/><circle cx="15.5" cy="8" r=".8"/></>,
    search: <><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 4.5 4.5"/></>,
    pin: <><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></>,
    heart: <path d="M20.8 4.7a5.5 5.5 0 0 0-7.8 0L12 5.8l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.4 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z"/>,
    comment: <path d="M20 11.5a7.5 7.5 0 0 1-8 7.5 8.6 8.6 0 0 1-3.7-.8L4 20l1.4-3.7A7.1 7.1 0 0 1 4 11.5 7.5 7.5 0 0 1 12 4a7.5 7.5 0 0 1 8 7.5Z"/>,
    share: <><path d="M12 16V4m-4 4 4-4 4 4"/><path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/></>,
    bookmark: <path d="M6 4.8A1.8 1.8 0 0 1 7.8 3h8.4A1.8 1.8 0 0 1 18 4.8V21l-6-3.5L6 21V4.8Z"/>,
    play: <path d="m9 6 9 6-9 6V6Z"/>,
    next: <path d="m9 5 7 7-7 7"/>,
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}

function CategoryIcon({ category }: { category: 'For you' | Category }) {
  const icon = category === 'For you' ? 'spark' : category === 'Outdoors' ? 'leaf' : category === 'Food' ? 'food' : 'creative'
  return <Icon name={icon} size={17}/>
}

export function HomeDiscoveryFeed() {
  const [activeSlide, setActiveSlide] = useState(0)
  const [activeFilter, setActiveFilter] = useState<(typeof filters)[number]>('For you')
  const [search, setSearch] = useState('')
  const [liked, setLiked] = useState<string[]>([])
  const [saved, setSaved] = useState<string[]>([])
  const [openComments, setOpenComments] = useState<string | null>(null)

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const timer = window.setInterval(() => setActiveSlide((current) => (current + 1) % heroSlides.length), 6500)
    return () => window.clearInterval(timer)
  }, [])

  const visibleExperiences = useMemo(() => experiences.filter((item) => {
    const matchesCategory = activeFilter === 'For you' || item.category === activeFilter
    const needle = search.trim().toLowerCase()
    const matchesSearch = !needle || `${item.place} ${item.area} ${item.author} ${item.review} ${item.category}`.toLowerCase().includes(needle)
    return matchesCategory && matchesSearch
  }), [activeFilter, search])

  const changeSlide = (direction: number) => setActiveSlide((current) => (current + direction + heroSlides.length) % heroSlides.length)

  const shareExperience = async (item: FeedExperience) => {
    const url = `${window.location.origin}/?experience=${item.id}`
    try {
      if (navigator.share) await navigator.share({ title: item.place, text: item.review, url })
      else await navigator.clipboard.writeText(url)
    } catch {
      // A dismissed share sheet needs no follow-up.
    }
  }

  const submitSearch = (event: FormEvent<HTMLFormElement>) => event.preventDefault()

  return (
    <div className="home-discovery-feed">
      <section className="landmark-carousel" aria-label="Local places to discover">
        {heroSlides.map((slide, index) => (
          <div className={`landmark-slide${index === activeSlide ? ' is-active' : ''}`} key={slide.place} aria-hidden={index !== activeSlide}>
            <Image src={slide.image} alt={slide.alt} fill sizes="(max-width: 430px) 100vw, 430px" priority={index === 0} unoptimized/>
            <div className="landmark-shade"/>
            <div className="landmark-copy">
              <span className="landmark-eyebrow">{slide.eyebrow}</span>
              <h2>{slide.title}</h2>
              <p><Icon name="pin" size={14}/>{slide.place} <span>·</span> {slide.description}</p>
            </div>
          </div>
        ))}
        <button className="landmark-next" type="button" aria-label="Next local place" onClick={() => changeSlide(1)}><Icon name="next" size={19}/></button>
        <div className="landmark-dots" aria-label="Choose a featured place">
          {heroSlides.map((slide, index) => <button key={slide.place} className={index === activeSlide ? 'active' : ''} type="button" aria-label={`Show ${slide.place}`} aria-current={index === activeSlide ? 'true' : undefined} onClick={() => setActiveSlide(index)}/>) }
        </div>
      </section>

      <section className="home-discovery-controls" aria-labelledby="feeling-heading">
        <p className="eyebrow">A GOOD PLACE TO START</p>
        <h2 id="feeling-heading">What feels fun?</h2>
        <div className="filters" aria-label="Filter experiences by category">
          {filters.map((filter) => <button key={filter} type="button" className={`filter${activeFilter === filter ? ' active' : ''}`} aria-pressed={activeFilter === filter} onClick={() => setActiveFilter(filter)}><CategoryIcon category={filter}/>{filter}</button>)}
        </div>
        <form className="home-search" role="search" onSubmit={submitSearch}>
          <Icon name="search" size={19}/>
          <input aria-label="Search places and experiences" placeholder="Search places, people, or moods" value={search} onChange={(event) => setSearch(event.target.value)}/>
          {search && <button type="button" className="clear-search" aria-label="Clear search" onClick={() => setSearch('')}>×</button>}
        </form>
      </section>

      <section className="experience-feed" aria-labelledby="feed-heading">
        <div className="feed-section-heading">
          <div><p className="eyebrow">FROM YOUR PEOPLE</p><h2 id="feed-heading">Fresh experiences</h2></div>
          <span className="feed-city">LONDON, ON</span>
        </div>
        {visibleExperiences.length ? visibleExperiences.map((item) => (
          <article className="experience-post" key={item.id}>
            <div className="post-topline">
              <CharacterPortrait identity={item.author} size={39}/>
              <div className="post-author"><strong>{item.author}</strong><span>{item.time} · {item.category}</span></div>
              <div className={`experience-rating rating-${item.verdict}`} aria-label={`${item.verdict} rating: ${item.rating} out of 5`}><strong>{item.rating}</strong><span>/5</span></div>
            </div>
            <h3 className="post-place"><Icon name="pin" size={16}/>{item.place}</h3>
            <p className="post-area">{item.area}</p>
            <p className="post-review">{item.review}</p>
            <div className="post-media">
              <Image src={item.image} alt={item.imageAlt} fill sizes="(max-width: 430px) 92vw, 390px" unoptimized={typeof item.image === 'string' && item.image.endsWith('.svg')}/>
              {item.mediaType === 'video' && <span className="post-video"><Icon name="play" size={17}/><span>0:18</span></span>}
              <span className="post-media-place">{item.place}</span>
            </div>
            <div className="post-actions" aria-label={`Actions for ${item.place}`}>
              <button className={liked.includes(item.id) ? 'is-liked' : ''} type="button" aria-label={liked.includes(item.id) ? 'Unlike experience' : 'Like experience'} aria-pressed={liked.includes(item.id)} onClick={() => setLiked((current) => current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id])}><Icon name="heart" size={21} filled={liked.includes(item.id)}/><span>{item.likes + (liked.includes(item.id) ? 1 : 0)}</span></button>
              <button className={openComments === item.id ? 'is-selected' : ''} type="button" aria-label="Show comments" aria-expanded={openComments === item.id} onClick={() => setOpenComments((current) => current === item.id ? null : item.id)}><Icon name="comment" size={20}/><span>{item.comments}</span></button>
              <button type="button" aria-label="Share experience" onClick={() => void shareExperience(item)}><Icon name="share" size={20}/></button>
              <button className={`post-bookmark${saved.includes(item.id) ? ' is-saved' : ''}`} type="button" aria-label={saved.includes(item.id) ? 'Remove saved place' : 'Save place'} aria-pressed={saved.includes(item.id)} onClick={() => setSaved((current) => current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id])}><Icon name="bookmark" size={20} filled={saved.includes(item.id)}/></button>
            </div>
            {openComments === item.id && <div className="post-comments"><strong>{item.comments} comments</strong><p><b>Olivia</b> Adding this to my weekend list ✨</p></div>}
          </article>
        )) : <p className="feed-empty">No experiences match that search yet.</p>}
      </section>
    </div>
  )
}
