import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import type { Offer, PlanBar, Usage } from '../types'

import { FREE, NUDGE, RULES_WITH_WAKEUPS, awaitedWork, canOutlive, mailboxOf, offerBody, parseBlock, parsePick, pickContext, stripBlock } from './protocol'

export { mailboxOf, parseBlock, parsePick, stripBlock }

const offer = atom({ plugin: 'then', key: 'offer' } as const, null)
// the rows marked while the composer holds a `+` pick («+2 4»); null outside that mode
const selected = atom({ plugin: 'then', key: 'selected' } as const, null)
const isOn = atom({ plugin: 'then', key: 'isOn' } as const, true)
// the colour `/then color …` picked: a palette name or a #RRGGBB; null keeps the one in /config
const color = atom({ plugin: 'then', key: 'color' } as const, null)
const STORE_COLOR = 'color'
// the last offer the person answered or set aside, for `/then otra vez`
const lastOffer = atom({ plugin: 'then', key: 'last' } as const, null)
// what a turn that stopped without options is paused on; the next turn, woken or typed, clears it
const waiting = atom({ plugin: 'then', key: 'waiting' } as const, null)
// plan-progress's bars, read to leave them room when they sit above the band
const planBars = atom({ plugin: 'plan-progress', key: 'plans' } as const, [])
const planOpen = atom({ plugin: 'plan-progress', key: 'isOpen' } as const, true)
// the band's theme `/then tema …` picked: «usage» paints each row by what it spends, «color» all in one colour
const bandTheme = atom({ plugin: 'then', key: 'theme' } as const, null)
const STORE_THEME = 'theme'
const THEMES = ['usage', 'color']
const STORE_ON = 'isOn'
const STORE_SOUND = 'sound'

// every word the band draws, in the two languages it speaks; `language` in /config picks one, auto follows the
// session's own language setting
type Words = {
  title: string; hint: string; hintFree: string; hintMulti: string; badge: string; column: string; usage: Record<Usage, string>
  free: string; freeDetail: string; writing: string; writingDetail: string; option: string; off: string; on: string; command: string
  argumentHint: string; help: string; colors: Record<string, string>; soundOn: string; soundOff: string
  themes: Record<string, string>; themeSet: (name: string) => string; themeList: (current: string) => string
  again: string; noLast: string; waiting: string; waitingHint: string; wakeup: string
  colorList: (current: string) => string; colorSet: (name: string) => string; colorBad: (arg: string) => string; colorReset: string
}
const WORDS_BY: Record<'es' | 'en', Words> = {
  es: {
    title: '¿Cómo seguimos?', hint: '3 = elegir · +1 3 = varias + Enter', hintFree: 'escribe tu pedido y Enter',
    hintMulti: 'marcando varias: sigue con los números · Enter manda',
    badge: '★ sugerida', column: 'consumo ▾', usage: { none: 'nada', low: 'bajo', medium: 'medio', high: 'alto' },
    free: 'Otra cosa (libre)', freeDetail: 'ninguna de estas: escribe lo que quieras',
    writing: '✎ Escribiendo lo tuyo', writingDetail: 'escribe abajo y Enter; me llega tal cual', option: 'Opción',
    waiting: 'Esperando', waitingHint: 'sigo solo al terminar; escribe si quieres otra cosa', wakeup: 'el próximo aviso programado',
    off: 'Then apagado. /then lo prende de nuevo.', on: 'Then prendido: al final de cada turno vas a ver 4 opciones para elegir con un número.',
    command: 'Prender o apagar las opciones al final de cada turno, o cambiar su color',
    argumentHint: '[otra vez] | color <nombre|#RRGGBB> | tema consumo|color | sonido on|off | on | off',
    help: 'Uso: /then (prende o apaga) · /then otra vez · /then color (ver colores) · /then color violeta · /then color #D97757 · /then tema consumo · /then sonido off',
    soundOn: 'Then suena al terminar cada turno con opciones. /then sonido off lo calla.',
    soundOff: 'Then ya no suena. /then sonido on lo vuelve a prender.',
    again: 'Ahí están otra vez las últimas opciones.', noLast: 'Todavía no hay opciones que volver a mostrar.',
    themes: { usage: 'consumo', color: 'color' },
    themeSet: n => (n === 'consumo' ? 'Tema consumo: cada fila toma el color de lo que gasta.' : 'Tema color: todas las filas en el color de /then color.'),
    themeList: c => `Tema de Then: ${c}. /then tema consumo pinta cada fila por lo que gasta; /then tema color las pinta todas en un color.`,
    colors: { blue: 'azul', violet: 'violeta', green: 'verde', amber: 'ámbar', pink: 'rosa', cyan: 'cian' },
    colorList: c => `Color de Then: ${c}. Para cambiarlo: /then color azul | violeta | verde | ámbar | rosa | cian, o /then color #RRGGBB (por ejemplo #D97757). /then color normal vuelve al de /config.`,
    colorSet: c => `Then ahora es ${c}. La banda ya se dibuja con ese color.`,
    colorBad: a => `No conozco el color «${a}». Usa azul, violeta, verde, ámbar, rosa, cian o un #RRGGBB.`,
    colorReset: 'Then vuelve al color de /config.',
  },
  en: {
    title: 'What next?', hint: '3 = pick · +1 3 = several + Enter', hintFree: 'type your request and Enter',
    hintMulti: 'picking several: add numbers · Enter sends',
    badge: '★ suggested', column: 'usage ▾', usage: { none: 'none', low: 'low', medium: 'med', high: 'high' },
    free: 'Something else', freeDetail: 'none of these: type your own',
    writing: '✎ Writing your own', writingDetail: 'type below and Enter; sent as is', option: 'Option',
    waiting: 'Waiting', waitingHint: 'I continue when it ends; type to do something else', wakeup: 'the next scheduled wake-up',
    off: 'Then is off. /then turns it back on.', on: 'Options on: each turn ends with 4 to pick by number.',
    command: 'Turn the options at the end of each turn on or off, or change their color',
    argumentHint: '[again] | color <name|#RRGGBB> | theme usage|color | sound on|off | on | off',
    help: 'Usage: /then (on/off) · /then again · /then color (list colors) · /then color violet · /then color #D97757 · /then theme usage · /then sound off',
    soundOn: 'Then chimes when a turn ends with options. /then sound off mutes it.',
    soundOff: 'Then is muted. /then sound on turns the chime back on.',
    again: 'The last options are back.', noLast: 'No options to bring back yet.',
    themes: { usage: 'usage', color: 'color' },
    themeSet: n => (n === 'usage' ? 'Usage theme: each row takes the color of what it spends.' : 'Color theme: every row in the /then color.'),
    themeList: c => `Then's theme: ${c}. /then theme usage paints each row by what it spends; /then theme color paints them all in one color.`,
    colors: { blue: 'blue', violet: 'violet', green: 'green', amber: 'amber', pink: 'pink', cyan: 'cyan' },
    colorList: c => `Then is ${c}. To change it: /then color blue | violet | green | amber | pink | cyan, or /then color #RRGGBB (e.g. #D97757). /then color default goes back to /config.`,
    colorSet: c => `Then is now ${c}. The band draws in it right away.`,
    colorBad: a => `Unknown color "${a}". Use blue, violet, green, amber, pink, cyan or a #RRGGBB.`,
    colorReset: 'Then is back to the color set in /config.',
  },
}
let T: Words = WORDS_BY.es
let languageSetting = 'auto'
const languageOf = (setting: string, sessionLanguage: unknown) =>
  setting === 'english' ? 'en' : setting === 'español' ? 'es' : /^(es|span|espa)/i.test(String(sessionLanguage ?? '')) ? 'es' : 'en'

