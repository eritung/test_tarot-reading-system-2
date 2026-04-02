import { MAJOR_ARCANA, MINOR_ARCANA, SUITS, QUESTION_TYPES, CARD_POSITIONS } from './data.js'
import { loadState, saveState, upsertHistory, resetCurrent } from './storage.js'
import { FUNCTION_URL } from './config.js'
import { supabase } from './supabase-client.js'

const state = loadState()
const app = document.querySelector('#app')

if (!Array.isArray(state.current.generatedReadings)) state.current.generatedReadings = []
if (typeof state.current.isGenerating !== 'boolean') state.current.isGenerating = false
state.history = (state.history || []).map((item) => ({ ...item, generatedReadings: Array.isArray(item.generatedReadings) ? item.generatedReadings : [] }))

function uid(prefix = 'id') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function showToast(msg, type = 'success') {
  document.querySelectorAll('.toast').forEach((el) => el.remove())
  const toast = document.createElement('div')
  toast.className = `toast ${type}`
  toast.textContent = msg
  document.body.appendChild(toast)
  setTimeout(() => toast.remove(), 2800)
}

function getQuestionTypeValue(source = state.current) {
  return source.questionType === '其他'
    ? (source.customQuestionType || '其他')
    : source.questionType
}

function persistCurrent() {
  saveState(state)
}

function snapshotCurrentSession() {
  return {
    id: state.current.id,
    customerName: state.current.customerName,
    questionType: state.current.questionType,
    customQuestionType: state.current.customQuestionType,
    questionContent: state.current.questionContent,
    useReversal: state.current.useReversal,
    drawnCards: state.current.drawnCards.map((card) => ({ ...card })),
    isStarted: state.current.isStarted,
    generatedReadings: state.current.generatedReadings.map((item) => ({
      ...item,
      payloadSnapshot: item.payloadSnapshot ? structuredClone(item.payloadSnapshot) : null,
    })),
  }
}

function startSession() {
  if (!state.current.customerName.trim()) return showToast('請先輸入客戶姓名', 'error')
  state.current.id = state.current.id || uid('session')
  state.current.isStarted = true
  upsertHistory(state, { ...snapshotCurrentSession(), questionType: getQuestionTypeValue() })
  render()
  showToast('已建立諮詢紀錄')
}

function saveSession() {
  if (!state.current.customerName.trim()) return showToast('請先輸入客戶姓名', 'error')
  if (!state.current.id) state.current.id = uid('session')
  upsertHistory(state, { ...snapshotCurrentSession(), questionType: getQuestionTypeValue(), isStarted: true })
  render()
  showToast('紀錄已儲存到本機瀏覽器')
}

function nextCustomer() {
  if (!confirm('確定要結束本次諮詢並開始下一位顧客嗎？')) return
  if (state.current.id) upsertHistory(state, { ...snapshotCurrentSession(), questionType: getQuestionTypeValue(), isStarted: false })
  resetCurrent(state)
  if (!Array.isArray(state.current.generatedReadings)) state.current.generatedReadings = []
  render()
  showToast('已重置，可開始下一位顧客')
}

function deleteCard(id) {
  state.current.drawnCards = state.current.drawnCards.filter((c) => c.id !== id)
  state.current.generatedReadings = state.current.generatedReadings.filter((item) => {
    const sourceId = item?.payloadSnapshot?.cards?.[0]?.source_id
    return sourceId ? sourceId !== id : true
  })
  persistCurrent()
  syncCurrentToHistory()
  render()
}

function deleteGeneratedResult(id) {
  const target = state.current.generatedReadings.find((item) => item.id === id)
  if (!target) return
  const sourceId = target?.payloadSnapshot?.cards?.[0]?.source_id
  state.current.generatedReadings = state.current.generatedReadings.filter((item) => item.id !== id)
  if (sourceId) {
    state.current.drawnCards = state.current.drawnCards.filter((card) => card.id !== sourceId)
  }
  persistCurrent()
  syncCurrentToHistory()
  render()
  showToast('已移除該張牌與對應解牌結果')
}

