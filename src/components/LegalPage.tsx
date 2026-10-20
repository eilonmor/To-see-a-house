import { Fragment, useId, type ReactNode } from 'react'
import terms from '../legal/terms.he.md?raw'
import privacy from '../legal/privacy.he.md?raw'
import { useI18n } from '../i18n/I18nProvider'
import { Alert, Card } from './ui'

export type LegalDoc = 'terms' | 'privacy'

const SOURCES: Record<LegalDoc, string> = { terms, privacy }

/** The terms of use or the privacy policy. Both exist in Hebrew only, so they're always shown right to left. */
export default function LegalPage({ doc }: { doc: LegalDoc }) {
  const { t, lang } = useI18n()
  return (
    <Card className="mt-4">
      {lang !== 'he' && (
        <div className="mb-6">
          <Alert tone="info">{t.legal.hebrewOnly}</Alert>
        </div>
      )}
      <article lang="he" dir="rtl" className="text-[15px] leading-7 text-slate-700">
        {renderMarkdown(SOURCES[doc])}
      </article>
    </Card>
  )
}

/**
 * "I have read and understood the terms of use and the privacy policy", with
 * both documents opening in a new tab. Used on sign-up and in <TermsPrompt>.
 */
export function TermsConsent({ checked, onChange, error }: { checked: boolean; onChange: (checked: boolean) => void; error?: string }) {
  const { t } = useI18n()
  const errorId = useId()
  return (
    <div>
      <label className="flex cursor-pointer items-start gap-2.5 text-sm text-slate-600">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : undefined}
          className="mt-0.5 h-4 w-4 flex-none rounded border-slate-300 accent-indigo-600"
        />
        <span>
          {t.signup.consent.before}
          <a href="/terms" target="_blank" rel="noopener" className={LINK_CLASS}>
            {t.legal.terms}
          </a>
          {t.signup.consent.between}
          <a href="/privacy" target="_blank" rel="noopener" className={LINK_CLASS}>
            {t.legal.privacy}
          </a>
          {t.signup.consent.after}
        </span>
      </label>
      {error && (
        <p id={errorId} className="mt-1.5 text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  )
}

// A small Markdown renderer for the subset the legal documents use: headings,
// paragraphs, "-" lists, tables and **bold**.
function renderMarkdown(source: string): ReactNode[] {
  const lines = source.replace(/\r\n?/g, '\n').split('\n')
  const blocks: ReactNode[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i].trim()
    const key = blocks.length
    if (!line) {
      i++
    } else if (line.startsWith('#')) {
      const level = line.match(/^#+/)![0].length
      const text = inline(line.slice(level).trim())
      if (level === 1) blocks.push(<h1 key={key} className="mb-6 text-2xl font-bold text-slate-900">{text}</h1>)
      else if (level === 2) blocks.push(<h2 key={key} className="mt-8 mb-3 text-lg font-semibold text-slate-900">{text}</h2>)
      else blocks.push(<h3 key={key} className="mt-6 mb-2 font-semibold text-slate-900">{text}</h3>)
      i++
    } else if (line.startsWith('|')) {
      const rows: string[][] = []
      for (; i < lines.length && lines[i].trim().startsWith('|'); i++) {
        const cells = lines[i].trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim())
        if (!cells.every((c) => /^:?-+:?$/.test(c))) rows.push(cells)
      }
      const [head, ...body] = rows
      blocks.push(
        <div key={key} className="my-4 overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full min-w-[560px] text-start text-sm">
            <thead className="bg-slate-50 text-slate-900">
              <tr>{head.map((c, j) => <th key={j} className="px-3 py-2 text-start font-semibold">{inline(c)}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {body.map((row, r) => (
                <tr key={r}>{row.map((c, j) => <td key={j} className="px-3 py-2 align-top">{inline(c)}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>,
      )
    } else if (line.startsWith('- ')) {
      const items: string[] = []
      for (; i < lines.length && lines[i].trim().startsWith('- '); i++) items.push(lines[i].trim().slice(2))
      blocks.push(
        <ul key={key} className="my-3 list-disc space-y-1 ps-6">
          {items.map((item, j) => <li key={j}>{inline(item)}</li>)}
        </ul>,
      )
    } else {
      const para: string[] = []
      for (; i < lines.length && lines[i].trim() && !/^(#|\||- )/.test(lines[i].trim()); i++) para.push(lines[i].trim())
      blocks.push(<p key={key} className="my-3">{inline(para.join(' '))}</p>)
    }
  }
  return blocks
}

const LINK_CLASS = 'font-medium text-indigo-600 hover:underline'

/** **bold**, plus clickable web and email addresses. */
function inline(text: string): ReactNode {
  return text.split(/(\*\*[^*]+\*\*)/).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') ? (
      <strong key={i} className="font-semibold text-slate-900">{part.slice(2, -2)}</strong>
    ) : (
      <Fragment key={i}>{linkify(part)}</Fragment>
    ),
  )
}

function linkify(text: string): ReactNode[] {
  return text.split(/(https?:\/\/[^\s)]+|[A-Za-z0-9][\w.+-]*@[\w-]+\.[\w.]+\w)/).map((part, i) => {
    if (i % 2 === 0) return part
    const href = part.includes('@') && !part.startsWith('http') ? `mailto:${part}` : part
    return (
      <a key={i} href={href} dir="ltr" className={LINK_CLASS}>
        {part}
      </a>
    )
  })
}
