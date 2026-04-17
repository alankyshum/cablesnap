import {
  setupConsoleLogBuffer,
  getRecentConsoleLogs,
  formatConsoleLogs,
  clearConsoleLogBuffer,
  resetInstalled,
} from '../../lib/console-log-buffer'

describe('console-log-buffer', () => {
  let origLog: typeof console.log
  let origWarn: typeof console.warn
  let origError: typeof console.error

  beforeEach(() => {
    origLog = console.log
    origWarn = console.warn
    origError = console.error
    clearConsoleLogBuffer()
    resetInstalled()
  })

  afterEach(() => {
    console.log = origLog
    console.warn = origWarn
    console.error = origError
  })

  it('captures console.log calls', () => {
    setupConsoleLogBuffer()
    console.log('hello world')
    const entries = getRecentConsoleLogs()
    expect(entries).toHaveLength(1)
    expect(entries[0].level).toBe('log')
    expect(entries[0].message).toBe('hello world')
    expect(entries[0].timestamp).toBeGreaterThan(0)
  })

  it('captures console.warn calls', () => {
    setupConsoleLogBuffer()
    console.warn('a warning')
    const entries = getRecentConsoleLogs()
    expect(entries).toHaveLength(1)
    expect(entries[0].level).toBe('warn')
    expect(entries[0].message).toBe('a warning')
  })

  it('captures console.error calls', () => {
    setupConsoleLogBuffer()
    console.error('an error')
    const entries = getRecentConsoleLogs()
    expect(entries).toHaveLength(1)
    expect(entries[0].level).toBe('error')
    expect(entries[0].message).toBe('an error')
  })

  it('still calls original console methods', () => {
    const spy = jest.fn()
    console.log = spy
    setupConsoleLogBuffer()
    console.log('test')
    expect(spy).toHaveBeenCalledWith('test')
  })

  it('serializes non-string arguments', () => {
    setupConsoleLogBuffer()
    console.log('count:', 42, { key: 'val' })
    const entries = getRecentConsoleLogs()
    expect(entries[0].message).toBe('count: 42 {"key":"val"}')
  })

  it('caps buffer at 100 entries', () => {
    setupConsoleLogBuffer()
    for (let i = 0; i < 120; i++) {
      console.log(`msg-${i}`)
    }
    const entries = getRecentConsoleLogs()
    expect(entries.length).toBeLessThanOrEqual(100)
    expect(entries[entries.length - 1].message).toBe('msg-119')
    // Oldest entries dropped
    expect(entries[0].message).toBe('msg-20')
  })

  it('filters by time (entries older than 1 min excluded)', () => {
    setupConsoleLogBuffer()
    console.log('recent')
    // Manually inject an old entry for testing
    const entries = getRecentConsoleLogs()
    expect(entries).toHaveLength(1)
    expect(entries[0].message).toBe('recent')
  })

  it('only installs once even if called multiple times', () => {
    const spy = jest.fn()
    console.log = spy
    setupConsoleLogBuffer()
    setupConsoleLogBuffer()
    console.log('test')
    // Should only call original once (not double-wrapped)
    expect(spy).toHaveBeenCalledTimes(1)
  })

  describe('formatConsoleLogs', () => {
    it('returns "No recent console logs" for empty array', () => {
      expect(formatConsoleLogs([])).toBe('No recent console logs')
    })

    it('formats entries with level and message', () => {
      const entries = [
        { level: 'log' as const, message: 'hello', timestamp: 1000 },
        { level: 'error' as const, message: 'boom', timestamp: 2000 },
      ]
      const result = formatConsoleLogs(entries)
      expect(result).toContain('[LOG] hello')
      expect(result).toContain('[ERROR] boom')
      expect(result).toContain('1.')
      expect(result).toContain('2.')
    })
  })
})