function buildCardsPayload(cards = state.current.drawnCards, useReversal = state.current.useReversal) {
  return cards.map((card, index) => ({
    order: index + 1,
    source_id: card.id,
    name: card.cardName,
    position: card.position === '其他' ? (card.customPosition || '自訂牌位') : card.position,
    raw_position: card.position,
    custom_position: card.customPosition || '',
    reversed: Boolean(useReversal && card.isReversed),
  }))
}

function buildPayloadFromCurrent(cards = state.current.drawnCards) {
  return {
    client_name: state.current.customerName.trim(),
    question_type: getQuestionTypeValue(),
    question: state.current.questionContent.trim(),
    spread_type: '自訂牌陣',
    include_reversed: Boolean(state.current.useReversal),
    cards: buildCardsPayload(cards, state.current.useReversal),
  }
}

function syncCurrentToHistory() {
  if (!state.current.id) return
  upsertHistory(state, { ...snapshotCurrentSession(), questionType: getQuestionTypeValue(), isStarted: state.current.isStarted })
}

function openUsageModal() {
  const wrapper = document.createElement('div')
  wrapper.className = 'modal-backdrop'
  wrapper.innerHTML = `
    <div class="panel panel-gold modal help-modal">
      <button class="button btn-ghost modal-close-btn" data-close aria-label="關閉">✕</button>
      <div class="row modal-head">
        <h3 class="section-title">✦ 使用說明</h3>
      </div>
      <div class="divider"></div>
      <div class="help-content">
        <ol>
          <li>先輸入客戶姓名、問題類型與提問內容。</li>
          <li>點擊「新增抽牌」，加入本次抽出的牌卡與牌位。</li>
          <li>按下「產生新的獨立解牌」後，會依目前每一張牌各自生成一筆結果。</li>
          <li>若只想重算其中一張牌，直接按該筆結果的「重新生成」即可。</li>
          <li>若選錯牌，可在抽牌紀錄或解牌結果卡中直接移除該張牌。</li>
          <li>「歷史紀錄」可查詢本機與雲端資料，並用關鍵字搜尋客戶、題目、牌名與時間。</li>
        </ol>
      </div>
      <div class="divider"></div>
      <div class="row modal-footer-row">
        <button class="button btn-gold" data-close>知道了</button>
      </div>
    </div>`
  wrapper.querySelectorAll('[data-close]').forEach((el) => el.addEventListener('click', () => wrapper.remove()))
  wrapper.addEventListener('click', (e) => { if (e.target === wrapper) wrapper.remove() })
  document.body.appendChild(wrapper)
}

