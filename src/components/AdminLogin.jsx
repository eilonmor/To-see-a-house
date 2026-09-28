import { useState } from 'react'
import { ADMIN_PASSWORD } from '../config'
import { Button, Card, Field } from './ui'

export default function AdminLogin({ onSuccess }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  function handleSubmit(e) {
    e.preventDefault()
    if (password === ADMIN_PASSWORD) {
      onSuccess()
    } else {
      setError('Incorrect password.')
      setPassword('')
    }
  }

  return (
    <Card className="mx-auto mt-8 max-w-sm">
      <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-indigo-100 text-indigo-600">
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="4" y="11" width="16" height="10" rx="2" />
          <path d="M8 11V7a4 4 0 118 0v4" />
        </svg>
      </div>
      <h1 className="mt-4 text-center text-xl font-semibold text-slate-900">Admin access</h1>
      <p className="mt-1 text-center text-sm text-slate-500">Enter the password to view bookings.</p>
      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <Field
          id="password"
          label="Password"
          type="password"
          autoComplete="current-password"
          autoFocus
          value={password}
          onChange={(e) => {
            setPassword(e.target.value)
            setError('')
          }}
          error={error}
        />
        <Button type="submit" className="w-full" disabled={!password}>
          Sign in
        </Button>
      </form>
    </Card>
  )
}
