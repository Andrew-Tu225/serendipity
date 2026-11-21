export function FriendAvatar({ variant }: { variant: string }) {
  return (
    <svg className={`friend-avatar ${variant}`} viewBox="0 0 52 80" aria-hidden="true">
      <ellipse cx="26" cy="76" rx="15" ry="3" fill="rgba(53,39,61,.18)"/>
      <circle cx="26" cy="22" r="20" className="avatar-bg"/>
      <path d="M19 54 17 72h8l2-18ZM28 54l1 18h8l-3-18Z" className="avatar-pants"/>
      <path d="M16 71h10v5H14c0-2 .7-4 2-5ZM29 71h9c1.5 1 2.2 3 2 5H29Z" className="avatar-shoes"/>
      <path d="M17 38c3-4 15-4 18 0l3 20H14Z" className="avatar-shirt"/>
      <path d="m17 40-7 14M35 40l7 14" className="avatar-arm" fill="none" strokeWidth="5" strokeLinecap="round"/>
      <circle cx="9.5" cy="55" r="3" className="avatar-skin"/>
      <circle cx="42.5" cy="55" r="3" className="avatar-skin"/>
      <rect x="23" y="31" width="6" height="7" rx="3" className="avatar-skin"/>
      <path d="M15 21c0-10 4-16 11-16s11 6 11 16v10H15Z" className="avatar-hair"/>
      <ellipse cx="26" cy="23" rx="9.5" ry="11.5" className="avatar-skin"/>
      <circle cx="22.5" cy="22" r="1" fill="#3f303a"/>
      <circle cx="29.5" cy="22" r="1" fill="#3f303a"/>
      <path d="M23 27.5c2 1.7 4 1.7 6 0" fill="none" stroke="#9b565c" strokeWidth="1.3" strokeLinecap="round"/>
      <path d="M15 19c4-1 5-7 7-11 3 6 8 7 15 8" fill="none" className="hair-detail" strokeWidth="5" strokeLinecap="round"/>
    </svg>
  )
}
