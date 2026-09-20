export interface PaperCustomField {
  id: string
  label: string
  value: string
}

export interface Paper {
  id: string
  title: string
  authors: string
  venue: string
  year: string
  abstract: string
  citation: string
  doi: string
  url: string
  fileName: string
  fileKey: string // key in IndexedDB
  tags: string[] // tag names
  categories: string[] // category ids
  customFields: PaperCustomField[] // 用户自定义信息（关键词、样本量等）
  favorite: boolean
  lastReadPage: number
  createdAt: number
  updatedAt: number
}

export type NoteType = 'structured' | 'free'

export interface NoteSection {
  id: string
  title: string
  html: string
}

export interface Note {
  id: string
  paperId: string
  type: NoteType
  /** free: html string; structured: JSON.stringify(NoteSection[]) */
  content: string
  createdAt: number
  updatedAt: number
}

export interface Category {
  id: string
  name: string
  createdAt: number
}

export interface Tag {
  id: string
  name: string
  createdAt: number
}

export interface UserProfile {
  name: string
  points: number
  /** 已发过积分奖励的对象，防止重复奖励 */
  awarded: {
    /** 已发“完成结构化笔记 +20”的笔记 id */
    structuredComplete: string[]
    /** 已发“收藏 +2”的论文 id */
    favorite: string[]
  }
}

export const LEVELS: { level: number; name: string; min: number }[] = [
  { level: 1, name: '文献新手', min: 0 },
  { level: 2, name: '文献探索者', min: 100 },
  { level: 3, name: '文献研究者', min: 300 },
  { level: 4, name: '文献积累者', min: 600 },
  { level: 5, name: '学术探索者', min: 1000 },
  { level: 6, name: '研究专家', min: 1600 },
]

export const DEFAULT_SECTION_TITLES = [
  '研究目的',
  '研究问题',
  '实验设计',
  '研究方法',
  '核心发现',
  '研究局限',
  '我的理解',
  '对我的研究启示',
  '其他',
]
