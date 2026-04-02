import { loadState, deleteHistoryItem, clearHistory } from './storage.js'
import { supabase } from './supabase-client.js'

const root = document.querySelector('#history-app')
const state = loadState()
let remoteReadings = []
let keyword = ''
let isComposing = false
let shouldRefocusSearch = false
let searchSelectionStart = null
let searchSelectionEnd = null
let isLocalSectionExpanded = false
const expandedRemoteIds = new Set()
const expandedLocalIds = new Set()

function normalizeCard(card = {}) {
  return {
    name: card.name || '',
    position: card.position || card.raw_position || card.custom_position || '',
    reversed: !!card.reversed,
  }
}

function getReadingSignature(row = {}) {
  const cards = (row.cards || []).map(normalizeCard)
  return JSON.stringify({
    spread_type: row.spread_type || '',
    question_type: row.question_type || '',
    question: row.question || '',
    cards,
  })
}

function formatDate(dateString) {
  if (!dateString) return '—'
  return new Date(dateString).toLocaleString('zh-TW', { hour12: false })
}

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function readingToSearchText(item, isLocal = false) {
  if (isLocal) {
    const generatedTexts = (item.generatedReadings || []).map((g) => [g.aiResult, g.payloadSnapshot?.cards?.map((c) => c.name).join(' ')].filter(Boolean).join(' ')).join(' ')
    const aggregateText = [item.aggregateSummary?.result, item.aggregateSummary?.cardsSnapshot?.map((c) => c.name).join(' ')].filter(Boolean).join(' ')
    const cards = (item.drawnCards || []).map((c) => `${c.cardName} ${c.position || ''} ${c.customPosition || ''}`).join(' ')
    return [item.customerName, item.questionType, item.questionContent, item.aiResult, generatedTexts, aggregateText, cards, formatDate(item.updatedAt)].filter(Boolean).join(' ').toLowerCase()
  }
  const cards = (item.cards || []).map((c) => `${c.name} ${c.position || ''} ${c.raw_position || ''} ${c.custom_position || ''}`).join(' ')
  const results = (item.readings || []).map((r) => [r.ai_result || '', r.question || '', r.question_type || '', r.spread_type || '', formatDate(r.created_at), formatDate(r.updated_at)].join(' ')).join(' ')
  return [item.client_name, item.question_type, item.question, item.spread_type, results || item.ai_result, cards, formatDate(item.created_at), formatDate(item.latest_at)].filter(Boolean).join(' ').toLowerCase()
}

function filterReadings(list, isLocal = false) {
  const query = keyword.trim().toLowerCase()
  if (!query) return list
  return list.filter((item) => readingToSearchText(item, isLocal).includes(query))
}

function buildRemoteGroups(rows = []) {
  const map = new Map()
  rows.forEach((row) => {
    const key = row.client_name || '未命名客戶'
    if (!map.has(key)) {
      map.set(key, {
        id: key,
        client_name: row.client_name,
        created_at: row.created_at,
        latest_at: row.updated_at || row.created_at,
        readingsMap: new Map(),
        allCards: new Map(),
      })
    }
    const group = map.get(key)
    const signature = getReadingSignature(row)
    const existing = group.readingsMap.get(signature)
    const currentTime = new Date(row.updated_at || row.created_at || 0).getTime()
    const existingTime = existing ? new Date(existing.updated_at || existing.created_at || 0).getTime() : -1

    if (!existing || currentTime >= existingTime) {
      group.readingsMap.set(signature, row)
    }

    ;(row.cards || []).forEach((card = {}) => {
      const label = `${card.name || ''}${card.reversed ? '（逆位）' : ''}`
      if (label.trim()) group.allCards.set(label, label)
    })

    if (!group.created_at || new Date(row.created_at) < new Date(group.created_at)) group.created_at = row.created_at
    if (!group.latest_at || new Date(row.updated_at || row.created_at) > new Date(group.latest_at)) group.latest_at = row.updated_at || row.created_at
  })

  return Array.from(map.values())
    .map((group) => {
      const readings = Array.from(group.readingsMap.values())
        .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
      return {
        id: group.id,
        client_name: group.client_name,
        created_at: group.created_at,
        latest_at: group.latest_at,
        cards: Array.from(group.allCards.values()),
        readings,
      }
    })
    .sort((a, b) => new Date(b.latest_at) - new Date(a.latest_at))
}

async function loadRemoteReadings() {
  const { data, error } = await supabase
    .from('readings')
.select('id, client_name, question, question_type, spread_type, cards, ai_result, created_at, updated_at')
    .order('created_at', { ascending: false })

  if (error) {
    console.error(error)
    remoteReadings = []
    return
  }
  remoteReadings = buildRemoteGroups(data || [])
}