function openModal(editCard = null) {
  const usedCards = state.current.drawnCards.map((c) => c.cardName)
  const wrapper = document.createElement('div')
  wrapper.className = 'modal-backdrop'
  let category = editCard && MAJOR_ARCANA.includes(editCard.cardName) ? 'major' : 'major'
  let suit = '權杖'
  if (editCard && !MAJOR_ARCANA.includes(editCard.cardName)) {
    category = 'minor'
    suit = SUITS.find((s) => MINOR_ARCANA[s].includes(editCard.cardName)) || '權杖'
  }
  let selectedCard = editCard?.cardName || ''
  let position = editCard?.position || '現在'
  let customPosition = editCard?.customPosition || ''
  let isReversed = Boolean(editCard?.isReversed)

  const renderModal = () => {
    const pool = category === 'major' ? MAJOR_ARCANA : MINOR_ARCANA[suit]
    const cards = pool.filter((card) => card === editCard?.cardName || !usedCards.includes(card))
    wrapper.innerHTML = `
      <div class="panel panel-gold modal">
        <button class="button btn-ghost modal-close-btn" data-close aria-label="關閉">✕</button>
        <div class="row modal-head">
          <h3 class="section-title">✦ ${editCard ? '編輯牌卡' : '選擇塔羅牌'}</h3>
        </div>
        <div class="divider"></div>
        <div style="display:grid; gap:16px;">
          <div>
            <label class="label">牌組類別</label>
            <div class="row modal-category-row">
              <button class="button ${category === 'major' ? 'btn-gold' : 'btn-outline'}" data-category="major">大牌</button>
              <button class="button ${category === 'minor' ? 'btn-gold' : 'btn-outline'}" data-category="minor">小牌</button>
            </div>
          </div>
          ${category === 'minor' ? `<div><label class="label">花色</label><div class="minor-suit-grid">${SUITS.map((s) => `<button class="button ${suit === s ? 'btn-gold' : 'btn-outline'}" data-suit="${s}">${s}</button>`).join('')}</div></div>` : ''}
          <div>
            <label class="label">選擇牌名</label>
            <select class="select" id="card-select">
              <option value="">── 請選擇 ──</option>
              ${cards.map((card) => `<option value="${card}" ${selectedCard === card ? 'selected' : ''}>${card}</option>`).join('')}
            </select>
          </div>
          <div>
            <label class="label">牌位屬性</label>
            <select class="select" id="position-select">
              ${CARD_POSITIONS.map((p) => `<option value="${p}" ${position === p ? 'selected' : ''}>${p}</option>`).join('')}
            </select>
          </div>
          ${position === '其他' ? `<div><label class="label">自訂牌位名稱</label><input class="input" id="custom-position" value="${customPosition}" placeholder="輸入自訂牌位..." /></div>` : ''}
          ${state.current.useReversal ? `<div><label class="label">正逆位</label><div class="row modal-category-row"><button class="button ${!isReversed ? 'btn-gold' : 'btn-outline'}" data-rev="0">⬆️ 正位</button><button class="button ${isReversed ? 'btn-gold' : 'btn-outline'}" data-rev="1">🔄 逆位</button></div></div>` : ''}
        </div>
        <div class="divider"></div>
        <div class="row modal-footer-row">
          <button class="button btn-outline" data-close>取消</button>
          <button class="button btn-gold" data-submit ${selectedCard ? '' : 'disabled'}>${editCard ? '儲存修改' : '加入此牌'}</button>
        </div>
      </div>`

    wrapper.querySelectorAll('[data-close]').forEach((el) => el.addEventListener('click', () => wrapper.remove()))
    wrapper.addEventListener('click', (e) => { if (e.target === wrapper) wrapper.remove() })
    wrapper.querySelectorAll('[data-category]').forEach((el) => el.addEventListener('click', () => { category = el.dataset.category; selectedCard = ''; renderModal() }))
    wrapper.querySelectorAll('[data-suit]').forEach((el) => el.addEventListener('click', () => { suit = el.dataset.suit; selectedCard = ''; renderModal() }))
    wrapper.querySelectorAll('[data-rev]').forEach((el) => el.addEventListener('click', () => { isReversed = el.dataset.rev === '1'; renderModal() }))
    wrapper.querySelector('#card-select')?.addEventListener('change', (e) => { selectedCard = e.target.value; renderModal() })
    wrapper.querySelector('#position-select')?.addEventListener('change', (e) => { position = e.target.value; renderModal() })
    wrapper.querySelector('#custom-position')?.addEventListener('input', (e) => { customPosition = e.target.value })
    wrapper.querySelector('[data-submit]')?.addEventListener('click', () => {
      const nextOrder = editCard?.cardOrder ?? state.current.drawnCards.length
      const payload = {
        id: editCard?.id || uid('card'),
        cardName: selectedCard,
        isReversed: state.current.useReversal ? isReversed : false,
        position,
        customPosition: position === '其他' ? customPosition : '',
        cardOrder: nextOrder,
      }
      if (editCard) {
        state.current.drawnCards = state.current.drawnCards.map((c) => c.id === editCard.id ? payload : c)
      } else {
        state.current.drawnCards.push(payload)
      }
      persistCurrent()
      wrapper.remove()
      render()
      showToast(editCard ? '牌卡已更新' : '已加入牌卡')
    })
  }

  renderModal()
  document.body.appendChild(wrapper)
}

