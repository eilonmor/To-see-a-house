// Small shared UI primitives.

import { useEffect, useState, type AnchorHTMLAttributes, type ComponentProps, type InputHTMLAttributes, type MouseEvent, type ReactNode } from 'react'
import { navigate } from '../hooks/useRoute'

export function Card({ className = '', children }: { className?: string; children: ReactNode }) {
  return (
    <div className={`rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8 ${className}`}>
      {children}
    </div>
  )
}

type ButtonProps = ComponentProps<'button'> & { variant?: 'primary' | 'secondary' | 'danger' | 'dangerSolid' }

export function Button({ variant = 'primary', className = '', ...props }: ButtonProps) {
  const styles = {
    primary: 'bg-indigo-600 text-white hover:bg-indigo-700 disabled:bg-indigo-300',
    secondary: 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 disabled:text-slate-400',
    danger: 'bg-white text-rose-600 border border-rose-200 hover:bg-rose-50 disabled:text-rose-300',
    dangerSolid: 'bg-rose-600 text-white hover:bg-rose-700 disabled:bg-rose-300 focus-visible:ring-rose-500',
  }
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed ${styles[variant]} ${className}`}
      {...props}
    />
  )
}

/** Copies `text` to the clipboard and says so for 2 seconds. */
export function CopyButton({ text, label, copiedLabel }: { text: string; label: string; copiedLabel: string }) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const id = setTimeout(() => setCopied(false), 2000)
    return () => clearTimeout(id)
  }, [copied])

  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
    } catch {
      // clipboard unavailable — the text is still selectable
    }
  }

  return (
    <Button variant="secondary" className="px-3! py-1.5! text-xs" onClick={copy}>
      {copied ? `✓ ${copiedLabel}` : label}
    </Button>
  )
}

type FieldProps =InputHTMLAttributes<HTMLInputElement> & { label: string; id: string; error?: string }

export function Field({ label, id, error, dir, ...inputProps }: FieldProps) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-slate-700">
        {label}
      </label>
      <input
        id={id}
        dir={dir}
        className={`block w-full rounded-xl border bg-white px-4 py-2.5 text-slate-900 placeholder:text-slate-400 rtl:text-right focus:outline-none focus:ring-2 ${
          error ? 'border-rose-400 focus:ring-rose-200' : 'border-slate-300 focus:border-indigo-500 focus:ring-indigo-100'
        }`}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        {...inputProps}
      />
      {error && (
        <p id={`${id}-error`} className="mt-1.5 text-sm text-rose-600">
          {error}
        </p>
      )}
    </div>
  )
}

export function Alert({ tone = 'error', children }: { tone?: 'error' | 'info'; children: ReactNode }) {
  const styles = {
    error: 'border-rose-200 bg-rose-50 text-rose-700',
    info: 'border-sky-200 bg-sky-50 text-sky-800',
  }
  return <div role="alert" className={`rounded-xl border px-4 py-3 text-sm ${styles[tone]}`}>{children}</div>
}

export function Spinner({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
      <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="4" strokeLinecap="round" className="opacity-75" />
    </svg>
  )
}

type LinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }

/** An in-app link: navigates without reloading, but still opens in a new tab on ctrl/cmd-click. */
export function Link({ href, onClick, ...props }: LinkProps) {
  function handleClick(e: MouseEvent<HTMLAnchorElement>) {
    onClick?.(e)
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    e.preventDefault()
    navigate(href)
  }
  return <a href={href} onClick={handleClick} {...props} />
}

/** Replaces the current path with `to` once rendered. */
export function Redirect({ to }: { to: string }) {
  useEffect(() => navigate(to, { replace: true }), [to])
  return null
}

export function Loading({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-slate-500">
      <Spinner /> {label}
    </div>
  )
}
