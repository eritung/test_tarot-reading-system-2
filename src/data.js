export const MAJOR_ARCANA = [
  '愚者', '魔術師', '女祭司', '女皇', '皇帝', '教皇', '戀人', '戰車', '力量', '隱士',
  '命運之輪', '正義', '倒吊人', '死神', '節制', '惡魔', '高塔', '星星', '月亮', '太陽', '審判', '世界'
]

export const SUITS = ['權杖', '聖杯', '寶劍', '金幣']
const RANKS = ['王牌', '二', '三', '四', '五', '六', '七', '八', '九', '十', '侍者', '騎士', '王后', '國王']

export const MINOR_ARCANA = {
  權杖: RANKS.map((r) => `權杖${r}`),
  聖杯: RANKS.map((r) => `聖杯${r}`),
  寶劍: RANKS.map((r) => `寶劍${r}`),
  金幣: RANKS.map((r) => `金幣${r}`),
}

export const ALL_CARDS = [...MAJOR_ARCANA, ...Object.values(MINOR_ARCANA).flat()]
export const QUESTION_TYPES = ['工作運', '財運', '感情運', '其他']
export const CARD_POSITIONS = ['過去', '現在', '未來', '問者的想法', '對方的想法', '其他']

export function inferCardTheme(cardName) {
  if (cardName.includes('權杖')) return '行動、企圖心、推進力'
  if (cardName.includes('聖杯')) return '情緒、關係、內在感受'
  if (cardName.includes('寶劍')) return '理性、壓力、判斷'
  if (cardName.includes('金幣')) return '資源、現實、物質基礎'
  const map = {
    愚者: '新的開端與未知',
    魔術師: '主動創造與掌握',
    女祭司: '直覺、保留與內在聲音',
    女皇: '滋養、吸引力與豐盛',
    皇帝: '秩序、界線與主導權',
    戀人: '選擇、關係與價值對齊',
    戰車: '推進、勝負與控制力',
    力量: '穩定、自制與溫柔的力量',
    隱士: '沉澱、觀察與獨處整理',
    死神: '結束與轉化',
    節制: '整合、修復與平衡',
    惡魔: '執念、綑綁與慾望',
    高塔: '突發變動與真相揭露',
    星星: '希望、修復與願景',
    月亮: '不安、模糊與潛意識',
    太陽: '清晰、肯定與能量回升',
    審判: '覺醒、召喚與重新評估',
    世界: '完成、整合與新循環',
  }
  return map[cardName] ?? '關鍵課題與提醒'
}
