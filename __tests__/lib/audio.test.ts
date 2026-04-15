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

  it("defaults to enabled", () => {
    expect(audio.isEnabled()).toBe(true)
  })

  it("setEnabled toggles state", () => {
    audio.setEnabled(false)
    expect(audio.isEnabled()).toBe(false)
    audio.setEnabled(true)
    expect(audio.isEnabled()).toBe(true)
  })

  it("play loads sounds lazily on first call", async () => {
    expect(createAudioPlayer).not.toHaveBeenCalled()
    await audio.play("tick")
    expect(setAudioModeAsync).toHaveBeenCalledWith({ playsInSilentMode: false })
    expect(createAudioPlayer).toHaveBeenCalled()
  })

  it("play does nothing when disabled", async () => {
    audio.setEnabled(false)
    await audio.play("tick")
    expect(createAudioPlayer).not.toHaveBeenCalled()
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
    const all = ["work_start", "rest_start", "tick", "minute", "warning", "complete"] as const
    for (const cue of all) {
      await audio.play(cue)
    }
    expect(createAudioPlayer).toHaveBeenCalled()
  })
})