async function insertReadingToSupabase(payload, aiResult) {
  const dbPayload = {
    client_name: payload.client_name,
    question: payload.question,
    question_type: payload.question_type,
    spread_type: payload.spread_type || '自訂牌陣',
    cards: payload.cards,
    include_reversed: Boolean(payload.include_reversed),
    ai_result: aiResult,
  }

  const { data, error } = await supabase
    .from('readings')
    .insert(dbPayload)
    .select('id')
    .single()

  if (error) throw error
  return data?.id || ''
}

async function updateReadingInSupabase(readingId, aiResult) {
  if (!readingId) return ''
  const { data, error } = await supabase
    .from('readings')
    .update({ ai_result: aiResult })
    .eq('id', readingId)
    .select('id')
    .single()

  if (error) throw error
  return data?.id || readingId
}

function upsertGeneratedResult(resultItem) {
  const idx = state.current.generatedReadings.findIndex((item) => item.id === resultItem.id)
  if (idx >= 0) state.current.generatedReadings[idx] = resultItem
  else state.current.generatedReadings.unshift(resultItem)
  persistCurrent()
  syncCurrentToHistory()
}

function refreshGeneratedReadingTitles() {
  state.current.generatedReadings = state.current.generatedReadings.map((item, index) => ({
    ...item,
    title: `第 ${state.current.generatedReadings.length - index} 次解牌`,
  }))
}

async function requestSingleReading(payload, targetResultId = null) {
  const response = await fetch(FUNCTION_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ...payload, regenerate_reading_id: targetResultId || undefined }),
  })

  const data = await response.json()
  if (!response.ok || !data.ok) {
    throw new Error(data?.error?.message || data?.error || 'AI 解牌失敗')
  }

  const aiResult = data.result || '沒有取得解牌結果'
  let readingId = data.reading_id || ''

  const existing = targetResultId ? state.current.generatedReadings.find((item) => item.id === targetResultId) : null
  if (!readingId && existing?.readingId) {
    readingId = await updateReadingInSupabase(existing.readingId, aiResult)
  } else if (!readingId) {
    readingId = await insertReadingToSupabase(payload, aiResult)
  }

  return { aiResult, readingId }
}

