import {
  init,
  start,
  pause,
  resume,
  reset,
  addRound,
  tick,
  format,
  roundLabel,
  phaseLabel,
  pauseDuration,
  clamp,
  progress,
  duration,
  totalDuration,
  type TabataConfig,
  type EmomConfig,
  type AmrapConfig,
} from "../../lib/timer"

describe("timer", () => {
  describe("init", () => {
    it("creates idle tabata state with defaults", () => {
      const s = init("tabata")
      expect(s.mode).toBe("tabata")
      expect(s.status).toBe("idle")
      expect(s.phase).toBe("idle")
      expect(s.round).toBe(0)
      expect(s.remaining).toBe(20)
      expect((s.config as TabataConfig).work).toBe(20)
      expect((s.config as TabataConfig).rest).toBe(10)
      expect((s.config as TabataConfig).rounds).toBe(8)
    })

    it("creates idle emom state with defaults", () => {
      const s = init("emom")
      expect(s.mode).toBe("emom")
      expect(s.status).toBe("idle")
      expect((s.config as EmomConfig).minutes).toBe(10)
      expect(s.remaining).toBe(60)
    })

    it("creates idle amrap state with defaults", () => {
      const s = init("amrap")
      expect(s.mode).toBe("amrap")
      expect(s.status).toBe("idle")
      expect((s.config as AmrapConfig).minutes).toBe(10)
      expect(s.remaining).toBe(600)
    })

    it("accepts custom config", () => {
      const s = init("tabata", { work: 30, rest: 15, rounds: 5 })
      expect((s.config as TabataConfig).work).toBe(30)
      expect((s.config as TabataConfig).rest).toBe(15)
      expect((s.config as TabataConfig).rounds).toBe(5)
      expect(s.remaining).toBe(30)
    })
  })

  it("duration returns per-mode phase length", () => {
    expect(duration("tabata", { work: 20, rest: 10, rounds: 8 })).toBe(20)
    expect(duration("emom", { minutes: 10 })).toBe(60)
    expect(duration("amrap", { minutes: 15 })).toBe(900)
  })

  it("totalDuration computes total seconds per mode", () => {
    expect(totalDuration("tabata", { work: 20, rest: 10, rounds: 8 })).toBe(240)
    expect(totalDuration("emom", { minutes: 10 })).toBe(600)
    expect(totalDuration("amrap", { minutes: 5 })).toBe(300)
  })

  describe("start", () => {
    it("transitions from idle to running", () => {
      const s = start(init("tabata"), 1000)
      expect(s.status).toBe("running")
      expect(s.phase).toBe("work")
      expect(s.round).toBe(1)
      expect(s.startedAt).toBe(1000)
    })

    it("does not restart if already running", () => {
      const s1 = start(init("tabata"), 1000)
      const s2 = start(s1, 2000)
      expect(s2.startedAt).toBe(1000)
    })

    it("starts from completed state", () => {
      const s = { ...init("tabata"), status: "completed" as const }
      const s2 = start(s, 1000)
      expect(s2.status).toBe("running")
      expect(s2.phase).toBe("work")
      expect(s2.round).toBe(1)
    })

    it("starts emom at round 1", () => {
      const s = start(init("emom"), 1000)
      expect(s.round).toBe(1)
      expect(s.phase).toBe("work")
    })

    it("starts amrap at round 0", () => {
      const s = start(init("amrap"), 1000)
      expect(s.round).toBe(0)
      expect(s.amrapRounds).toBe(0)
    })
  })

  it("pause transitions running → paused and no-ops otherwise", () => {
    const s = pause(start(init("tabata"), 1000), 5000)
    expect(s.status).toBe("paused")
    expect(s.pausedAt).toBe(5000)
    expect(s.elapsed).toBe(4000)
    expect(pause(init("tabata"), 1000).status).toBe("idle")
  })

  it("resume transitions paused → running and no-ops otherwise", () => {
    const running = start(init("tabata"), 1000)
    const paused = pause(running, 5000)
    const resumed = resume(paused, 8000)
    expect(resumed.status).toBe("running")
    expect(resumed.startedAt).toBe(8000)
    expect(resumed.pausedAt).toBeNull()
    expect(resume(init("tabata"), 1000).status).toBe("idle")
  })

  describe("reset", () => {
    it("resets to initial state preserving config", () => {
      const running = start(init("tabata", { work: 30, rest: 15, rounds: 5 }), 1000)
      const s = reset(running)
      expect(s.status).toBe("idle")
      expect(s.round).toBe(0)
      expect((s.config as TabataConfig).work).toBe(30)
    })
  })

  it("addRound only increments amrap rounds while running", () => {
    const s = addRound(start(init("amrap"), 1000))
    expect(s.amrapRounds).toBe(1)
    expect(addRound(s).amrapRounds).toBe(2)
    expect(addRound(start(init("tabata"), 1000)).amrapRounds).toBe(0)
    expect(addRound(init("amrap")).amrapRounds).toBe(0)
  })

  describe("tick — tabata", () => {
    it("counts down during work phase", () => {
      const s = start(init("tabata"), 1000)
      const result = tick(s, 6000)
      expect(result.state.remaining).toBe(15)
      expect(result.state.phase).toBe("work")
      expect(result.state.round).toBe(1)
    })

    it("transitions to rest after work", () => {
      const s = start(init("tabata"), 1000)
      const result = tick(s, 21000)
      expect(result.state.phase).toBe("rest")
      expect(result.state.round).toBe(1)
      expect(result.transition).toBe("rest")
    })

    it("transitions to work on new round", () => {
      const s = { ...start(init("tabata"), 1000), phase: "rest" as const }
      const result = tick(s, 31000)
      expect(result.state.phase).toBe("work")
      expect(result.state.round).toBe(2)
      expect(result.transition).toBe("work")
    })

    it("completes after all rounds", () => {
      const cfg = { work: 5, rest: 5, rounds: 2 }
      const s = start(init("tabata", cfg), 1000)
      // total = (5+5)*2 = 20 seconds
      const result = tick(s, 21000)
      expect(result.state.status).toBe("completed")
      expect(result.state.phase).toBe("completed")
      expect(result.transition).toBe("completed")
    })

    it("stays on last round before completion", () => {
      const cfg = { work: 5, rest: 5, rounds: 2 }
      const s = start(init("tabata", cfg), 1000)
      const result = tick(s, 18000)
      expect(result.state.round).toBe(2)
      expect(result.state.phase).toBe("rest")
      expect(result.state.status).toBe("running")
    })
  })

  describe("tick — emom", () => {
    it("counts down within a minute", () => {
      const s = start(init("emom"), 1000)
      const result = tick(s, 31000)
      expect(result.state.remaining).toBe(30)
      expect(result.state.round).toBe(1)
    })

    it("transitions at minute boundary", () => {
      const s = { ...start(init("emom"), 1000), round: 1 }
      const result = tick(s, 62000)
      expect(result.state.round).toBe(2)
      expect(result.transition).toBe("minute")
    })

    it("completes after total minutes", () => {
      const cfg = { minutes: 1 }
      const s = start(init("emom", cfg), 1000)
      const result = tick(s, 62000)
      expect(result.state.status).toBe("completed")
      expect(result.transition).toBe("completed")
    })
  })

  describe("tick — amrap", () => {
    it("counts down total time", () => {
      const cfg = { minutes: 1 }
      const s = start(init("amrap", cfg), 1000)
      const result = tick(s, 31000)
      expect(result.state.remaining).toBe(30)
    })

    it("triggers warning at 30s", () => {
      const cfg = { minutes: 1 }
      const s = { ...start(init("amrap", cfg), 1000), remaining: 31 }
      const result = tick(s, 31000)
      expect(result.transition).toBe("warning30")
    })

    it("triggers warning at 10s", () => {
      const cfg = { minutes: 1 }
      const s = { ...start(init("amrap", cfg), 1000), remaining: 11 }
      const result = tick(s, 51000)
      expect(result.transition).toBe("warning10")
    })

    it("completes after total time", () => {
      const cfg = { minutes: 1 }
      const s = start(init("amrap", cfg), 1000)
      const result = tick(s, 62000)
      expect(result.state.status).toBe("completed")
      expect(result.transition).toBe("completed")
    })
  })

  it("tick is a no-op for idle or paused states", () => {
    const idle = init("tabata")
    const idleResult = tick(idle, 1000)
    expect(idleResult.state).toBe(idle)
    expect(idleResult.transition).toBe("none")

    const paused = pause(start(init("tabata"), 1000), 5000)
    expect(tick(paused, 10000).transition).toBe("none")
  })

  describe("tick — pause/resume preserves elapsed", () => {
    it("accumulates elapsed across pause/resume", () => {
      const s1 = start(init("tabata", { work: 20, rest: 10, rounds: 8 }), 1000)
      // run for 5 seconds
      const s2 = pause(s1, 6000)
      expect(s2.elapsed).toBe(5000)
      // resume at 10000, run for 10 more seconds
      const s3 = resume(s2, 10000)
      const result = tick(s3, 20000)
      // total elapsed = 5s + 10s = 15s → in work phase (15 < 20)
      expect(result.state.phase).toBe("work")
      expect(result.state.remaining).toBe(5)
    })
  })

  describe("format", () => {
    it("formats seconds as M:SS", () => {
      expect(format(0)).toBe("0:00")
      expect(format(5)).toBe("0:05")
      expect(format(60)).toBe("1:00")
      expect(format(90)).toBe("1:30")
      expect(format(600)).toBe("10:00")
      expect(format(3599)).toBe("59:59")
    })
  })

  it("roundLabel formats per mode", () => {
    expect(roundLabel({ ...start(init("tabata"), 1000), round: 3 })).toBe("3 / 8")
    expect(roundLabel({ ...start(init("emom"), 1000), round: 5 })).toBe("Minute 5 / 10")
    expect(roundLabel({ ...start(init("amrap"), 1000), amrapRounds: 7 })).toBe("7 rounds")
  })

  it("phaseLabel maps phase to display label", () => {
    expect(phaseLabel({ ...init("tabata"), phase: "work" })).toBe("WORK")
    expect(phaseLabel({ ...init("tabata"), phase: "rest" })).toBe("REST")
    expect(phaseLabel({ ...init("tabata"), phase: "completed" })).toBe("DONE")
    expect(phaseLabel(init("tabata"))).toBe("")
  })

  it("pauseDuration computes seconds since pausedAt or 0 when not paused", () => {
    const paused = { ...init("tabata"), status: "paused" as const, pausedAt: 1000 }
    expect(pauseDuration(paused, 6000)).toBe(5)
    expect(pauseDuration(init("tabata"), 1000)).toBe(0)
  })

  describe("clamp", () => {
    it("clamps within range", () => {
      expect(clamp(5, 1, 10)).toBe(5)
      expect(clamp(-1, 1, 10)).toBe(1)
      expect(clamp(15, 1, 10)).toBe(10)
    })
  })

  it("progress returns fraction elapsed with zero-total fallback", () => {
    const base = init("tabata")
    expect(progress(base)).toBe(0)
    expect(progress({ ...base, remaining: 10, total: 20 })).toBe(0.5)
    expect(progress({ ...base, remaining: 0, total: 0 })).toBe(0)
  })

  describe("edge cases", () => {
    it("handles single round tabata", () => {
      const cfg = { work: 10, rest: 5, rounds: 1 }
      const s = start(init("tabata", cfg), 0)
      const r1 = tick(s, 10000)
      expect(r1.state.phase).toBe("rest")
      const r2 = tick(r1.state, 15000)
      expect(r2.state.status).toBe("completed")
    })

    it("handles 1 minute emom", () => {
      const cfg = { minutes: 1 }
      const s = start(init("emom", cfg), 0)
      const r = tick(s, 59000)
      expect(r.state.remaining).toBe(1)
      expect(r.state.status).toBe("running")
    })

    it("handles rapid tick calls", () => {
      const s = start(init("tabata"), 0)
      const r1 = tick(s, 100)
      const r2 = tick(r1.state, 200)
      expect(r2.state.status).toBe("running")
      expect(r2.state.remaining).toBe(20)
    })

    it("handles very long amrap (60 min)", () => {
      const cfg = { minutes: 60 }
      const s = start(init("amrap", cfg), 0)
      expect(s.remaining).toBe(3600)
      const r = tick(s, 1800000) // 30 min
      expect(r.state.remaining).toBe(1800)
    })

    it("mode switching resets state", () => {
      start(init("tabata"), 1000)
      const s2 = init("emom")
      expect(s2.status).toBe("idle")
      expect(s2.mode).toBe("emom")
    })
  })
})
