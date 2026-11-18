# WACK MUZIC: brand kit and generation prompts

## Identity
- **Name:** WACK MUZIC (always in capitals in the logo; "Wack Muzic" in running text)
- **What it is:** a music production studio for web, desktop and mobile. You record your voice or beatbox, turn it into drums and instruments, Auto-Tune it, add effects, generate full songs from a genre and mood, mix, and export.
- **Taglines:**
  - **Main:** Make it loud.
  - **Alternatives:**
    - Your voice. Your beat. Your studio.
    - From mouth to music.
    - Beatbox it. Build it. Drop it.
- **Personality:** bold, underground, club-night energy, but clean and professional like a real studio (FL Studio and Ableton, not a toy).

## Colors (neon studio)
| Role | Name | Hex |
|---|---|---|
| Primary glow | Neon Magenta | `#FF2BD6` |
| Secondary glow | Electric Cyan | `#22E6FF` |
| Depth / gradient middle | Ultra Violet | `#6B2BFF` |
| Background | Night | `#0B0B12` |
| Panels | Graphite | `#1A1C22` |
| Text | Ice White | `#F4F6FB` |

The signature gradient runs from Magenta through Violet to Cyan (left to right, or bottom-left to top-right).

## Logo concept
- **Mark:** a single bold **"W"** drawn as one continuous **audio waveform / oscilloscope line**, with sharp peaks like a heartbeat. It sits inside a rounded-square app tile, glows magenta-to-cyan, and has a small spark where the line ends.
- **Wordmark:** **WACK MUZIC** in a heavy, wide geometric sans (similar to Druk Wide, Monument Extended or Clash Display). The **"Z"** can carry a subtle lightning or waveform cut.
- **Lockups:**
  - mark on the left with the wordmark on the right (horizontal),
  - mark above the wordmark (stacked),
  - mark only (app icon).

---

## Prompts

> **Tip:** AI image tools often misspell text. Generate the **mark without text** (prompt 1), then add the wordmark in a real font, or use **Ideogram**, which handles lettering well (prompt 2).

### 1. App icon / logo mark (Midjourney, DALL·E, Ideogram, Firefly)
```
Minimal premium app icon for a music production studio called WACK MUZIC. A single bold letter "W" formed by one continuous glowing audio waveform line, like an oscilloscope heartbeat with sharp peaks, neon gradient from hot magenta #FF2BD6 through ultra violet #6B2BFF to electric cyan #22E6FF, soft bloom glow, inside a rounded-square tile with a deep night background #0B0B12 and subtle dark glass reflection, centered, symmetrical, flat vector style with neon light, high contrast, crisp edges, no text, no letters other than the W shape, studio / nightclub aesthetic, 1024x1024
```
- **Midjourney:** add `--v 6 --style raw --ar 1:1 --no text, words, letters`
- **Variants to try:**
  - "...the W waveform passes through a minimal microphone capsule..."
  - "...the W is made of five equalizer bars of different heights..."

### 2. Wordmark / horizontal logo (Ideogram recommended)
```
Logo wordmark "WACK MUZIC" in a heavy wide geometric sans-serif typeface, all caps, tight letter spacing, neon gradient from magenta #FF2BD6 to cyan #22E6FF with soft glow, the letter Z has a subtle lightning-bolt cut, to the left a square icon of a letter W drawn as an audio waveform, on a pure black background, clean vector logo, music production studio brand, professional, no extra text
```
Then ask for the same design on **pure white** and in **single-color white**, for print and dark UI.

### 3. Opening animation (Runway Gen-3/4, Kling, Pika, Sora, Luma)
**3-second storyboard**
| Time | What happens |
|---|---|
| 0.0–0.6 s | Black screen. A thin flat cyan line (an oscilloscope at rest) draws from left to right with a quiet hum. |
| 0.6–1.2 s | A beat hits. The line jumps into a sharp waveform pulse, magenta and cyan, with a light flash. |
| 1.2–1.8 s | The waveform folds and snaps into the glowing "W" mark inside the rounded tile, with bloom. |
| 1.8–2.4 s | The "WACK MUZIC" wordmark slides in from the right with a light sweep across the letters. |
| 2.4–3.0 s | The tagline "MAKE IT LOUD" fades in, there's one bass-thump glow pulse, and everything fades to the dark app background. |

**Prompt**
```
3-second logo reveal animation for a music studio app "WACK MUZIC". Pure black background. A thin glowing cyan oscilloscope line draws across the screen, then a single heavy bass beat makes it spike into a sharp neon waveform in hot magenta and electric cyan. The waveform folds and snaps into a glowing letter "W" made of the waveform inside a rounded square icon, bloom and light flare, then the bold wide wordmark "WACK MUZIC" slides in with a light sweep, a final glow pulse on the beat, then smooth fade to dark. Neon nightclub aesthetic, clean motion graphics, smooth easing, 60fps, centered composition, no people, no extra text.
```
- **Formats:**
  - 1920×1080 (desktop and web)
  - 1080×1920 (phone)
  - an MP4 or WebM with transparency, if the tool allows
- **For After Effects or Lottie:** use the storyboard above with "ease out back" on the snap, glow done with stacked Gaussian blurs (8, 24 and 60 px) at 60% opacity, and a 1-frame white flash at the beat.
- **Audio sting (optional, Suno, Udio, ElevenLabs SFX):**
  ```
  3-second logo sting: soft riser, one punchy 808 kick with sub drop, short neon synth chord stab, airy reverb tail, modern trap / electronic.
  ```

### 4. Home page / store key art
```
Wide cinematic key art for a music production app "WACK MUZIC": a dark modern home studio at night lit by magenta and cyan neon, a laptop showing a colorful multitrack timeline, a microphone with pop filter, MIDI keyboard, speakers with glowing cones, floating audio waveforms and drum pads as holographic UI elements, shallow depth of field, moody, premium, photorealistic 3D render, lots of empty dark space on the left for a headline, no text, 16:9
```
- **Google Play feature graphic:** add "1024x500".
- **Website hero:** add "2560x1440".

### 5. App-store screenshots frame
```
Clean promotional frame for app store screenshots, dark night gradient background #0B0B12 to #1A1C22 with soft magenta and cyan neon light leaks in the corners, a modern phone mockup in the center with an empty screen, a thin glowing waveform line running behind the phone, minimal, premium, no text, 1242x2688
```

### 6. Loading / beat-pulse micro-animation
```
Seamless looping loading animation: five neon equalizer bars in magenta, violet and cyan bouncing to a beat, with a soft glow, on a transparent background, flat vector motion graphics, 1-second loop
```

---

## Files to deliver (put them in `brand/`, and I'll wire them in)
| File | Size | Used for |
|---|---|---|
| `logo-mark.svg` (or a 1024 PNG) | 1024×1024 | app icon master |
| `logo-horizontal.svg` / `.png` | ~2400×600, transparent | website header, splash |
| `logo-white.svg` | any | single-color uses |
| `icon-maskable.png` | 1024×1024, safe zone = center 80% | Android adaptive icon |
| `favicon.png` | 512×512 | browser tab (scaled automatically) |
| `splash.webm` + `splash.mp4` | 1920×1080 and 1080×1920, ≤3 s | opening animation (optional: the app already has a code-drawn one) |
| `feature-graphic.png` | 1024×500 | Google Play listing |
| `hero.jpg` | 2560×1440 | home page background |

> **Built-in fallback:** the app now ships with a code-drawn neon "W" logo and opening animation, so it looks finished without these files. Generated art can replace them at any time.
