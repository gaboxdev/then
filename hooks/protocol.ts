// the protocol of Then, with nothing of the engine in it: the rule, the block a reply ends with, what a typed pick
// says, and where the mailbox sits. The mod imports it, and so does the Codex hook (`codex/hook.ts`), run by Node,
// so both agents read a reply and a pick by the same rules
import type { Offer, Option, Usage } from '../types'

export const COUNT = 4
// the band's own last row: none of the four, the person writes what they want
export const FREE = COUNT + 1

// the options travel at the end of Claude's own reply, in a block the mod reads and the transcript never draws: no tool
// call, so a turn has no extra step that re-reads the conversation
export const RULES = `# Then (next options)
End every reply where you did or answered something with exactly ${COUNT} options for how to continue, as the very last thing, outside any code block, in this form:
<then>
1|title|detail|usage
2*|title|detail|usage
3|title|detail|usage
4|title|detail|usage
</then>
title: a concrete next action you can start right away, at most 6 words; detail: at most 12 words; both in the user's language. Put * after the one number you recommend. usage: none, low, med or high, what it would spend in tokens and time (none: nothing to run; low: a few reads or one command; med: several edits or a build; high: many files, agents or long runs). Most useful first. The person sees them as a numbered band above the prompt and picks by number, so never also list them in prose and never ask which one to do. Leave the block out only when you end on a question the person must answer in their own words, or you called AskUserQuestion.`

// Claude Code wakes a session when its background work ends, and tells the mod what is still in flight. Codex does
// neither, so its hook keeps the plain rule: there, a turn that stops is over
export const RULES_WITH_WAKEUPS = `${RULES} The one other case: you are only waiting on a workflow, agent, background command or scheduled wake-up you started, which wakes you when it ends. Waiting is the default then: say in one line what you are waiting for, and never ask or offer whether to wait. A long-lived process such as a dev server is not a wait, so offer as usual.`


// the cut drops half a character left at the edge (an emoji is two UTF-16 units)
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max).replace(/[\uD800-\uDBFF]$/, '').trimEnd() : '')

// the background work a stopped turn is paused on, named for the band. A shell that never exits (a dev server, a
// watcher) wakes nobody, so a turn is not waiting on it. These match how such a command is run, not a word in it:
// `2>/dev/null` and `cd server && npm run build` both end
export type BackgroundWork = { id?: string; type?: string; description?: string; command?: string; name?: string }
const LONG_LIVED = new RegExp(
  [
    String.raw`\b(npm|pnpm|yarn|bun)\s+(run\s+)?(dev|start|serve|preview|watch)\b`,
    String.raw`\b(next|nuxt|vite|astro|remix|webpack|wrangler|expo|ng|storybook|hugo|netlify|vercel|deno\s+task)\s+(dev|serve|server|start|preview)\b`,
    String.raw`\bvite\s*($|[;&|])`,
    String.raw`--watch\b(?!=false)|\bcargo\s+watch\b|\btail\b[^|;&]*\s-[a-zA-Z]*[fF]\b`,
    String.raw`\b(nodemon|http-server|live-server|uvicorn|gunicorn|ngrok|runserver)\b|\bhttp\.server\b|\bjupyter\s+(lab|notebook)\b|\bflask\s+run\b|\brails\s+s(erver)?\b`,
    String.raw`\bdocker[ -]compose\s+up\b(?!.*\s-d\b)`,
  ].join('|'),
  'i',
)
// what can outlive every turn; a workflow or an agent always ends and wakes the session
export const canOutlive = (t: BackgroundWork) => t.type === 'shell' || t.type === 'monitor'
// `settled`: ids of work a turn already gave options over, which Claude has judged not to be a wait
export const awaitedWork = (tasks: readonly BackgroundWork[] | undefined, settled: ReadonlySet<string> = new Set()): string[] =>
  (tasks ?? [])
    .filter(t => !(t.type === 'shell' && LONG_LIVED.test(t.command ?? '')) && !(t.id && settled.has(t.id)))
    .map(t => str(t.name || t.description || t.command || t.type, 60))
    .filter(Boolean)

// ---------- reading a pick out of what the person typed ----------

const WORDS: Record<string, number[]> = {
  uno: [1], una: [1], primera: [1], primero: [1],
  dos: [2], segunda: [2], segundo: [2],
  tres: [3], tercera: [3], tercero: [3],
  cuatro: [4], cuarta: [4], cuarto: [4],
  cinco: [5], quinta: [5], quinto: [5],
  todas: [1, 2, 3, 4], todo: [1, 2, 3, 4], todos: [1, 2, 3, 4],
  one: [1], first: [1], two: [2], second: [2], three: [3], third: [3], four: [4], fourth: [4], five: [5], fifth: [5],
  all: [1, 2, 3, 4],
}
const FILLER = new Set(
  'ok okay vale listo bueno pues entonces sí si dale va vamos ve haz hazme hace hacé quiero quisiera prefiero elijo escojo me gusta voy con por la el las los lo de y e opción opcion opciones número numero n i want lets go do pick take the and option options number'.split(' '),
)