async function deleteRemote(id) {
  const target = remoteReadings.find((item) => item.id === id)
  const ids = target?.readings?.map((item) => item.id) || []
  if (!ids.length) return
  if (!confirm(`確定要刪除「${target?.client_name || '此客戶'}」的雲端紀錄嗎？`)) return
  const { error } = await supabase.from('readings').delete().in('id', ids)
  if (error) return alert(`刪除失敗：${error.message}`)
  await loadRemoteReadings()
  render()
}

function renderSearchBar() {
  return `
    <a class="button btn-ghost back-home-btn" href="./index.html">← 返回主頁</a>
    <section class="panel panel-gold history-tools-panel history-search-section">
      <div class="history-tools-grid">
        <div class="history-search-wrap">
          <h2 class="section-title">✦ 搜尋紀錄</h2>
          <div class="divider"></div>
          <label class="label">關鍵字篩選</label>
          <input class="input" id="keywordSearch" placeholder="可搜尋客戶姓名、問題內容、牌名、解牌文字、建立時間..." value="${escapeHtml(keyword)}">
          <div class="helper" style="margin-top:8px;">目前會同時篩選雲端紀錄與本機備份紀錄，也可搜尋建立／更新時間。</div>
        </div>
        <div class="history-tools-actions">
          <button class="button btn-danger" id="clearAllBtn" ${state.history.length ? '' : 'disabled'}>清空本機資料</button>
        </div>
      </div>
    </section>
  `
}

function renderResultToggle(content, expanded, targetType, targetId, label = '解牌結果') {
  return `
    <div class="result-toggle-block">
      <button class="button btn-outline result-toggle-btn" type="button" data-toggle-result-type="${targetType}" data-toggle-result-id="${targetId}">${expanded ? '收合' : '展開'}${label}</button>
      ${expanded ? `<div class="result-content-box history-record-list">${content}</div>` : ''}
    </div>
  `
}

