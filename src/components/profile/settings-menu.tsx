'use client'

import { useEffect, useRef, useState } from 'react'
import { useSession } from '@/components/auth/session-provider'
import { Icon } from '@/components/ui/icon'
import { authClient } from '@/lib/api-client/auth'

export function SettingsMenu() {
  const { session } = useSession()
  const [open, setOpen] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [error, setError] = useState('')
  const anchor = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    function onPointer(event: MouseEvent) {
      if (!anchor.current?.contains(event.target as Node)) setOpen(false)
    }
    function onKey(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      setOpen(false)
      trigger.current?.focus()
    }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  async function signOut() {
    if (!session || leaving) return
    setLeaving(true)
    setError('')
    try {
      await authClient.signOut(session.csrf_token)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Couldn’t sign out. Try again.')
      setLeaving(false)
    }
  }

  const account = session?.user.email ?? session?.user.display_name ?? null

  return (
    <div className="settings-anchor" ref={anchor}>
      <button ref={trigger} type="button" className={`round-button${open ? ' is-open' : ''}`} aria-label="Settings"
        aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <Icon name="settings" size={20}/>
      </button>
      {open && (
        <div className="settings-popover" role="menu" aria-label="Settings">
          {account && <p className="settings-account"><span className="eyebrow">Signed in as</span><strong>{account}</strong></p>}
          <button type="button" role="menuitem" className="settings-signout" autoFocus
            disabled={!session || leaving} onClick={() => void signOut()}>
            <Icon name="logout" size={17}/>{leaving ? 'Signing out…' : 'Sign out'}
          </button>
          {error && <p className="settings-error" role="alert">{error}</p>}
        </div>
      )}
    </div>
  )
}
