jest.mock("expo-audio", () => {
  const player = {
    seekTo: jest.fn(),
    play: jest.fn(),
    release: jest.fn(),
  }
  return {
    setAudioModeAsync: jest.fn().mockResolvedValue(undefined),
    createAudioPlayer: jest.fn(() => player),
  }
})

describe("audio", () => {
  let audio: typeof import("../../lib/audio")
  let createAudioPlayer: jest.Mock
  let setAudioModeAsync: jest.Mock

  beforeEach(() => {
    jest.resetModules()
    jest.doMock("expo-audio", () => {
      const p = {
        seekTo: jest.fn(),
        play: jest.fn(),
        release: jest.fn(),
      }
      return {
        setAudioModeAsync: jest.fn().mockResolvedValue(undefined),
        createAudioPlayer: jest.fn(() => p),
      }
    })
    const expoAudio = require("expo-audio")
    createAudioPlayer = expoAudio.createAudioPlayer
    setAudioModeAsync = expoAudio.setAudioModeAsync
    audio = require("../../lib/audio")
  })

  it("defaults to enabled for timer category", () => {
    expect(audio.isEnabled("timer")).toBe(true)
  })

  it("defaults to disabled for feedback category", () => {
    expect(audio.isEnabled("feedback")).toBe(false)
  })

  it("setEnabled toggles per-category state independently", () => {
    audio.setEnabled("timer", false)
    expect(audio.isEnabled("timer")).toBe(false)
    expect(audio.isEnabled("feedback")).toBe(false)
    audio.setEnabled("feedback", true)
    expect(audio.isEnabled("feedback")).toBe(true)
    expect(audio.isEnabled("timer")).toBe(false)
    audio.setEnabled("timer", true)
    expect(audio.isEnabled("timer")).toBe(true)
  })

  it("play loads sounds lazily on first call", async () => {
    expect(createAudioPlayer).not.toHaveBeenCalled()
    await audio.play("tick")
    expect(setAudioModeAsync).toHaveBeenCalledWith({ playsInSilentMode: false })
    expect(createAudioPlayer).toHaveBeenCalled()
  })

  it("play does nothing when category disabled", async () => {
    audio.setEnabled("timer", false)
    await audio.play("tick")
    expect(createAudioPlayer).not.toHaveBeenCalled()
  })

  it("timer/feedback categories are isolated (BLD-559 AC-10)", async () => {
    // timer off, feedback on → set_complete plays, tick silent
    audio.setEnabled("timer", false)
    audio.setEnabled("feedback", true)
    await audio.play("tick")
    expect(createAudioPlayer).not.toHaveBeenCalled()
    await audio.play("set_complete")
    expect(createAudioPlayer).toHaveBeenCalled()
  })

  it("play uses seekTo + play for playback", async () => {
    await audio.play("complete")
    const player = createAudioPlayer.mock.results[0].value
    expect(player.seekTo).toHaveBeenCalledWith(0)
    expect(player.play).toHaveBeenCalled()
  })

  it("play swallows errors", async () => {
    setAudioModeAsync.mockRejectedValueOnce(new Error("fail"))
    await expect(audio.play("tick")).resolves.toBeUndefined()
  })

  it("unload releases all players", async () => {
    await audio.play("tick")
    const player = createAudioPlayer.mock.results[0].value
    await audio.unload()
    expect(player.release).toHaveBeenCalled()
  })

  it("unload is safe when no sounds loaded", async () => {
    await expect(audio.unload()).resolves.toBeUndefined()
  })

  it("play reloads after unload", async () => {
    await audio.play("tick")
    await audio.unload()
    const calls = createAudioPlayer.mock.calls.length
    await audio.play("complete")
    expect(createAudioPlayer.mock.calls.length).toBeGreaterThan(calls)
  })

  it("supports all cue types", async () => {
    const all = ["work_start", "rest_start", "tick", "minute", "warning", "complete", "set_complete"] as const
    // Enable feedback category so set_complete actually plays.
    audio.setEnabled("feedback", true)
    for (const cue of all) {
      await audio.play(cue)
    }
    expect(createAudioPlayer).toHaveBeenCalled()
  })

  it("CUE_CATEGORY covers every cue in SOURCES (BLD-559 AC-13)", () => {
    // Every TimerCue surfaced by play() must have an explicit category
    // mapping — the implementation reads CUE_CATEGORY[cue] with no
    // fallback, so a missing entry would silently route to undefined.
    const categories = audio.CUE_CATEGORY
    const cues: ReadonlyArray<keyof typeof categories> = [
      "work_start", "rest_start", "tick", "minute", "warning", "complete", "set_complete",
    ]
    for (const cue of cues) {
      expect(categories[cue]).toMatch(/^(timer|feedback)$/)
    }
  })
})
