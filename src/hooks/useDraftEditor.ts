import { useEffect, useState } from 'react'

type Status = 'saved' | { error: unknown } | null

/**
 * Draft state for a text the user edits and saves while background refreshes
 * keep `serverValue` fresh. While the user hasn't edited anything, refreshes
 * update the draft; once they start typing, their edits are kept.
 * `save` stores the draft and resolves with the saved text.
 */
export function useDraftEditor(serverValue: string, save: (draft: string) => Promise<string>, initialDraft = serverValue) {
  const [draft, setDraft] = useState(initialDraft)
  // The server value the current draft was based on.
  const [base, setBase] = useState(serverValue)
  // The newest text known to be on the server: our own save, or a later
  // refresh. A refresh can fail silently and leave serverValue stale after a save.
  const [stored, setStored] = useState(serverValue)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<Status>(null)

  useEffect(() => {
    if (serverValue === base) return
    if (draft === base) setDraft(serverValue)
    setBase(serverValue)
    setStored(serverValue)
  }, [serverValue, base, draft])

  useEffect(() => {
    if (status !== 'saved') return
    const id = setTimeout(() => setStatus(null), 3000)
    return () => clearTimeout(id)
  }, [status])

  function edit(next: string) {
    setDraft(next)
    setStatus(null)
  }

  async function handleSave() {
    setSaving(true)
    setStatus(null)
    try {
      const saved = await save(draft)
      // Leave base at the last value the props carried: if a refresh failed,
      // setting it to `saved` would make the sync effect roll the draft back.
      setDraft(saved)
      setStored(saved)
      setStatus('saved')
    } catch (err) {
      setStatus({ error: err })
    } finally {
      setSaving(false)
    }
  }

  return { draft, edit, dirty: draft.trim() !== stored, saving, status, handleSave }
}
