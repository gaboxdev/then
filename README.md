# Then

**A Claude mod** for Claude Code: what's next, one keystroke away.

**English** · [Español](#español)

<p align="center">
  <img src="media/then-en-preview.gif" alt="Then: a band of 4 numbered next steps appears above the Claude Code prompt; pressing 3 picks one, two boxes are ticked to pick several" width="540">
  <br>
  <a href="https://github.com/gaboxdev/then/releases/latest/download/then-en.mp4"><b>▶ Watch the full video with sound (37 s)</b></a>
</p>

Every time Claude finishes a turn, it leaves **4 numbered next steps above the prompt**, plus a fifth one that is yours to write. Type the number and it goes. No more "what should I do next?" at the end of every answer.

```
◆ What next?   3 = pick · +1 3 = several + Enter
                                                                        usage ▾
  1  Test it in the browser               open the page and check it    ▮▯▯ low
  2  Commit my own files     ★ suggested  only this session's files     ▮▮▯ med
  3  Write a check script                 a script that verifies it     ▮▮▮ high
  4  Leave it as is                       nothing else to do            ▯▯▯ none
  5  Something else                       none of these: type your own
```

- **One keystroke.** With the prompt empty, type `3` and option 3 is sent at once, no Enter.
- **Or say it.** `the 3`, `2 and 4`, `2 but skip the tests` + Enter also work (Spanish too: `quiero la 3`, `la 2 y la 4`).
- **Several at once.** Tick the box beside each number you want, or type `+` and then the numbers (`+4 2`); the boxes fill as you go, and Enter sends them in that order.
- **Missed it?** `/then again` brings the last options back.
- **Option 5 is free.** Type `5` and the band stays while you write your own request.
- **★ suggested** marks the one Claude recommends, twinkling in gold.
- **usage** shows what each option would spend in tokens and time: none, low, med, high. With the default **usage theme** each row takes that color too: grey, green, amber, red.
- **Fits any size.** In a narrow terminal the band gives up the detail, then the words (the ★ and the bars stay), and every row still lines up. In a short one it gives up the meter's heading, then the free row, then its header, so the four options never hide behind a scroll.
- **Hover a long description** and it scrolls so you can read all of it (terminal fullscreen mode or the desktop app).
- **A soft chime** when a turn ends with options, so you can look away while Claude works (`/then sound off` mutes it).
- **Forgot?** If Claude ends a turn of real work without options, the mod sends it back once to add them.

## Install

At the prompt of a Claude Code session:

```
/plugin install then --marketplace gaboxdev/then
```

Answer `y` to add the marketplace, then pick the user scope. It works from the next turn on.

## Theme and color

Two themes: **usage** (the default) paints each row by what it spends; **color** paints every row in one color.

```
/then theme usage      → grey, green, amber, red by usage
/then theme color      → all rows in the color below
```

The color (header and boxes, and every row under the color theme):

Type it at the prompt; the band repaints at once and the choice is remembered:

```
/then color            → shows the current color and the list
/then color violet     → blue, violet, green, amber, pink, cyan
/then color #D97757    → any #RRGGBB
/then color default    → back to the one in /config
```

## Settings

Everything else lives in `/config`, under the plugin (`/then color` wins over the color set here):

| Option | Values | Default |
|---|---|---|
| Language | `auto`, `español`, `english` | `auto` (follows Claude Code's language setting) |
| Theme | `usage`, `color` | `usage` |
| Band color | `blue`, `violet`, `green`, `amber`, `pink`, `cyan`, `custom` | `blue` |
| Custom color | any `#RRGGBB` | `#D97757` |

Every palette color keeps white text at 5:1 contrast or better; a light custom color gets dark text instead.

`/then` turns it off and on (`/then on`, `/then off`), `/then sound on|off` the chime; all remembered across sessions.

## What it costs

Then runs on your machine and calls no model of its own. It spends a few of Claude's tokens, measured on a real session:

| What | When | Tokens |
|---|---|---|
| Its rule in the system prompt | every request, cached after the first | ~260 |
| Claude writing the 4 options at the end of its reply | once per turn, output | ~50 |
| Your pick, sent along with your message | when you pick | ~35 |

That is all: the options ride at the end of Claude's own reply in a short block the mod reads and the transcript never draws, so there is **no tool call and no extra step** re-reading the conversation. If Claude forgets the options after real work, the mod asks once, and only that costs one more step.

Version 0.4 used a tool for this; moving to the block cut the fixed part in half (~540 → ~260), the per-turn output by two thirds (~145 → ~50), and removed the extra step, which in a 40k-token conversation cost about as much as 4k fresh input tokens every turn.

`/then off` removes all of it.

## What Then does on your machine

Everything stays local: Then makes **no network requests** and calls no model of its own.

- **System prompt.** It adds one short rule asking Claude to end each reply with a `<then>` block of 4 options (`/then off` removes it).
- **Replies.** It reads that block when a reply is in (`turn.step`) and draws the band; the transcript shows the reply without the block (`ui.render` on `AssistantMessage` changes only what is drawn; the stored message keeps it, so Claude knows what it offered).
- **What it sends as you.** Picking an option with a click or a digit submits a message in your name: `Option 3: <title> — <detail>` (`Opción 3: …` in Spanish). Ticking boxes writes `+1 3` into your prompt box; your Enter sends it.
- **What it adds to your messages.** When you type a pick yourself (`3`, `the 2 and 4`, `+1 3`), it attaches one line of context naming the options you chose, and whatever you wrote after the numbers.
- **Prompt box.** A lone digit typed into the empty prompt while the band is up picks that option instead of typing it (`prompt.edit`); anything else types as usual.
- **Tool calls.** It watches the main session's tool calls (`tool.call`) only to count them, so a turn that did work and forgot the options is reminded once (`classic.Stop`). That turn has not ended, so the other Stop hooks are not told it did: they hear the stop that comes back with the options. A turn paused on background work or a one-shot wake-up (`background_tasks` and `session_crons` on that stop) is not reminded: the band shows what it is waiting for instead. A dev server, a watcher, a recurring `/loop` or a shell a turn already gave options over does not count as a wait. Every call passes on unchanged; Then stands in for no tool.
- **Settings.** It reads the terminal theme when it changes (`config.set` on `theme`) to pick light or dark strips, and passes the change on untouched.
- **Programs it runs.** Only the chime: on macOS the engine's own player; on **Windows**, which has no player for a terminal, `powershell -NoProfile -NonInteractive -Command "(New-Object Media.SoundPlayer 'sounds\listo.wav').PlaySync()"` in the plugin's folder, when a turn ends with options. `/then sound off` stops it. Nothing else is run.
- **Other plugins.** It reads [plan-progress](https://github.com/zycck/claude-mods)'s bars (`plans`, `isOpen`) to leave them room when they sit above the band. It writes nothing of theirs.
- **Stored.** Your choices (on/off, sound, color, theme) and the last offer, in Claude Code's own store for the plugin.
- **Files it writes and reads.** When a turn ends it writes the options to `~/.claude/then/<session>.offer.json` (`{"id": null}` when there are none), so an app beside the terminal can show them, and while they are up it reads `<session>.pick.json` every half second: a pick there with the same `id` is sent as a press on the band would. Onzatchy (the Mac notch) is one such app. The folder is the one beside your Claude Code transcripts.

## Codex

Codex's terminal has no band to draw, so Then comes to Codex as a **hook** that keeps the rest: the same rule, the same `<then>` block, a pick typed as `3` or `la 2 y la 4` + Enter, and the options in the mailbox (`~/.codex/then/<session>.offer.json`, with `"provider": "codex"`) for an app beside the terminal to draw. The block stays visible in Codex's transcript: nothing there can hide it. It needs Node 23.6 or newer. Add it to `~/.codex/hooks.json` (with `[features] hooks = true` in `config.toml`), the path pointing at your clone:

```json
{ "hooks": {
  "SessionStart":     [{ "matcher": "startup|resume", "hooks": [{ "type": "command", "command": "node /path/to/then/codex/hook.ts" }] }],
  "UserPromptSubmit": [{ "hooks": [{ "type": "command", "command": "node /path/to/then/codex/hook.ts" }] }],
  "Stop":             [{ "hooks": [{ "type": "command", "command": "node /path/to/then/codex/hook.ts", "timeout": 30 }] }]
} }
```

Codex runs a new hook only once you trust it. A turn that ends without options is sent back once, as in Claude Code; a question or an empty reply is not.

## How it works

It is a Claude mod (a Claude Code hooks module). It adds one short rule to the system prompt asking Claude to end each reply with a `<then>` block of 4 lines (`n|title|detail|usage`, a `*` on the suggested one). The mod reads that block when the reply is in, hides it from the transcript (the stored message keeps it, so Claude knows what it offered) and draws the band above the prompt; what you type is read before it reaches Claude, and the option you chose travels with your message as context. Nothing leaves your machine.

Made to sit next to [plan-progress](https://github.com/zycck/claude-mods), whose look it borrows.

---

## Español

**Then** es un Claude mod para Claude Code.

<p align="center">
  <img src="media/then-es-preview.gif" alt="Then: aparece una banda con 4 opciones numeradas encima del prompt de Claude Code; con el 3 se elige una y con dos casillas se eligen varias" width="540">
  <br>
  <a href="https://github.com/gaboxdev/then/releases/latest/download/then-es.mp4"><b>▶ Ver el video completo con sonido (37 s)</b></a>
</p>

Cada vez que Claude termina un turno, deja **4 opciones numeradas para seguir encima del prompt**, más una quinta que escribes tú. Escribes el número y listo.

- **Una tecla.** Con el prompt vacío, escribe `3` y la opción 3 sale al instante, sin Enter.
- **O dilo.** `quiero la 3`, `la 2 y la 4`, `2 pero sin commit` + Enter también sirven.
- **Varias a la vez.** Marca la casilla al lado de cada número que quieras, o escribe `+` y luego los números (`+4 2`); las casillas se llenan mientras eliges, y Enter las manda en ese orden.
- **¿Se fue?** `/then otra vez` vuelve a mostrar las últimas opciones.
- **La 5 es libre.** Escribe `5` y la banda se queda mientras escribes lo tuyo.
- **★ sugerida** marca la que Claude recomienda, y titila en dorado.
- **consumo** dice cuánto gastaría cada opción en tokens y tiempo: nada, bajo, medio, alto. Con el **tema consumo** (el de por defecto) cada fila toma ese color: gris, verde, ámbar, rojo.
- **Se adapta al tamaño.** En una terminal angosta la banda suelta el detalle y luego las palabras (quedan la ★ y las barras), y las filas siguen alineadas. En una baja suelta el rótulo de consumo, luego la fila libre y luego su encabezado, para que las 4 opciones nunca queden escondidas detrás de un scroll.
- **Pasa el mouse sobre una descripción larga** y se desplaza para leerla entera (modo pantalla completa de la terminal o la app de escritorio).
- **Suena suave** cuando un turno termina con opciones, para que puedas mirar otra cosa mientras Claude trabaja (`/then sonido off` lo calla).

### Instalar

```
/plugin install then --marketplace gaboxdev/then
```

Responde `y` para agregar el mercado y elige el alcance de usuario.

### Ajustes

**Tema:** `/then tema consumo` (por defecto, cada fila según lo que gasta) o `/then tema color` (todas en un color).

**Cambiar el color**, escribiéndolo en el prompt (se ve al instante y se recuerda):

```
/then color            → muestra el color actual y la lista
/then color violeta    → azul, violeta, verde, ámbar, rosa, cian
/then color #D97757    → cualquier #RRGGBB
/then color normal     → vuelve al de /config
```

En `/config` están el idioma (`auto`, `español`, `english`) y el color por defecto. `/then` lo apaga y lo prende (`/then on`, `/then off`) y `/then sonido on|off` maneja el sonido.

### Qué hace Then en tu equipo

Todo queda local: Then **no hace peticiones de red** ni llama a ningún modelo propio.

- **Prompt de sistema:** agrega una regla corta para que Claude cierre cada respuesta con un bloque `<then>` de 4 opciones (`/then off` la quita).
- **Respuestas:** lee ese bloque al terminar la respuesta y dibuja la banda; la conversación se ve sin el bloque (solo cambia lo que se dibuja; el mensaje guardado lo conserva).
- **Lo que envía a tu nombre:** al elegir con un clic o un número, manda un mensaje tuyo: `Opción 3: <título> — <detalle>`. Al marcar casillas escribe `+1 3` en tu prompt; tu Enter lo envía.
- **Lo que agrega a tus mensajes:** si escribes la elección (`3`, `la 2 y la 4`, `+1 3`), adjunta una línea de contexto con las opciones elegidas y lo que escribiste después.
- **Prompt:** un número solo, con el prompt vacío y la banda a la vista, elige esa opción en vez de escribirse; todo lo demás se escribe normal.
- **Llamadas a herramientas:** solo las cuenta, para recordarle a Claude una vez las opciones si las olvidó después de trabajar. Todas pasan sin cambios. Ese turno no terminó, así que a los demás hooks de Stop no se les avisa que terminó: se enteran cuando vuelve con las opciones.
- **Ajustes:** lee el tema de la terminal cuando cambia, para elegir franjas claras u oscuras, y deja pasar el cambio intacto.
- **Programas que corre:** solo el sonido. En macOS, el reproductor de Claude Code; en **Windows**, que no tiene uno para la terminal, `powershell` con un comando fijo que reproduce `sounds\listo.wav` de la carpeta del plugin. `/then sonido off` lo apaga. Nada más.
- **Otros plugins:** lee las barras de [plan-progress](https://github.com/zycck/claude-mods) para dejarles espacio cuando están encima de la banda. No escribe nada suyo.
- **Lo que guarda:** tus ajustes (encendido, sonido, color, tema) y la última oferta, en el almacén de Claude Code para el plugin.
- **Archivos que escribe y lee:** al terminar un turno escribe las opciones en `~/.claude/then/<sesión>.offer.json` (`{"id": null}` si no hay), para que una app al lado de la terminal las muestre, y mientras siguen arriba lee `<sesión>.pick.json` cada medio segundo: una elección ahí con el mismo `id` se manda como si tocaras la banda. Onzatchy (el notch del Mac) es una de esas apps. La carpeta es la que está al lado de tus transcripts de Claude Code.

### Codex

La terminal de Codex no deja dibujar la banda, así que Then llega a Codex como un **hook** que hace el resto: la misma regla, el mismo bloque `<then>`, elegir escribiendo `3` o `la 2 y la 4` + Enter, y las opciones en el buzón (`~/.codex/then/<sesión>.offer.json`, con `"provider": "codex"`) para que una app al lado de la terminal las dibuje. El bloque se ve en la conversación de Codex: ahí no hay cómo esconderlo. Necesita Node 23.6 o más nuevo; se agrega a `~/.codex/hooks.json` igual que arriba, y Codex lo corre recién cuando lo marcas como confiable.

### Cuánto consume

Then corre en tu máquina y no llama a ningún modelo propio. Gasta pocos tokens de Claude, medidos en una sesión real:

- **Fijo, en el prompt de sistema:** ~260 tokens (la regla). Queda en caché después de la primera petición.
- **Por turno:** ~50 tokens de salida, Claude escribiendo las 4 opciones al final de su respuesta.
- **Al elegir:** ~35 tokens que viajan con tu mensaje.
- **Sin paso extra:** las opciones van en un bloque corto al final de la respuesta, que el mod lee y no se dibuja. No hay llamada a herramienta ni un paso más que vuelva a leer la conversación. Solo si Claude las olvida después de trabajar, el mod le pide una vez que las ponga.

Frente a la versión 0.4 (que usaba una herramienta): la parte fija bajó a la mitad (~540 → ~260), la salida por turno a un tercio (~145 → ~50) y desapareció el paso extra, que en una conversación de 40k tokens costaba como 4k tokens de entrada en cada turno.

`/then off` lo quita todo.

## License

MIT
