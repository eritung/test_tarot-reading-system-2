import { inferCardTheme } from './data.js'

export function generateMockReading(session) {
  const questionType = session.questionType === '其他' ? (session.customQuestionType || '綜合議題') : session.questionType
  const cards = [...session.drawnCards].sort((a, b) => a.cardOrder - b.cardOrder)
  const cardSummary = cards.map((card) => {
    const position = card.position === '其他' ? (card.customPosition || '自訂牌位') : card.position
    const rev = session.useReversal && card.isReversed ? '（逆位）' : '（正位）'
    return `【${position}】${card.cardName}${rev}：${inferCardTheme(card.cardName)}`
  }).join('\n')

  const overallTone = cards.some((c) => c.isReversed)
    ? '眼前議題並不是沒有機會，而是需要先處理卡住的情緒、誤解或節奏失衡。'
    : '整體能量偏向可推進，只要抓對節奏，事情有機會逐步明朗。'

  const first = cards[0]
  const final = cards[cards.length - 1]
  const actionLine = final
    ? `最後落點在「${final.cardName}」，代表真正關鍵不是急著求答案，而是把焦點放回你能主動調整的選擇。`
    : '此題的核心提醒，是回到你自己真正想要的是什麼。'

  return `## 問題整理\n${session.customerName || '此位個案'}目前想釐清的是「${questionType}」，問題核心為：${session.questionContent || '尚未填寫'}。\n\n## 牌面觀察\n${cardSummary}\n\n## 綜合解讀\n${overallTone} 目前這組牌顯示，事件的表面看似在問結果，但更深一層其實在處理安全感、選擇成本，以及對未來的不確定感。第一張牌「${first?.cardName || '—'}」點出你當下的心理入口，說明你其實已經感受到某種訊號，只是還在衡量要不要真正面對。\n\n## 行動建議\n${actionLine} 建議你先做一個小範圍、低風險的測試，不要一次把所有情緒和期待 all in。把時間、界線、優先順序先排好，答案會比你現在想像得更快浮出來。\n\n## 補充提醒\n此版本為靜態展示版，解牌內容為模擬生成，用於預覽流程與版型；正式上線時再串接 OpenAI 或 Gemini 即可。`
}