function render() {
  const filteredRemote = filterReadings(remoteReadings, false)
  const filteredLocal = filterReadings(state.history, true)

  root.innerHTML = `
    <header class="header">
      <div class="container header-inner history-header-inner">
        <div class="brand brand-center-mobile">
          <h1>📋 歷史紀錄</h1>
          <small>可用關鍵字快速篩選雲端資料與本機備份。</small>
        </div>
      </div>
    </header>
    <main class="main container">
      ${renderSearchBar()}
      <section class="panel panel-gold" style="margin-bottom:20px;">
        <h2 class="section-title">✦ 雲端紀錄</h2>
        <div class="divider"></div>
        ${remoteReadings.length === 0 ? `<div class="empty"><div style="font-size:30px;">☁️</div><div>目前沒有任何雲端紀錄</div></div>` : filteredRemote.length === 0 ? `<div class="empty"><div style="font-size:30px;">🔎</div><div>找不到符合關鍵字的雲端紀錄</div></div>` : `
          <div class="history-list">
            ${filteredRemote.map((item) => {
              const expanded = expandedRemoteIds.has(item.id)
              return `
              <article class="history-item">
                <div class="row history-item-head">
                  <div>
                    <h3>${escapeHtml(item.client_name || '未命名客戶')}</h3>
                    <div class="helper">最近建立：${formatDate(item.created_at)}</div>
                  </div>
                </div>
                <div class="divider"></div>
                <button class="button btn-danger history-delete-btn" data-delete-remote="${item.id}">刪除</button>
                <div class="kv" style="margin-top:12px;">
                  <div class="helper">紀錄筆數</div><div>${item.readings?.length || 0} 筆</div>
                  <div class="helper">所有牌張</div><div>${escapeHtml((item.cards || []).map((c) => `${c.name}${c.reversed ? '（逆位）' : ''}`).join('、') || '—')}</div>
                </div>
                ${renderResultToggle((item.readings || []).map((reading, idx) => `<div class="history-record"><div class="history-record-meta"><div><strong>第 ${idx + 1} 筆</strong>　<span class="helper">${formatDate(reading.updated_at || reading.created_at)}</span></div><div><span class="helper">問題類型</span>：${escapeHtml(reading.question_type || '—')}</div><div><span class="helper">紀錄類型</span>：${escapeHtml(reading.spread_type || '一般解牌')}</div><div><span class="helper">提問內容</span>：${escapeHtml(reading.question || '—')}</div><div><span class="helper">抽到的牌</span>：${escapeHtml((reading.cards || []).map((c) => `${c.name}${c.reversed ? '（逆位）' : ''}`).join('、') || '—')}</div><div>${escapeHtml(reading.ai_result || '尚未生成').replace(/\n/g, '<br>')}</div></div></div>`).join(''), expanded, 'remote', item.id)}
              </article>`
            }).join('')}
          </div>`}
      </section>

      <section class="panel panel-gold">
        <div class="row" style="justify-content: space-between; align-items: center; gap: 12px;">
          <h2 class="section-title">✦ 本機備份紀錄</h2>
          <button class="button btn-outline history-section-toggle" id="toggleLocalSectionBtn" type="button">${isLocalSectionExpanded ? '收合本機資料' : '展開本機資料'}</button>
        </div>
        <div class="divider"></div>
        ${!isLocalSectionExpanded ? `<div class="helper">本機資料預設隱藏，點擊上方按鈕即可展開查看。</div>` : state.history.length === 0 ? `<div class="empty"><div style="font-size:30px;">🗂️</div><div>目前沒有任何本機紀錄</div></div>` : filteredLocal.length === 0 ? `<div class="empty"><div style="font-size:30px;">🔎</div><div>找不到符合關鍵字的本機紀錄</div></div>` : `
          <div class="history-list">
            ${filteredLocal.map((item) => {
              const expanded = expandedLocalIds.has(item.id)
              const generatedTexts = (item.generatedReadings || []).length
                ? item.generatedReadings.map((g, index) => `<div style="margin-bottom:12px;"><strong>第 ${index + 1} 筆：</strong><br>${escapeHtml(g.aiResult || '尚未生成').replace(/\n/g, '<br>')}</div>`).join('')
                : escapeHtml(item.aiResult || '尚未生成').replace(/\n/g, '<br>')
              return `
              <article class="history-item">
                <div class="row history-item-head">
                  <div>
                    <h3>${escapeHtml(item.customerName || '未命名客戶')}</h3>
                    <div class="helper">更新時間：${formatDate(item.updatedAt)}</div>
                  </div>
                </div>
                <div class="divider"></div>
                <button class="button btn-danger history-delete-btn" data-delete-local="${item.id}">刪除</button>
                <div class="kv">
                  <div class="helper">問題類型</div><div>${escapeHtml(item.questionType || '—')}</div>
                  <div class="helper">提問內容</div><div>${escapeHtml(item.questionContent || '—')}</div>
                  <div class="helper">抽牌張數</div><div>${item.drawnCards?.length || 0} 張</div>
                  <div class="helper">抽到的牌</div><div>${escapeHtml((item.drawnCards || []).map((c) => `${c.cardName}${c.isReversed ? '（逆位）' : ''}`).join('、') || '—')}</div>
                </div>
                ${renderResultToggle(generatedTexts + aggregateBlock, expanded, 'local', item.id)}
              </article>`
            }).join('')}
          </div>`}
      </section>
    </main>
  `

  const searchInput = root.querySelector('#keywordSearch')
  if (searchInput) {
    if (shouldRefocusSearch) {
      searchInput.focus()
      const pos = searchSelectionEnd ?? keyword.length
      searchInput.setSelectionRange(pos, pos)
      shouldRefocusSearch = false
    }
    searchInput.addEventListener('compositionstart', () => { isComposing = true })
    searchInput.addEventListener('compositionend', (e) => {
      isComposing = false
      keyword = e.target.value
      searchSelectionEnd = e.target.selectionStart
      shouldRefocusSearch = true
      render()
    })
    searchInput.addEventListener('input', (e) => {
      if (isComposing) return
      keyword = e.target.value
      searchSelectionEnd = e.target.selectionStart
      shouldRefocusSearch = true
      render()
    })
  }

  root.querySelector('#toggleLocalSectionBtn')?.addEventListener('click', () => {
    isLocalSectionExpanded = !isLocalSectionExpanded
    render()
  })

  root.querySelector('#clearAllBtn')?.addEventListener('click', () => {
    if (!confirm('確定要清空全部本機紀錄嗎？')) return
    clearHistory(state)
    render()
  })
  root.querySelectorAll('[data-delete-local]').forEach((el) => el.addEventListener('click', () => {
    const id = el.dataset.deleteLocal
    if (!confirm('確定要刪除這筆本機紀錄嗎？')) return
    deleteHistoryItem(state, id)
    render()
  }))
  root.querySelectorAll('[data-delete-remote]').forEach((el) => el.addEventListener('click', () => deleteRemote(el.dataset.deleteRemote)))
  root.querySelectorAll('[data-toggle-result-id]').forEach((el) => el.addEventListener('click', () => {
    const type = el.dataset.toggleResultType
    const id = el.dataset.toggleResultId
    const targetSet = type === 'remote' ? expandedRemoteIds : expandedLocalIds
    if (targetSet.has(id)) targetSet.delete(id)
    else targetSet.add(id)
    render()
  }))
}

await loadRemoteReadings()
render()