// plan-progress's recipe (one lightness, white on the colour at 4.5:1 or better, a tinted strip with pixel dots) in a
// colour of its own, blue by default so a choice never reads as a running plan (violet) or a question (amber). The
// person picks another in /config (the `color` option); every other colour of the band is drawn from it
const PALETTE: Record<string, number[]> = {
  blue: [43, 116, 170],
  violet: [120, 88, 202],
  green: [24, 128, 58],
  amber: [165, 94, 0],
  pink: [180, 56, 118],
  cyan: [13, 118, 134],
}
const DARK_BG = [24, 24, 27]
const LIGHT_BG = [255, 255, 255]
let ACCENT = PALETTE.blue as number[]
// the pills' text: white where it reads at 4.5:1 on the accent, a near black on a light custom colour
let INK = '#FFFFFF'
let isLight = false

const hex = (c: number[]) => `#${c.map(v => Math.round(v).toString(16).padStart(2, '0')).join('')}`
const mix = (a: number[], b: number[], m: number) => a.map((v, i) => v + ((b[i] ?? 0) - v) * m)
const relLum = (c: number[]) => {
  const l = c.map(v => (v / 255 <= 0.03928 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4))
  return 0.2126 * (l[0] ?? 0) + 0.7152 * (l[1] ?? 0) + 0.0722 * (l[2] ?? 0)
}
const contrast = (a: number[], b: number[]) => (Math.max(relLum(a), relLum(b)) + 0.05) / (Math.min(relLum(a), relLum(b)) + 0.05)