async function generateAI(options = {}) {
  const { payload = buildPayloadFromCurrent(), targetResultId = null } = options

  if (!payload.client_name?.trim()) return showToast('請先輸入客戶姓名', 'error')
  if (!payload.question?.trim()) return showToast('請輸入客戶提問內容', 'error')
  if (!Array.isArray(payload.cards) || payload.cards.length === 0) return showToast('請至少新增一張牌', 'error')
  if (state.current.isGenerating) return

  state.current.isGenerating = true
  render()

  try {
    if (targetResultId) {
      const existing = state.current.generatedReadings.find((item) => item.id === targetResultId)
      if (!existing?.payloadSnapshot) throw new Error('找不到可重新生成的占卜資料')

      upsertGeneratedResult({
        ...existing,
        isLoading: true,
        isExpanded: true,
        errorMessage: '',
      })
      render()

      const { aiResult, readingId } = await requestSingleReading(payload, targetResultId)
      upsertGeneratedResult({
        ...existing,
        readingId,
        aiResult,
        payloadSnapshot: structuredClone(payload),
        updatedAt: new Date().toISOString(),
        isExpanded: true,
        isLoading: false,
        errorMessage: '',
      })

      persistCurrent()
      syncCurrentToHistory()
      render()
      document.querySelector(`#result-${targetResultId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      showToast('已重新生成指定結果')
      return
    }

    const existingGeneratedSourceIds = new Set(
      state.current.generatedReadings
        .map((item) => item?.payloadSnapshot?.cards?.[0]?.source_id)
        .filter(Boolean)
    )

    let cardPayloads = payload.cards
      .map((card) => ({
        ...payload,
        cards: [structuredClone(card)],
      }))
      .filter((singlePayload) => {
        const sourceId = singlePayload?.cards?.[0]?.source_id
        return sourceId ? !existingGeneratedSourceIds.has(sourceId) : true
      })

    // 若這次沒有新增牌，代表使用者可能是更新題目或其他欄位後想直接重算目前這批牌
    if (!cardPayloads.length) {
      cardPayloads = payload.cards.map((card) => ({
        ...payload,
        cards: [structuredClone(card)],
      }))
    }

    const loadingItems = cardPayloads.map((singlePayload, index) => ({
      id: uid('result'),
      readingId: '',
      title: `第 ${state.current.generatedReadings.length + index + 1} 次解牌`,
      aiResult: '',
      payloadSnapshot: structuredClone(singlePayload),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isExpanded: true,
      isLoading: true,
      errorMessage: '',
    }))

    loadingItems.forEach((item) => upsertGeneratedResult(item))
    refreshGeneratedReadingTitles()
    render()

    for (const loadingItem of loadingItems) {
      try {
        const { aiResult, readingId } = await requestSingleReading(loadingItem.payloadSnapshot)
        upsertGeneratedResult({
          ...loadingItem,
          readingId,
          aiResult,
          updatedAt: new Date().toISOString(),
          isLoading: false,
          errorMessage: '',
        })
      } catch (error) {
        console.error(error)
        upsertGeneratedResult({
          ...loadingItem,
          isLoading: false,
          errorMessage: error?.message || '處理失敗',
          updatedAt: new Date().toISOString(),
        })
      }
      refreshGeneratedReadingTitles()
      render()
    }

    state.current.id = state.current.id || uid('session')
    state.current.isStarted = true
    persistCurrent()
    syncCurrentToHistory()
    render()
    document.querySelector(`#result-${loadingItems[0]?.id || ''}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    showToast(`已新增 ${loadingItems.length} 筆獨立解牌結果`)
  } catch (error) {
    console.error(error)
    render()
    showToast(error?.message || '處理失敗', 'error')
  } finally {
    state.current.isGenerating = false
    persistCurrent()
    render()
  }
}

function bindInputs() {
  app.querySelector('#customerName')?.addEventListener('input', (e) => {
    state.current.customerName = e.target.value
    persistCurrent()
    renderHeaderOnly()
  })
  app.querySelector('#questionType')?.addEventListener('change', (e) => {
    state.current.questionType = e.target.value
    if (e.target.value !== '其他') state.current.customQuestionType = ''
    persistCurrent()
    render()
  })
  app.querySelector('#customQuestionType')?.addEventListener('input', (e) => {
    state.current.customQuestionType = e.target.value
    persistCurrent()
  })
  app.querySelector('#questionContent')?.addEventListener('input', (e) => {
    state.current.questionContent = e.target.value
    persistCurrent()
  })
  app.querySelector('#useReversal')?.addEventListener('click', () => {
    state.current.useReversal = !state.current.useReversal
    persistCurrent()
    render()
  })
  app.querySelector('#startBtn')?.addEventListener('click', startSession)
  app.querySelector('#saveBtn')?.addEventListener('click', saveSession)
  app.querySelector('#generateBtn')?.addEventListener('click', () => generateAI())
  app.querySelector('#nextBtn')?.addEventListener('click', nextCustomer)
  app.querySelector('#addCardBtn')?.addEventListener('click', () => openModal())
  app.querySelector('#helpBtn')?.addEventListener('click', openUsageModal)
  app.querySelectorAll('[data-edit-card]').forEach((el) => el.addEventListener('click', () => {
    const card = state.current.drawnCards.find((c) => c.id === el.dataset.editCard)
    if (card) openModal(card)
  }))
  app.querySelectorAll('[data-delete-card]').forEach((el) => el.addEventListener('click', () => {
    const id = el.dataset.deleteCard
    const card = state.current.drawnCards.find((c) => c.id === id)
    if (card && confirm(`確定要刪除「${card.cardName}」嗎？`)) deleteCard(id)
  }))
  app.querySelectorAll('[data-regenerate-result]').forEach((el) => el.addEventListener('click', () => {
    const item = state.current.generatedReadings.find((r) => r.id === el.dataset.regenerateResult)
    if (!item?.payloadSnapshot) return
    generateAI({ payload: structuredClone(item.payloadSnapshot), targetResultId: item.id })
  }))
  app.querySelectorAll('[data-remove-result]').forEach((el) => el.addEventListener('click', () => {
    const item = state.current.generatedReadings.find((r) => r.id === el.dataset.removeResult)
    const cardName = item?.payloadSnapshot?.cards?.[0]?.name || '這張牌'
    if (item && confirm(`確定要移除「${cardName}」與對應結果嗎？`)) deleteGeneratedResult(item.id)
  }))
}

function renderHeaderOnly() {
  const meta = app.querySelector('#headerMeta')
  if (!meta) return
  meta.textContent = state.current.customerName ? `目前諮詢：${state.current.customerName}` : ''
}

function renderResultCards() {
  if (!state.current.generatedReadings.length) {
    return '<div class="helper">尚未產生解牌。每次按下「產生解牌」會依目前抽出的每一張牌，分別新增一筆獨立結果；之後也可以只針對單筆重新生成。</div>'
  }

  return state.current.generatedReadings.map((item, index) => `
    <article class="generated-result-card" id="result-${item.id}">
      <div class="row result-card-head">
        <div>
          <div class="card-meta">${item.title || `第 ${index + 1} 次解牌`}・${new Date(item.updatedAt || item.createdAt || Date.now()).toLocaleString('zh-TW', { hour12: false })}</div>
          <div class="result-card-summary tarot-card-title">${item.payloadSnapshot?.cards?.map((c) => c.name).join('、') || '—'}</div>
        </div>
        <div class="row result-card-actions">
          <button class="button btn-gold" type="button" data-regenerate-result="${item.id}" ${item.isLoading || state.current.isGenerating ? 'disabled' : ''}>${item.isLoading ? '占卜中…' : '重新生成'}</button>
          <button class="button btn-danger" type="button" data-remove-result="${item.id}" ${item.isLoading || state.current.isGenerating ? 'disabled' : ''}>移除此牌</button>
        </div>
      </div>
      <div class="divider"></div>
      <div class="ai-result">${item.errorMessage ? `<span class="error-text">${item.errorMessage}</span>` : item.aiResult || '<span class="helper">尚未生成內容</span>'}</div>
    </article>
  `).join('')
}

function render() {
  const cardsHtml = state.current.drawnCards.length === 0 ? `
    <div class="empty">
      <div style="font-size:34px; margin-bottom:8px;">🃏</div>
      <div>尚未加入任何牌卡</div>
      <div class="helper" style="margin-top:4px;">點擊「新增抽牌」開始記錄</div>
    </div>` : state.current.drawnCards
      .sort((a, b) => a.cardOrder - b.cardOrder)
      .map((card, idx) => {
        const positionLabel = card.position === '其他' ? (card.customPosition || '自訂牌位') : card.position
        return `<div class="card-item"><div class="card-top"><div class="card-content"><div class="card-meta">第 ${idx + 1} 張・${positionLabel}</div><div class="card-name">${card.cardName}</div><div class="card-meta">${state.current.useReversal ? (card.isReversed ? '逆位' : '正位') : '未啟用正逆位'}</div></div><div class="row card-action-group"><button class="button btn-outline" data-edit-card="${card.id}">編輯</button><button class="button btn-danger" data-delete-card="${card.id}">刪除</button></div></div></div>`
      }).join('')

  app.innerHTML = `
    <header class="header">
      <div class="container header-inner main-header-inner">
        <div class="brand brand-center-mobile">
          <h1>🔮 塔羅解牌系統</h1>
          <small id="headerMeta">${state.current.customerName ? `目前諮詢：${state.current.customerName}` : ''}</small>
        </div>
        <div class="row header-button-group center-mobile-buttons">
          <a class="button btn-outline header-compact-btn" href="./history.html">📋 歷史紀錄</a>
          <button class="button btn-outline header-compact-btn" id="helpBtn" type="button">ℹ️ 使用說明</button>
          ${state.current.isStarted ? '<button class="button btn-outline header-compact-btn" id="nextBtn">👤 下一位客戶</button>' : ''}
        </div>
      </div>
    </header>
    <main class="main container">
      <section class="panel panel-gold">
        <h2 class="section-title">✦ 客戶基本資料</h2>
        <div class="divider"></div>
        <div class="grid">
          <div class="full"><label class="label">客戶姓名 *</label><input class="input" id="customerName" value="${state.current.customerName}" placeholder="輸入客戶姓名..." ${state.current.isStarted ? 'disabled' : ''}></div>
          <div><label class="label">問題類型</label><select class="select" id="questionType">${QUESTION_TYPES.map((t) => `<option value="${t}" ${state.current.questionType === t ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
          ${state.current.questionType === '其他' ? `<div><label class="label">自訂類型</label><input class="input" id="customQuestionType" value="${state.current.customQuestionType || ''}" placeholder="請輸入問題類型..."></div>` : '<div></div>'}
          <div class="full"><label class="label">客戶提問內容 *</label><textarea class="textarea" id="questionContent" placeholder="輸入客戶的具體問題或想了解的方向...">${state.current.questionContent || ''}</textarea></div>
          <div class="full"><div class="row"><button class="toggle ${state.current.useReversal ? 'active' : ''}" id="useReversal" type="button"></button><div><div>加入正逆位評估</div></div></div></div>
        </div>
        ${state.current.isStarted ? '' : `<div style="margin-top:18px;"><button class="button btn-gold" id="startBtn" ${state.current.customerName.trim() ? '' : 'disabled'}>✦ 開始諮詢紀錄</button></div>`}
      </section>

      <section class="panel" style="margin-top:20px;">
        <div class="row section-head-wrap">
          <h2 class="section-title">✦ 抽牌紀錄 ${state.current.drawnCards.length ? `<span class="badge">${state.current.drawnCards.length} 張</span>` : ''}</h2>
          <button class="button btn-outline" id="addCardBtn" ${state.current.drawnCards.length >= 78 ? 'disabled' : ''}>＋ 新增抽牌</button>
        </div>
        <div class="divider"></div>
        <div class="cards">${cardsHtml}</div>
      </section>

      <section style="margin-top:20px;">
        <div class="row action-row-wrap">
          <button class="button btn-gold" id="generateBtn" ${state.current.drawnCards.length === 0 || !state.current.questionContent.trim() || state.current.isGenerating ? 'disabled' : ''}>${state.current.isGenerating ? '🔮 占卜中…' : '🔮 產生新的獨立解牌'}</button>
          <button class="button btn-outline" id="saveBtn" ${state.current.customerName.trim() ? '' : 'disabled'}>💾 儲存本機紀錄</button>
        </div>
        ${state.current.drawnCards.length === 0 ? '<div class="helper" style="margin-top:8px;">* 請先加入至少一張牌卡才能產生解牌</div>' : '<div class="helper" style="margin-top:8px;">每按一次都會依目前抽出的每張牌，分別新增一筆獨立結果；之後的重新生成也只會作用在指定的那一筆。</div>'}
      </section>

      <section id="ai-result" class="panel panel-gold" style="margin-top:20px;">
        <h2 class="section-title">✦ 解牌結果</h2>
        <div class="divider"></div>
        <div class="generated-results">${renderResultCards()}</div>
      </section>
    </main>
  `

  bindInputs()
}

render()