// "3", "la 3", "quiero la 2 y la 4", "1, 3", "dale con la tercera", "2 pero sin commit": the numbers it names in the
// leading words and whatever it says after them; null when the message is not a pick
export function parsePick(text: string): { picks: number[]; rest: string } | null {
  const tokens = text.trim().split(/\s+/).filter(Boolean)
  const isShort = tokens.length <= 5
  const picks: number[] = []
  let at = 0
  for (; at < tokens.length; at++) {
    const word = (tokens[at] ?? '').toLowerCase().replace(/^[«"'(+]+|[».,;:!?)"'/+&-]+$/g, '')
    const digits = /^[1-5](?:[,/+&y-][1-5])*$/.test(word) ? word.match(/[1-5]/g)?.map(Number) : undefined
    // a number word counts only in a short message: "y dos cosas más…" is not a pick
    const named = digits ?? (isShort ? WORDS[word] : undefined)
    if (named) picks.push(...named)
    else if (!FILLER.has(word) && word !== '') break
  }
  if (picks.length === 0) return null
  const rest = tokens.slice(at).join(' ').replace(/^[,.;:\-–—\s]+/, '')
  return { picks: [...new Set(picks)], rest }
}

const joinNumbers = (n: number[]) => (n.length === 1 ? `${n[0]}` : `${n.slice(0, -1).join(', ')} and ${n[n.length - 1]}`)
const describe = (o: Option) => `«${o.title}»${o.detail ? ` (${o.detail})` : ''}`

export function pickContext(o: Pick<Offer, 'options'>, picks: number[], rest: string): string {
  if (picks.includes(FREE) && picks.length === 1) return `The person passed on the options you offered at the end of your last reply and asked for this instead: «${rest}».`
  // the free row among others adds nothing to pick: what they wrote travels as `rest`
  const real = picks.filter(n => n !== FREE)
  const chosen = real.map(n => `${n}. ${describe(o.options[n - 1] as Option)}`).join('; ')
  const head = real.length === 1 ? `The person picked option ${real[0]}` : `The person picked options ${joinNumbers(real)}, in that order`
  return `${head} of the ones you offered at the end of your last reply: ${chosen}. Do that now.${rest ? ` They added: «${rest}».` : ''}`
}

// ---------- the offer ----------

const BLOCK = /<then>([\s\S]*?)(?:<\/then>|$)/
const USAGE_WORDS: Record<string, Usage> = {
  none: 'none', nada: 'none', low: 'low', bajo: 'low', med: 'medium', medium: 'medium', medio: 'medium', high: 'high', alto: 'high',
}

// a star (or ★) at either edge of a field: the model's mark for the suggested row, wherever on the row it lands
const MARK = /^[*★]+\s*|\s*[*★]+$/g

// the <then> block at the end of a reply: four `n[*]|title|detail|usage` lines; null when there is none or it is not four.
// The rule puts the star after the number, but a model misplaces it (`low*`, `title*`, `*2`): the row is still the
// suggested one, and the field it was stuck to still reads, so the person never loses the ★ or a row's meter to it
export function parseBlock(text: string): { options: Option[]; suggested: number | null } | null {
  const body = BLOCK.exec(text)?.[1]
  if (body === undefined) return null
  const options: Option[] = []
  let suggested: number | null = null
  for (const line of body.split('\n')) {
    const row = /^\s*([*★])?\s*[1-9]\s*([*★])?\s*[|.)]\s*(.*)$/.exec(line)
    if (!row) continue
    const parts = (row[3] ?? '').split('|').map(part => part.trim())
    const isMarked = Boolean(row[1] || row[2]) || parts.some(part => part.replace(MARK, '') !== part)
    const [title = '', detail = '', usage = ''] = parts.map(part => part.replace(MARK, ''))
    if (!title) continue
    const u = USAGE_WORDS[usage.toLowerCase()]
    options.push({ title: str(title, 60), detail: str(detail, 110), ...(u ? { usage: u } : {}) })
    if (isMarked) suggested = options.length
  }
  return options.length === COUNT ? { options, suggested } : null
}

// the reply as the transcript draws it: the block gone, and while it streams, a half-typed `<then` at the end too
export const stripBlock = (text: string) =>
  text.replace(/\s*<then>[\s\S]*?(?:<\/then>|$)/, '').replace(/\s*<(?:t(?:h(?:e(?:n)?)?)?)?$/, '').trimEnd()

// what an app beside the terminal reads in `<mailbox>.offer.json`: `id` null when there is no offer up. `provider` says
// which agent wrote it, so a pick goes back the way that agent takes one (Claude Code's mod reads `pick.json`; Codex
// takes it typed at its prompt)
export type Provider = 'claude' | 'codex'
export const offerBody = (provider: Provider, o: { id: number; options: Option[]; suggested?: number | null } | null) =>
  o ? { v: 1, provider, id: o.id, options: o.options, suggested: o.suggested ?? null } : { v: 1, provider, id: null }

// the line a turn that forgot its options is sent back with
export const NUDGE = `then: end your reply with the <then> block of ${COUNT} options from the rule, and nothing else.`

// the session's mailbox, beside its transcript's config dir: Claude Code's `<dir>/projects/<project>/<session>.jsonl`, or
// Codex's `<CODEX_HOME>/sessions/<yyyy>/<mm>/<dd>/rollout-….jsonl`; null where the path says nothing of one
export function mailboxOf(transcriptPath: string, sessionId: string): string | null {
  const dir = /^(.*)[\\/](?:projects|sessions[\\/]\d{4})[\\/]/.exec(transcriptPath)?.[1]
  return dir && /^[\w-]+$/.test(sessionId) ? `${dir}/then/${sessionId}` : null
}