// what `/then color …` accepts, in either language, to the palette's own names
const COLOR_ALIASES: Record<string, string> = {
  azul: 'blue', violeta: 'violet', morado: 'violet', purple: 'violet', verde: 'green', ámbar: 'amber', ambar: 'amber',
  naranja: 'amber', orange: 'amber', rosa: 'pink', rosado: 'pink', cian: 'cyan', turquesa: 'cyan', teal: 'cyan',
}
// a colour the person typed after `/then color`: a palette name (either language) or a #RRGGBB; null when it is neither
export function parseColor(arg: string): string | null {
  const word = arg.trim().toLowerCase()
  if (/^#?[0-9a-f]{6}$/.test(word)) return `#${word.replace('#', '')}`
  const name = COLOR_ALIASES[word] ?? word
  return PALETTE[name] ? name : null
}
// a stored choice as pickAccent takes it: a #RRGGBB is the custom colour
const accentOf = (chosen: string) => (chosen.startsWith('#') ? pickAccent('custom', chosen) : pickAccent(chosen, null))

// a palette name, or with «custom» the #RRGGBB the person wrote; anything unreadable keeps the blue
export function pickAccent(name: unknown, custom: unknown): { accent: number[]; ink: string } {
  const typed = typeof custom === 'string' ? /^#?([0-9a-f]{6})$/i.exec(custom.trim())?.[1] : undefined
  const fromHex = typed ? [0, 2, 4].map(i => parseInt(typed.slice(i, i + 2), 16)) : undefined
  const accent = (name === 'custom' ? fromHex : PALETTE[String(name)]) ?? (PALETTE.blue as number[])
  return { accent, ink: contrast(accent, [255, 255, 255]) >= 4.5 ? '#FFFFFF' : '#1A1A1A' }
}
const accent = () => hex(ACCENT)
const tint = () => hex(mix(isLight ? LIGHT_BG : DARK_BG, ACCENT, isLight ? 0.12 : 0.2))
const dots = () => hex(mix(isLight ? LIGHT_BG : DARK_BG, ACCENT, isLight ? 0.45 : 0.55))
const hash = (a: number, b: number) => {
  const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453
  return x - Math.floor(x)
}
// a braille trail that thickens toward the right edge, as plan-progress's fill thickens toward its head
function trail(width: number, row: number): string {
  let s = ''
  for (let col = 0; col < width; col++) {
    const dense = 0.15 + 0.6 * Math.pow((col + 1) / Math.max(1, width), 1.6)
    let bits = 0
    for (let k = 0; k < 8; k++) if (hash(col + row * 97, k) < dense * 0.5) bits |= 1 << k
    s += String.fromCharCode(0x2800 + bits)
  }
  return s
}
// the rows a drawn tree takes as the terminal lays it out: a Text or a Button one, a Raster its rows, a column the sum
// of its children and gaps, a row its tallest child. An estimate (no wrapping counted), enough to budget the band
export function rowsOf(node: unknown): number {
  if (!node || typeof node !== 'object') return 0
  const el = node as { type?: string; props?: Record<string, unknown>; children?: unknown[] }
  const p = el.props ?? {}
  if (el.type === 'Raster') return Number(p.rows ?? 1)
  if (el.type === 'Client') return Number(p.height ?? 1)
  if (el.type !== 'Box') return 1
  if (p.display === 'none' || p.position === 'absolute') return 0
  const kids = (el.children ?? []).filter(k => k && typeof k === 'object')
  const around = ['marginTop', 'marginBottom', 'paddingTop', 'paddingBottom'].reduce((n, k) => n + Number(p[k] ?? 0), 0)
  if (p.flexDirection === 'column') return kids.reduce((n: number, k) => n + rowsOf(k), 0) + Number(p.gap ?? p.rowGap ?? 0) * Math.max(0, kids.length - 1) + around
  return Math.max(kids.length > 0 ? 1 : 0, ...kids.map(rowsOf)) + around
}

const fitText = (s: string, w: number) => (s.length <= w ? s.padEnd(w) : `${s.slice(0, Math.max(0, w - 1)).trimEnd()}…`.padEnd(w))
// how much an option would spend: a three-cell meter in plan-progress's done, waiting and error hues, the lighter
// set where they sit on a dark strip
const USAGES: Usage[] = ['none', 'low', 'medium', 'high']
// a row's own colour under the usage theme: plan-progress's grey, done, waiting and error hues at one lightness,
// each with white text at 4.5:1 or better
const USAGE_BASE: Record<Usage, number[]> = { none: [107, 106, 115], low: [24, 136, 58], medium: [173, 100, 0], high: [197, 53, 62] }
const USAGE_COLOR: Record<'dark' | 'light', Record<Usage, string>> = {
  dark: { none: '#A7A5AE', low: '#4FA569', medium: '#C0883B', high: '#D67278' },
  light: { none: '#5B5B5E', low: '#157632', medium: '#905300', high: '#B13038' },
}
const meter = (u: Usage) => {
  const n = USAGES.indexOf(u)
  return `${'▮'.repeat(n)}${'▯'.repeat(3 - n)} ${T.usage[u].padEnd(5)}`
}
const METER_W = 9
// set while the band is on screen: a digit typed into the empty composer picks only then
let isBandShown = false




// the chime a turn with options ends on. macOS plays it through the engine (afplay); a Windows terminal has no
// player of its own, so there it is Windows PowerShell's SoundPlayer: one program, a fixed command, run in the
// plugin's folder so the file is named by a fixed relative path. Nothing else is ever run
function chime($: EngineInterface) {
  if (/^[A-Za-z]:/.test($.plugin.root)) {
    void $.process
      .run(['powershell', '-NoLogo', '-NoProfile', '-NonInteractive', '-Command', "(New-Object Media.SoundPlayer 'sounds\\listo.wav').PlaySync()"], {
        cwd: $.plugin.root,
        timeoutMs: 5000,
      })
      .catch(() => undefined)
    return
  }
  void $.audio.play({ asset: 'sounds/listo.wav' }).catch(() => undefined)
}

async function clear($: EngineInterface) {
  const o = await read($, offer)
  if (o) await update($, lastOffer, () => ({ ...o, isFree: false }))
  await update($, offer, () => null)
  await update($, selected, () => null)
  if (mailbox) await publish($, mailbox, null)
}

// ---------- the mailbox: another app on this machine shows the offer and picks from it ----------

// when a turn ends, the offer is also written to <config dir>/then/<session>.offer.json, or `{"id":null}` when there is
// none; an app beside the terminal (a notch, a menu bar) may show it and write <session>.pick.json `{"id", "pick"}`,
// which Then reads while the offer is up and sends as a press on the band would. The id is the offer's own, so a pick
// left from an earlier offer never lands on a new one. Nothing leaves the machine
let mailbox: string | null = null
let pickWatch: Timer | null = null


async function publish($: EngineInterface, base: string, o: Offer | null) {
  pickWatch?.cancel()
  pickWatch = null
  const shown = o && !o.isFree ? o : null
  const body = offerBody('claude', shown ? { id: shown.at, options: shown.options, suggested: shown.suggested } : null)
  await $.fs.write(`${base}.offer.json`, JSON.stringify(body)).catch(() => undefined)
  if (shown) pickWatch = $.clock.every(500, () => void readPick($, base, shown.at))
}

async function readPick($: EngineInterface, base: string, id: number) {
  let pick: { id?: unknown; pick?: unknown }
  try {
    pick = JSON.parse(await $.fs.read(`${base}.pick.json`))
  } catch {
    return
  }
  const o = await read($, offer)
  const n = Number(pick?.pick)
  if (!o || o.at !== id || pick?.id !== id || !Number.isInteger(n) || n < 1 || n > o.options.length) return
  await pressPick($, n)
}

// the rows plan-progress's bars take above the band: a row a bar, one more for a note it shows, one an agent strip,
// and the gap before the band. 0 where it is not installed, its bars are hidden, or its state cannot be read
async function planRowsAbove($: EngineInterface): Promise<number> {
  try {
    if (!(await read($, planOpen))) return 0
    const bars = (await read($, planBars)) as PlanBar[]
    if (!Array.isArray(bars) || bars.length === 0) return 0
    const live = (b: PlanBar) => (b.isFolded ? 0 : Math.min(5, (b.agents ?? []).filter(a => a.state === 'running' || a.state === 'waiting').length))
    return bars.reduce((n, b) => n + 1 + (b.note && b.state !== 'running' ? 1 : 0) + live(b), 0) + 1
  } catch {
    return 0
  }
}


// the numbers a `+` draft marks, in the order typed: «+2 4» → [2, 4]
export const draftPicks = (draft: string) => [...new Set((draft.match(/[1-9]/g) ?? []).map(Number))]

// a click on a row while picking several adds or removes its number in the draft, which the band then follows
async function toggleRow($: EngineInterface, n: number) {
  const now = (await read($, selected)) ?? []
  const next = now.includes(n) ? now.filter(x => x !== n) : [...now, n]
  await update($, selected, () => next)
  await $.prompt.fill({ text: `+${next.join(' ')}` })
}

// the free row keeps the band up while the person writes, and a digit then types as a digit
async function startFree($: EngineInterface) {
  await update($, offer, o => (o ? { ...o, isFree: true } : o))
}

// a press on the band submits the pick as the person's own message, so the transcript reads what was chosen
async function pressPick($: EngineInterface, n: number) {
  if (n === FREE) return startFree($)
  const o = await read($, offer)
  const chosen = o?.options[n - 1]
  if (!chosen) return
  await clear($)
  await $.prompt.submit({ text: `${T.option} ${n}: ${chosen.title}${chosen.detail ? ` — ${chosen.detail}` : ''}`, asUser: true })
}

export const register: Register = (on, options) => {
  const picked = pickAccent(options?.color, options?.customColor)
  const configTheme = options?.theme === 'color' ? 'color' : 'usage'
  const configColor = options?.color === 'custom' ? String(options?.customColor ?? '') : String(options?.color ?? 'blue')
  languageSetting = String(options?.language ?? 'auto')
  ACCENT = picked.accent
  INK = picked.ink

  // per-turn bookkeeping; a reload just starts a fresh count
  let workCalls = 0
  let hasOffered = false
  let hasAsked = false
  let hasNudged = false
  let isSoundOn = true
  // the shells and monitors a turn gave options over: Claude judged them no wait, so a later stop does not either
  const settled = new Set<string>()

  on('turn.start', async ($, e, next) => {
    if (!e.agentId) {
      workCalls = 0
      hasOffered = false
      hasAsked = false
      hasNudged = false
      await update($, waiting, () => null)
    }

    return next(e)
  })

  on('session.start', async ($, e, next) => {
    const rows = await $.config.list().catch(() => [])
    T = WORDS_BY[languageOf(languageSetting, rows.find(row => row.key === 'language')?.value)]
    await $.command.register({ name: 'then', description: T.command, argumentHint: T.argumentHint })
    const storedTheme = await $.store.get(STORE_THEME)
    if (typeof storedTheme === 'string' && THEMES.includes(storedTheme)) await update($, bandTheme, () => storedTheme)
    const storedColor = await $.store.get(STORE_COLOR)
    if (typeof storedColor === 'string' && parseColor(storedColor)) await update($, color, () => storedColor)
    isSoundOn = (await $.store.get(STORE_SOUND)) !== false
    const stored = await $.store.get(STORE_ON)
    if (stored === false) await update($, isOn, () => false)
    const theme = rows.find(row => row.key === 'theme')
    isLight = /light/i.test(String(theme?.value ?? 'dark'))

    return next(e)
  })

  // the hooks that sit in a chain (a setting, a tool call, a prompt, the stop) fail open: if one of them
  // throws, the event goes on as if Then were not there
  // the terminal theme only tells the band light from dark strips; the setting passes on untouched
  on('config.set', { key: 'theme' }, ($, e, next) => {
    isLight = /light/i.test(String(e.value))

    return next(e)
  }).catch(($, e, next) => next(e))

  // a bare digit typed into the empty composer while the band is up picks that option at once, no Enter; the band's
  // Buttons carry no hotkey, which would draw its own "1:" in front of the pill
  on('prompt.edit', async ($, e, next) => {
    // a draft that starts with `+` picks several: the digits typed after it mark their rows, Enter sends them all
    const draft = e.text.slice(0, e.start) + e.inputText + e.text.slice(e.end)
    const isMulti = isBandShown && draft.trimStart().startsWith('+')
    if (isMulti || (await read($, selected)) !== null) {
      const o = await read($, offer)
      const marks = isMulti && o && !o.isFree ? draftPicks(draft).filter(n => n <= o.options.length || n === FREE) : null
      await update($, selected, () => marks)
      if (marks) return next(e)
    }
    if (!isBandShown || e.text !== '' || !/^[1-9]$/.test(e.inputText)) return next(e)
    const o = await read($, offer)
    const n = Number(e.inputText)
    if (!o || o.isFree || (n > o.options.length && n !== FREE)) return next(e)
    void pressPick($, n)

    return { text: e.text, cursor: e.cursor }
  })

  on('prompt.compose', async ($, e, next) => {
    const result = await next(e)
    if (!(await read($, isOn))) return result

    return { sections: [...result.sections, { id: 'then:rules', text: RULES_WITH_WAKEUPS, scope: 'session' as const }] }
  })

  // the main loop's reply is read once it is in: a <then> block becomes the band
  on('turn.step', async function* ($, e, next) {
    const response = yield* next(e)
    if (e.agentId || !response.answer.includes('<then>') || !(await read($, isOn))) return response
    const parsed = parseBlock(response.answer)
    if (!parsed) return response
    const now = await $.clock.now()
    await update($, offer, () => ({ title: T.title, options: parsed.options, at: now, suggested: parsed.suggested }))
    hasOffered = true

    return response
  })

  // the transcript draws the reply without its block; the stored message keeps it, so Claude still reads what it offered
  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) =>
    e.props.text.includes('<the') || /<t?h?e?n?$/.test(e.props.text) ? next({ ...e, props: { ...e.props, text: stripBlock(e.props.text) } }) : next(e),
  )

  // a turn that ends with options chimes, once, as it hands the prompt back
  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (!e.agentId && hasOffered && isSoundOn && (await read($, isOn))) chime($)

    return result
  })

  on('tool.call', async ($, e, next) => {
    if (!e.agentId) {
      workCalls += 1
      if (e.tool === 'AskUserQuestion') hasAsked = true
    }

    return next(e)
  }).catch(($, e, next) => next(e))

  // a number typed in the composer while an offer is up becomes that option; anything else just moves on
  on('prompt.submit', async ($, e, next) => {
    if (e.command || e.isMeta || e.origin.kind !== 'composer') return next(e)
    const o = await read($, offer)
    if (!o) return next(e)
    await clear($)
    const pick = parsePick(e.text)
    if (!pick || pick.picks.some(n => n > o.options.length && n !== FREE)) return next(e)
    // "5" alone says nothing yet; "5 haz X" is the free request
    if (pick.picks.includes(FREE) && !pick.rest) return next(e)

    return next({ ...e, context: [...(e.context ?? []), pickContext(o, pick.picks, pick.rest)] })
  }).catch(($, e, next) => next(e))

  // a turn that did work or answered something and ended without options is sent back once to offer them. That is
  // decided before the hooks beneath run: a turn sent back has not ended, so a settings hook (a notifier, a notch) must
  // not hear a stop that is not one and chime "done" twice. A hook beneath that blocks too is heard on the next stop.
  // A turn paused on background work that will wake it is the exception: sending it back spends a whole model call to
  // ask what the person nearly always answers with "wait". The band says what it is waiting for instead, so nobody is
  // left with only the recap, and the options come with the turn the work wakes
  on('classic.Stop', async ($, e, next) => {
    if (!(await read($, isOn))) return next(e)
    const said = (e.last_assistant_message ?? '').trim()
    if (hasOffered) for (const t of e.background_tasks ?? []) if (canOutlive(t)) settled.add(t.id)
    // a one-shot wake-up is a wait; a recurring one is always pending, and would excuse every turn of the session
    const wakeup = (e.session_crons ?? []).some(c => !c.recurring) ? [T.wakeup] : []
    const awaited = hasOffered || hasAsked ? [] : [...awaitedWork(e.background_tasks, settled), ...wakeup]
    const isQuiet = e.stop_hook_active || hasOffered || hasAsked || hasNudged || awaited.length > 0 || (workCalls === 0 && !said)
    if (!isQuiet && !/[?？]\s*$/.test(said)) {
      hasNudged = true

      return { block: NUDGE }
    }
    if (awaited.length > 0) {
      await clear($)
      await update($, waiting, () => awaited)
    }
    // the offer is in the mailbox before the hooks beneath hear the stop, so an app they tell finds it there
    mailbox = mailboxOf(e.transcript_path, e.session_id) ?? mailbox
    if (mailbox) await publish($, mailbox, await read($, offer))

    return next(e)
  }).catch(($, e, next) => next(e))

  // `/then` turns it on or off; `/then on|off` says which; `/then color …` lists, sets or resets the band's colour
  on('command.run', { command: 'then' }, async ($, e) => {
    const [verb = '', ...rest] = e.args.trim().split(/\s+/)
    const word = verb.toLowerCase()
    const arg = rest.join(' ')
    if (word === 'color' || word === 'colour' || word === 'colores') {
      const current = (await read($, color)) ?? configColor
      const nameOf = (c: string) => (c.startsWith('#') ? c : (T.colors[c] ?? c))
      if (!arg) return { text: T.colorList(nameOf(current)) }
      if (/^(normal|default|reset|config)$/i.test(arg)) {
        await update($, color, () => null)
        await $.store.delete(STORE_COLOR)
        return { text: T.colorReset }
      }
      const chosen = parseColor(arg)
      if (!chosen) return { text: T.colorBad(arg) }
      await update($, color, () => chosen)
      await $.store.set(STORE_COLOR, chosen)
      return { text: T.colorSet(nameOf(chosen)) }
    }
    if (/^(otra|again|de)$/.test(word) || /^(otra vez|de nuevo)$/.test(e.args.trim().toLowerCase())) {
      const last = await read($, lastOffer)
      if (!last) return { text: T.noLast }
      const now = await $.clock.now()
      await update($, offer, () => ({ ...last, at: now, isFree: false }))
      return { text: T.again }
    }
    if (word === 'theme' || word === 'tema') {
      const asked = { consumo: 'usage', usage: 'usage', uso: 'usage', color: 'color', colour: 'color' }[arg.toLowerCase()]
      if (!asked) return { text: T.themeList(T.themes[(await read($, bandTheme)) ?? configTheme] ?? configTheme) }
      await update($, bandTheme, () => asked)
      await $.store.set(STORE_THEME, asked)
      return { text: T.themeSet(T.themes[asked] ?? asked) }
    }
    if (word === 'sound' || word === 'sonido') {
      isSoundOn = !/^(off|apagar|no)$/i.test(arg)
      await $.store.set(STORE_SOUND, isSoundOn)
      if (isSoundOn) chime($)
      return { text: isSoundOn ? T.soundOn : T.soundOff }
    }
    if (word && !/^(on|off|prender|apagar)$/.test(word)) return { text: T.help }
    const was = await read($, isOn)
    const next = word ? /^(on|prender)$/.test(word) : !was
    await update($, isOn, () => next)
    await $.store.set(STORE_ON, next)
    if (!next) await clear($)

    return { text: next ? T.on : T.off }
  })

  // a click on a cut title, whose scroller sits outside its row's Button: the same as pressing the row
  on('ui.message', async ($, e, next) => {
    const press = (e.data as { press?: unknown } | null)?.press
    if (!e.element.startsWith('titulo-') || typeof press !== 'number') return next(e)
    await ((await read($, selected)) ? toggleRow($, press) : pressPick($, press))
    return {}
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const o = await read($, offer)
    isBandShown = false
    if (e.props.hasSurvey || e.props.isWorking || !(await read($, isOn))) return next(e)
    // the colour `/then color` picked wins over /config; reading it here redraws the band when it changes
    const chosen = await read($, color)
    const painted = chosen ? accentOf(chosen) : picked
    ACCENT = painted.accent
    INK = painted.ink
    if (!o) {
      const work = await read($, waiting)
      if (!work?.length) return next(e)
      const under = await next(e)
      const { Box: Row, Text: Label } = $.ui.resolve(e)
      const strip = (
        <Row key="then-esperando" flexDirection="row" gap={1} marginLeft={2}>
          <Label color={INK} backgroundColor={accent()} weight="semibold">{` ${T.waiting} `}</Label>
          <Label wrap="truncate">{work.join(' · ')}</Label>
          <Label dimColor wrap="truncate">{`· ${T.waitingHint}`}</Label>
        </Row>
      )

      return under && rowsOf(under) > 0 ? <Row flexDirection="column" gap={1}>{strip}{under}</Row> : strip
    }
    isBandShown = true
    // what the host and the plugins after this one draw here stays, under the options; asked first, so the band
    // can size itself to the rows left. A band taller than its room scrolls, and the options under the fold are the
    // ones nobody sees: it gives up the meter's heading first, then the free row, then its header line, and the four
    // options stay (5 still picks the free row from the keyboard)
    const below = await next(e)
    // something under the band costs its rows and the gap before it; an empty drawing costs nothing and is left out
    const belowRows = below ? rowsOf(below) : 0
    // plan-progress drawing above the band (its hook outside this one) leaves its rows out of `below`: they are read
    // from its state then. Drawing below (inside), they are already in `below`, so they are not counted twice
    const above = belowRows > 0 ? 0 : await planRowsAbove($)
    const room = (e.props.maxRows || 24) - (belowRows > 0 ? belowRows + 1 : 0) - above
    const showHeader = room >= 5
    const showFree = room >= 6
    const showColumn = room >= 7
    const els = $.ui.resolve(e)
    const { Box, Button, Text } = els
    // the detail scrolls under the pointer where the surface runs a Client of ours (terminal, desktop); elsewhere it
    // is cut as plain text
    const Client = 'Client' in els ? els.Client : null
    const hasClicks = e.surface !== 'terminal' || e.viewport?.isFullscreen === true
    // every row is one strip of the same width, so the pills, titles and details line up in columns
    // the strips span the band less its two columns of margin, from 28 to 110 cells
    const W = Math.min(110, Math.max(28, (e.props.bodyColumns || 100) - 2))
    const free = o.isFree
      ? { title: T.writing, detail: T.writingDetail }
      : { title: T.free, detail: T.freeDetail }
    const maxTitle = Math.min(34, Math.max(free.title.length, ...o.options.map(op => op.title.length)))
    const hasBadge = o.suggested != null
    const hasMeter = o.options.some(op => op.usage)
    // a row is box, gap, pill, gap, title, badge, gap, detail, trail, meter, end. As the band narrows it gives up, in
    // order: the detail, the dotted trail, the badge's word (the star stays), the meter's word (the bars stay), and
    // last the title's tail; every row keeps the same columns, so they still line up
    const BOX_W = 3
    let TRAIL = 4
    let badgeW = hasBadge ? 1 + T.badge.length : 0
    let meterW = hasMeter ? 1 + METER_W : 0
    const around = () => BOX_W + 1 + 3 + 1 + badgeW + 2 + TRAIL + meterW + 1
    if (around() + maxTitle + 10 > W) TRAIL = 0
    if (around() + maxTitle > W && hasBadge) badgeW = 2
    if (around() + maxTitle > W && hasMeter) meterW = 4
    const titleW = Math.max(4, Math.min(maxTitle, W - around()))
    const fixed = around() + titleW
    const detailW = W - fixed
    const isBadgeShort = hasBadge && badgeW === 2
    const isMeterShort = hasMeter && meterW === 4
    const stripBg = tint()
    const ink = isLight ? '#222226' : '#F0EEFC'
    const dim = isLight ? '#5B5B5E' : '#A7A5AE'
    // the accent lifted toward white on a dark strip, deepened on a light one, so the star reads on either
    const star = hex(isLight ? mix(ACCENT, [0, 0, 0], 0.15) : mix(ACCENT, [255, 255, 255], 0.45))
    // the free row's pill is the accent faded into the strip until it is chosen: it is the band's, not an option
    const freePill = o.isFree ? accent() : hex(mix(isLight ? LIGHT_BG : DARK_BG, ACCENT, 0.5))
    type Row = { n: number; title: string; detail: string; pill?: string; isSuggested: boolean; usage?: Usage; hasTrail: boolean }
    const marks = await read($, selected)
    const isUsageTheme = ((await read($, bandTheme)) ?? configTheme) === 'usage'
    const base = isLight ? LIGHT_BG : DARK_BG
    // the star is gold whatever the theme, so the suggested row stands out on any strip
    const gold = isLight ? '#9A6A00' : '#F2C14E'
    // a marked row: the strip lit halfway to the accent and its box ticked white
    const markedBg = hex(mix(isLight ? LIGHT_BG : DARK_BG, ACCENT, isLight ? 0.3 : 0.45))
    // an empty box: a square a shade off the strip, so it reads as something to tick
    const boxBg = hex(mix(mix(isLight ? LIGHT_BG : DARK_BG, ACCENT, isLight ? 0.12 : 0.2), isLight ? [0, 0, 0] : [255, 255, 255], isLight ? 0.12 : 0.16))
    const row = (r: Row) => {
      const isMarked = marks?.includes(r.n) ?? false
      // under the usage theme an option takes the colour of what it spends; the free row and the colour theme keep the accent
      const own = isUsageTheme && r.usage && r.n !== FREE ? USAGE_BASE[r.usage] : null
      const rowAccent = own ?? ACCENT
      const bg = isMarked ? (own ? hex(mix(base, own, isLight ? 0.3 : 0.45)) : markedBg) : own ? hex(mix(base, own, isLight ? 0.12 : 0.2)) : stripBg
      const pill = r.pill ?? hex(rowAccent)
      const pillInk = own ? '#FFFFFF' : INK
      const rowDots = own ? hex(mix(base, own, isLight ? 0.45 : 0.55)) : dots()
      const badgeText = isBadgeShort ? (r.isSuggested ? ' ★' : '  ') : ` ${r.isSuggested ? T.badge : ' '.repeat(T.badge.length)}`
      const isTitleCut = Client !== null && r.title.length > titleW
      const detail = detailW >= 10 ? fitText(r.detail, detailW) : ''
      // the trail takes what the detail leaves: TRAIL cells beside a full one, the whole gap beside none
      const trailW = Math.max(0, W - (fixed - TRAIL) - detail.length)
      return (
        <Box key={`opcion-${r.n}`} flexDirection="row" marginLeft={2}>
          {r.n === FREE
            ? [<Text key="sin-casilla">{' '.repeat(BOX_W + 1)}</Text>]
            : [
                // its own Button beside the row's: a click ticks it and enters the several mode, or unticks it
                <Button key={`casilla-${r.n}`} label={`${isMarked ? '✓' : '☐'} ${r.n}`} plain onPress={() => toggleRow($, r.n)}>
                  <Text color={isMarked ? accent() : INK} backgroundColor={isMarked ? '#FFFFFF' : boxBg} weight="bold">
                    {isMarked ? ' ✓ ' : '   '}
                  </Text>
                </Button>,
                <Text key="tras-casilla"> </Text>,
              ]}
          <Button key={`opcion-btn-${r.n}`} label={`${r.n}. ${r.title}`} plain onPress={() => (marks ? toggleRow($, r.n) : pressPick($, r.n))}>
            <Text color={pillInk} backgroundColor={pill} weight="bold">{` ${r.n} `}</Text>
            <Text backgroundColor={bg}> </Text>
            {isTitleCut ? null : <Text color={ink} backgroundColor={bg} weight="semibold">{fitText(r.title, titleW)}</Text>}
          </Button>
          {/* a cut title scrolls under the pointer like the detail; a Button holds Text alone, so it sits beside the
              pill's and a click on it reaches the band as a `ui.message` */}
          {isTitleCut && Client ? (
            <Client key={`titulo-${o.at}-${r.n}`} module="./detalle.tsx" props={{ text: r.title, width: titleW, color: ink, bg, weight: 'semibold', press: r.n }} width={titleW} />
          ) : null}
          {/* the suggested star twinkles in a Client of its own where the surface runs one; elsewhere it is plain gold */}
          {!hasBadge ? null : r.isSuggested && Client ? (
            <Client key={`estrella-${o.at}-${r.n}`} module="./estrella.tsx" props={{ text: badgeText, bg, dim: hex(mix(base, [242, 193, 78], 0.4)) }} width={badgeText.length} />
          ) : (
            <Text color={r.isSuggested ? gold : bg} backgroundColor={bg} weight="semibold">
              {badgeText}
            </Text>
          )}
          <Text backgroundColor={bg}>{'  '}</Text>
          {detail && Client ? (
            // keyed by the offer too, so a new offer starts a fresh instance rather than scrolling the last one's text
            <Client key={`detalle-${o.at}-${r.n}`} module="./detalle.tsx" props={{ text: r.detail, width: detail.length, color: dim, bg }} width={detail.length} />
          ) : (
            <Text color={dim} backgroundColor={bg}>{detail}</Text>
          )}
          <Text color={rowDots} backgroundColor={bg}>{r.hasTrail ? trail(trailW, r.n) : ' '.repeat(trailW)}</Text>
          {hasMeter ? (
            <Text color={r.usage ? USAGE_COLOR[isLight ? 'light' : 'dark'][r.usage] : bg} backgroundColor={bg}>{` ${r.usage ? (isMeterShort ? meter(r.usage).slice(0, 3) : meter(r.usage)) : ' '.repeat(meterW - 1)}`}</Text>
          ) : null}
          <Text backgroundColor={bg}> </Text>
        </Box>
      )
    }
    const tree = (
      <Box flexDirection="column">
        {showHeader ? (
        <Box flexDirection="row" gap={1}>
          <Text color={accent()}>◆</Text>
          <Text color={INK} backgroundColor={accent()} weight="semibold">{` ${o.title} `}</Text>
          <Text dimColor wrap="truncate">{o.isFree ? T.hintFree : marks ? T.hintMulti : T.hint}</Text>
          <Box flexGrow={1} />
          {hasClicks ? <Button key="then-cerrar" plain dimColor label="✕" onPress={() => clear($)} /> : null}
        </Box>
        ) : null}
        {hasMeter && showColumn ? (
          // the meter column's own heading, right over it, so the bars read as what each option spends
          <Box key="then-columnas" flexDirection="row" marginLeft={2}>
            <Text>{' '.repeat(Math.max(0, W - meterW))}</Text>
            <Text color={star} weight="semibold">{isMeterShort ? ' ▾ ' : ` ${T.column.padEnd(METER_W)}`}</Text>
          </Box>
        ) : null}
        {o.options.map((op, i) =>
          row({ n: i + 1, title: op.title, detail: op.detail, isSuggested: o.suggested === i + 1, usage: op.usage, hasTrail: true }),
        )}
        {showFree || o.isFree ? row({ n: FREE, title: free.title, detail: free.detail, pill: freePill, isSuggested: false, hasTrail: false }) : null}
      </Box>
    )

    return belowRows > 0 ? (
      <Box flexDirection="column" gap={1}>
        {tree}
        {below}
      </Box>
    ) : (
      tree
    )
  })
}
