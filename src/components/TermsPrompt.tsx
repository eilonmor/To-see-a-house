import { useEffect, useId, useRef, useState } from 'react'
import { acceptTerms, signOut } from '../lib/auth'
import { navigate } from '../hooks/useRoute'
import { errorText, useI18n } from '../i18n/I18nProvider'
import { TermsConsent } from './LegalPage'
import { Alert, Button, Spinner } from './ui'

/**
 * Blocks the account pages until the user accepts the current terms of use and
 * privacy policy: a modal with no close button, which Esc and the backdrop
 * don't close. The only other way out is logging out.
 */
export default function TermsPrompt({ onAccepted }: { onAccepted: () => Promise<void> }) {
  const { t } = useI18n()
  const titleId = useId()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [checked, setChecked] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const dialog = dialogRef.current
    if (dialog && !dialog.open) dialog.showModal()
    return () => dialog?.close()
  }, [])

  async function accept() {
    setBusy(true)
    setError('')
    try {
      await acceptTerms()
      // Reloading the profile removes this prompt.
      await onAccepted()
    } catch (err) {
      setError(`${t.legal.prompt.error} ${errorText(err, t)}`)
      setBusy(false)
    }
  }

  async function logout() {
    await signOut().catch(() => {})
    navigate('/')
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      // Esc would close the dialog: keep it open.
      onCancel={(e) => e.preventDefault()}
      className="m-auto w-[calc(100%-2rem)] max-w-md overflow-hidden rounded-2xl bg-white p-0 text-slate-900 shadow-2xl ring-1 ring-slate-900/5 backdrop:bg-slate-900/40 backdrop:backdrop-blur-sm motion-safe:animate-dialog-in motion-safe:backdrop:animate-fade-in"
    >
      <div className="space-y-4 p-6">
        <h2 id={titleId} className="text-lg font-semibold text-slate-900">
          {t.legal.prompt.title}
        </h2>
        <p className="text-sm leading-relaxed text-slate-600">{t.legal.prompt.body}</p>
        <TermsConsent checked={checked} onChange={setChecked} />
        {error && <Alert>{error}</Alert>}
      </div>
      <div className="flex flex-col-reverse gap-2 border-t border-slate-100 bg-slate-50 px-6 py-4 sm:flex-row sm:justify-between">
        <Button variant="secondary" onClick={logout}>
          {t.legal.prompt.logout}
        </Button>
        <Button onClick={accept} disabled={!checked || busy}>
          {busy && <Spinner />} {t.legal.prompt.accept}
        </Button>
      </div>
    </dialog>
  )
}
