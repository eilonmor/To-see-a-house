import { useEffect, useId, useRef, useState } from 'react'
import { acceptTerms } from '../lib/auth'
import { errorText, useI18n } from '../i18n/I18nProvider'
import { TermsConsent } from './LegalPage'
import { Alert, Button, Link, Spinner } from './ui'

/**
 * Blocks the account pages until the user accepts the current terms of use and
 * privacy policy: a modal with no close button, which Esc and the backdrop
 * don't close. The ways out are logging out and the account page (to delete
 * the account), where <AccountGate> doesn't show it.
 */
export default function TermsPrompt({ onAccepted, onLogout }: { onAccepted: () => Promise<void>; onLogout: () => void }) {
  const { t } = useI18n()
  const titleId = useId()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [checked, setChecked] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    // Esc is cancelled below, but the browser lets a second Esc in a row close
    // the dialog anyway: open it again.
    const reopen = () => dialog.showModal()
    dialog.addEventListener('close', reopen)
    if (!dialog.open) dialog.showModal()
    return () => {
      dialog.removeEventListener('close', reopen)
      dialog.close()
    }
  }, [])

  async function accept() {
    setBusy(true)
    setError('')
    try {
      await acceptTerms()
    } catch (err) {
      setError(`${t.legal.prompt.error} ${errorText(err, t)}`)
      setBusy(false)
      return
    }
    try {
      // Reloading the profile removes this prompt.
      await onAccepted()
    } catch {
      // Accepted, but the profile didn't reload: AccountGate shows the error above the page.
      setError(t.account.reloadAfterAction)
    }
    setBusy(false)
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
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
      <div className="flex flex-col-reverse gap-2 border-t border-slate-100 bg-slate-50 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col-reverse items-center gap-2 sm:flex-row sm:gap-4">
          <Button variant="secondary" className="w-full sm:w-auto" onClick={onLogout}>
            {t.legal.prompt.logout}
          </Button>
          <Link href="/dashboard/account" className="text-sm text-slate-600 hover:text-slate-900 hover:underline">
            {t.legal.prompt.deleteAccount}
          </Link>
        </div>
        <Button onClick={accept} disabled={!checked || busy}>
          {busy && <Spinner />} {t.legal.prompt.accept}
        </Button>
      </div>
    </dialog>
  )
}
