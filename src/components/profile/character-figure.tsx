import type { CharacterAppearance } from '@/types/character'

export function CharacterFigure({ options, portrait = false }: { options: CharacterAppearance; portrait?: boolean }) {
  const feminine = options.features === 'feminine'
  return (
    <svg className="character-figure" viewBox={portrait ? '13 -4 154 154' : '0 0 180 320'} aria-hidden="true">
      {!portrait && <>
        <ellipse cx="90" cy="307" rx="48" ry="8" fill="rgba(55,42,63,.13)"/>
        <path d="M61 185 55 279h31l5-94ZM92 185l3 94h31l-8-94Z" fill={options.pants}/>
        <path d="M52 274h36v24H43c0-10 3-18 9-24ZM94 274h34c7 6 10 14 9 24H94Z" fill={options.shoes}/>
      </>}
      <path d={feminine ? 'M56 123c12-15 55-15 68 0l9 72H47Z' : 'M51 124c16-16 62-16 78 0l4 71H47Z'} fill={options.shirt}/>
      <path d="m55 132-26 54M125 132l26 54" fill="none" stroke={options.skinTone} strokeWidth="18" strokeLinecap="round"/>
      <circle cx="27" cy="190" r="10" fill={options.skinTone}/><circle cx="153" cy="190" r="10" fill={options.skinTone}/>
      <rect x="80" y="101" width="20" height="29" rx="9" fill={options.skinTone}/>
      {options.hairStyle === 'wavy' && <path d="M50 72C50 25 70 11 91 11s43 15 42 63c15 30 4 62-14 74l-8-47H67l-7 48c-23-15-24-48-10-77Z" fill={options.hairColor}/>}
      {options.hairStyle === 'short' && <path d="M54 77C52 34 67 17 91 17c27 0 39 21 37 58l-15-20c-19 8-38 7-59 22Z" fill={options.hairColor}/>}
      {options.hairStyle === 'curly' && <><circle cx="59" cy="53" r="23" fill={options.hairColor}/><circle cx="86" cy="35" r="25" fill={options.hairColor}/><circle cx="116" cy="48" r="24" fill={options.hairColor}/><circle cx="126" cy="78" r="23" fill={options.hairColor}/><circle cx="54" cy="84" r="22" fill={options.hairColor}/></>}
      {options.hairStyle === 'bun' && <><circle cx="91" cy="23" r="24" fill={options.hairColor}/><path d="M53 76C52 34 69 20 91 20s39 16 38 56l-15-20c-19 7-38 6-61 20Z" fill={options.hairColor}/></>}
      <path d={feminine ? 'M58 68c0-35 14-49 33-49s34 16 33 49v26c0 25-14 40-33 40S58 119 58 94Z' : 'M57 69c0-34 15-48 34-48s35 15 34 48v27c0 24-15 39-34 39S57 120 57 96Z'} fill={options.skinTone}/>
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
