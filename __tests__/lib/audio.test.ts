jest.mock("expo-av", () => {
  const sound = {
    replayAsync: jest.fn().mockResolvedValue(undefined),
    unloadAsync: jest.fn().mockResolvedValue(undefined),
  }
  return {
    Audio: {
      setAudioModeAsync: jest.fn().mockResolvedValue(undefined),
      Sound: {
        createAsync: jest.fn().mockResolvedValue({ sound }),
      },
    },
  }
})

describe("audio", () => {
  let audio: typeof import("../../lib/audio")
  let Sound: { createAsync: jest.Mock }
  let setAudioModeAsync: jest.Mock

  beforeEach(() => {
    jest.resetModules()
    jest.doMock("expo-av", () => {
      const snd = {
        replayAsync: jest.fn().mockResolvedValue(undefined),
        unloadAsync: jest.fn().mockResolvedValue(undefined),
      }
      return {
        Audio: {
          setAudioModeAsync: jest.fn().mockResolvedValue(undefined),
          Sound: {
            createAsync: jest.fn().mockResolvedValue({ sound: snd }),
          },
        },
      }
    })
    const av = require("expo-av")
    Sound = av.Audio.Sound
    setAudioModeAsync = av.Audio.setAudioModeAsync
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
    expect(Sound.createAsync).not.toHaveBeenCalled()
    await audio.play("tick")
    expect(setAudioModeAsync).toHaveBeenCalledWith({ playsInSilentModeIOS: false })
    expect(Sound.createAsync).toHaveBeenCalled()
  })

  it("play does nothing when disabled", async () => {
    audio.setEnabled(false)
    await audio.play("tick")
    expect(Sound.createAsync).not.toHaveBeenCalled()
  })

  it("play uses replayAsync for playback", async () => {
    await audio.play("complete")
    const { sound } = await Sound.createAsync.mock.results[0].value
    expect(sound.replayAsync).toHaveBeenCalled()
  })

  it("play swallows errors", async () => {
    Sound.createAsync.mockRejectedValueOnce(new Error("fail"))
    await expect(audio.play("tick")).resolves.toBeUndefined()
  })

  it("unload releases all sounds", async () => {
    await audio.play("tick")
    const { sound } = await Sound.createAsync.mock.results[0].value
    await audio.unload()
    expect(sound.unloadAsync).toHaveBeenCalled()
  })

  it("unload is safe when no sounds loaded", async () => {
    await expect(audio.unload()).resolves.toBeUndefined()
  })

  it("play reloads after unload", async () => {
    await audio.play("tick")
    await audio.unload()
    const calls = Sound.createAsync.mock.calls.length
    await audio.play("complete")
    expect(Sound.createAsync.mock.calls.length).toBeGreaterThan(calls)
  })

  it("supports all cue types", async () => {
    const cues: (typeof import("../../lib/audio"))["play"] extends (c: infer C) => unknown ? C : never = "tick"
    const all = ["work_start", "rest_start", "tick", "minute", "warning", "complete"] as const
    for (const cue of all) {
      await audio.play(cue)
    }
    expect(Sound.createAsync).toHaveBeenCalled()
  })
})
