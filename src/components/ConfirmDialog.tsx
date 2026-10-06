// A styled replacement for window.confirm: `if (!(await confirm(message))) return`.

import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { useI18n } from '../i18n/I18nProvider'
import { Button } from './ui'

type ConfirmOptions = {
  /** 'danger' for destructive or irreversible actions: red, and "go back" gets the focus. */
  tone?: 'primary' | 'danger'
  confirmLabel?: string
}

type Confirm = (message: string, options?: ConfirmOptions) => Promise<boolean>

type Request = ConfirmOptions & { id: number; message: string; resolve: (ok: boolean) => void }

const ConfirmContext = createContext<Confirm | null>(null)

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<Request | null>(null)
  const pending = useRef<Request | null>(null)
  const nextId = useRef(0)

  const confirm = useCallback<Confirm>(
    (message, options = {}) =>
      new Promise<boolean>((resolve) => {
        pending.current?.resolve(false) // a newer question replaces an unanswered one
        pending.current = { ...options, id: nextId.current++, message, resolve }
        setRequest(pending.current)
      }),
    [],
  )

  const answer = useCallback((ok: boolean) => {
    pending.current?.resolve(ok)
    pending.current = null
    setRequest(null)
  }, [])

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {request && <ConfirmDialog key={request.id} request={request} onAnswer={answer} />}
    </ConfirmContext.Provider>
  )
}

export function useConfirm(): Confirm {
  const value = useContext(ConfirmContext)
  if (!value) throw new Error('useConfirm must be used inside <ConfirmProvider>')
  return value
}

function ConfirmDialog({ request, onAnswer }: { request: Request; onAnswer: (ok: boolean) => void }) {
  const { t } = useI18n()
  const messageId = useId()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)
  const danger = request.tone === 'danger'

  // A modal <dialog> traps focus, blocks the page behind it and closes on Esc.
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    // React removes the dialog before this cleanup runs, so the browser can't
    // return focus by itself: hand it back to whatever opened the dialog.
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    if (!dialog.open) dialog.showModal()
    ;(danger ? cancelRef : confirmRef).current?.focus()
    return () => {
      dialog.close()
      if (opener?.isConnected) opener.focus()
    }
  }, [danger])

  // A click on the dialog element itself (not its content) is a click on the backdrop.
  function handleClick(e: MouseEvent<HTMLDialogElement>) {
    if (e.target === e.currentTarget) onAnswer(false)
  }

  return (
    <dialog
      ref={dialogRef}
      role="alertdialog"
      aria-labelledby={messageId}
      onCancel={(e) => {
        e.preventDefault()
        onAnswer(false)
      }}
      onClick={handleClick}
      className="m-auto w-[calc(100%-2rem)] max-w-md overflow-hidden rounded-2xl bg-white p-0 text-slate-900 shadow-2xl ring-1 ring-slate-900/5 backdrop:bg-slate-900/40 backdrop:backdrop-blur-sm motion-safe:animate-dialog-in motion-safe:backdrop:animate-fade-in"
    >
      <div className="flex items-start gap-4 p-6">
        <div
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${
            danger ? 'bg-rose-100 text-rose-600' : 'bg-indigo-100 text-indigo-600'
          }`}
          aria-hidden="true"
        >
          {danger ? <WarningIcon /> : <QuestionIcon />}
        </div>
        <p id={messageId} className="pt-2.5 text-base leading-relaxed text-slate-800">
          {request.message}
        </p>
      </div>
      <div className="flex flex-col-reverse gap-2 border-t border-slate-100 bg-slate-50 px-6 py-4 sm:flex-row sm:justify-end">
        <Button ref={cancelRef} variant="secondary" onClick={() => onAnswer(false)}>
          {t.dialog.cancel}
        </Button>
        <Button ref={confirmRef} variant={danger ? 'dangerSolid' : 'primary'} onClick={() => onAnswer(true)}>
          {request.confirmLabel ?? t.dialog.confirm}
        </Button>
      </div>
    </dialog>
  )
}

function WarningIcon() {
  return (
    <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9v4M12 17h.01" />
    </svg>
  )
}

function QuestionIcon() {
  return (
    <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01" />
    </svg>
  )
}
