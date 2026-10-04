import { useEffect, useState } from 'react'
import { saveInstructions } from '../lib/adminStore'
import { errorText, useI18n } from '../i18n/I18nProvider'
import { Alert, Button, Card, Spinner } from './ui'

const MAX_LENGTH = 1000

/** Lets the admin edit the instructions visitors see after booking. */
type Props = { propertyId: string; instructions: string; disabled?: boolean; onSaved: (instructions: string) => void }

export default function InstructionsEditor({ propertyId, instructions, disabled = false, onSaved }: Props) {
  const { t } = useI18n()
  const [draft, setDraft] = useState(instructions)
  // The server value the current draft was based on. While the admin hasn't
  // edited anything, background refreshes update the draft; once they start
  // typing, their edits are kept.
  const [base, setBase] = useState(instructions)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<'saved' | { error: unknown } | null>(null)

  useEffect(() => {
    if (instructions === base) return
    if (draft === base) setDraft(instructions)
    setBase(instructions)
  }, [instructions, base, draft])

  useEffect(() => {
    if (status !== 'saved') return
    const id = setTimeout(() => setStatus(null), 3000)
    return () => clearTimeout(id)
  }, [status])

  const dirty = draft.trim() !== instructions

  async function handleSave() {
    setSaving(true)
    setStatus(null)
    try {
      const saved = await saveInstructions(propertyId, draft)
      setDraft(saved)
      setBase(saved)
      onSaved(saved)
      setStatus('saved')
    } catch (err) {
      setStatus({ error: err })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <h2 className="text-lg font-semibold text-slate-900">{t.instructions.title}</h2>
      <p className="mt-1 text-sm text-slate-500">{t.instructions.help}</p>
      <label htmlFor="instructions" className="sr-only">
        {t.instructions.title}
      </label>
      <textarea
        id="instructions"
        dir="auto"
        rows={5}
        maxLength={MAX_LENGTH}
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value)
          setStatus(null)
        }}
        disabled={disabled || saving}
        placeholder={t.instructions.placeholder}
        className="mt-4 block w-full resize-y rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100 disabled:bg-slate-50"
      />
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <span className="text-xs text-slate-400">
          {draft.length}/{MAX_LENGTH}
        </span>
        <div className="flex items-center gap-3">
          {status === 'saved' && <span className="text-sm font-medium text-emerald-600">✓ {t.instructions.saved}</span>}
          {dirty && status !== 'saved' && <span className="text-sm text-amber-600">{t.instructions.unsaved}</span>}
          <Button onClick={handleSave} disabled={!dirty || saving || disabled}>
            {saving && <Spinner />} {saving ? t.instructions.saving : t.instructions.save}
          </Button>
        </div>
      </div>
      {status && status !== 'saved' && (
        <div className="mt-3">
          <Alert>
            {t.instructions.saveError} {errorText(status.error, t)}
          </Alert>
        </div>
      )}
    </Card>
  )
}
