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
  it("init creates idle state per mode and accepts custom config", () => {
    const tab = init("tabata")
    expect(tab.mode).toBe("tabata")
    expect(tab.status).toBe("idle")
    expect(tab.phase).toBe("idle")
    expect(tab.round).toBe(0)
    expect(tab.remaining).toBe(20)
    expect((tab.config as TabataConfig).work).toBe(20)
    expect((tab.config as TabataConfig).rest).toBe(10)
    expect((tab.config as TabataConfig).rounds).toBe(8)

    const em = init("emom")
    expect(em.mode).toBe("emom")
    expect(em.status).toBe("idle")
    expect((em.config as EmomConfig).minutes).toBe(10)
    expect(em.remaining).toBe(60)

    const am = init("amrap")
    expect(am.mode).toBe("amrap")
    expect(am.status).toBe("idle")
    expect((am.config as AmrapConfig).minutes).toBe(10)
    expect(am.remaining).toBe(600)

    const custom = init("tabata", { work: 30, rest: 15, rounds: 5 })
    expect((custom.config as TabataConfig).work).toBe(30)
    expect((custom.config as TabataConfig).rest).toBe(15)
    expect((custom.config as TabataConfig).rounds).toBe(5)
    expect(custom.remaining).toBe(30)
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

  it("handles edge cases: single round tabata, 1-minute emom, rapid ticks, long amrap, mode switch", () => {
    // single-round tabata completes after work+rest
    const r1 = tick(start(init("tabata", { work: 10, rest: 5, rounds: 1 }), 0), 10000)
    expect(r1.state.phase).toBe("rest")
    expect(tick(r1.state, 15000).state.status).toBe("completed")

    // 1-minute emom still running at 59s
    const emom = tick(start(init("emom", { minutes: 1 }), 0), 59000)
    expect(emom.state.remaining).toBe(1)
    expect(emom.state.status).toBe("running")

    // rapid ticks don't advance past a second
    const rapid1 = tick(start(init("tabata"), 0), 100)
    const rapid2 = tick(rapid1.state, 200)
    expect(rapid2.state.status).toBe("running")
    expect(rapid2.state.remaining).toBe(20)

    // very long amrap (60 min) ticked half-way
    const long = start(init("amrap", { minutes: 60 }), 0)
    expect(long.remaining).toBe(3600)
    expect(tick(long, 1800000).state.remaining).toBe(1800)

    // mode switching resets state
    start(init("tabata"), 1000)
    const switched = init("emom")
    expect(switched.status).toBe("idle")
    expect(switched.mode).toBe("emom")
  })
})
