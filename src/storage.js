const STORAGE_KEY = 'tarot-reading-system-static-v1'

export function createEmptySession() {
  return {
    id: '',
    customerName: '',
    questionType: '工作運',
    customQuestionType: '',
    questionContent: '',
    useReversal: false,
    aiResult: '',
    drawnCards: [],
    generatedReadings: [],
    aggregateSummary: null,
    isStarted: false,
    isSummarizing: false,
  }
}

export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { current: createEmptySession(), history: [] }
    const parsed = JSON.parse(raw)
    return {
      current: { ...createEmptySession(), ...(parsed.current || {}) },
      history: Array.isArray(parsed.history) ? parsed.history : [],
    }
  } catch {
    return { current: createEmptySession(), history: [] }
  }
}

export function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

export function resetCurrent(state) {
  state.current = createEmptySession()
  saveState(state)
}

export function upsertHistory(state, session) {
  const summary = {
    ...session,
    updatedAt: new Date().toISOString(),
  }
  const idx = state.history.findIndex((item) => item.id === session.id)
  if (idx >= 0) state.history[idx] = summary
  else state.history.unshift(summary)
  saveState(state)
}

export function deleteHistoryItem(state, id) {
  state.history = state.history.filter((item) => item.id !== id)
  saveState(state)
}

export function clearHistory(state) {
  state.history = []
  saveState(state)
}
