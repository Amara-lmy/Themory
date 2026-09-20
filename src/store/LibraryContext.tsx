import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { Category, Note, NoteType, Paper, PaperCustomField, Tag, UserProfile } from '../types'
import { DEFAULT_SECTION_TITLES } from '../types'
import { now, stripHtml, uid } from '../lib/utils'
import { api } from '../lib/api'
import { formatCitation } from '../lib/citation'
import { useAuth } from './AuthContext'
import { useSettings } from './SettingsContext'

const POINTS = {
  importPaper: 10,
  createNote: 15,
  completeStructured: 20,
  addTag: 2,
  favorite: 2,
}

interface LibraryContextValue {
  // data
  papers: Paper[]
  notes: Note[]
  categories: Category[]
  tags: Tag[]
  profile: UserProfile
  loading: boolean
  // papers
  addPaper: (p: { fileName: string; fileKey: string; title?: string }) => Paper
  uploadPaper: (file: File, title?: string) => Promise<Paper | null>
  importFromUrl: (url: string) => Promise<{ paper?: Paper; error?: string }>
  updatePaper: (id: string, patch: Partial<Paper>) => void
  deletePaper: (id: string) => void
  toggleFavorite: (id: string) => void
  getPaper: (id: string) => Paper | undefined
  // categories
  addCategory: (name: string) => Category
  deleteCategory: (id: string) => void
  togglePaperCategory: (paperId: string, catId: string) => void
  assignPaperCategory: (paperId: string, catId: string) => boolean
  // tags
  addTag: (name: string) => Tag
  deleteTag: (id: string) => void
  addPaperTag: (paperId: string, name: string) => void
  removePaperTag: (paperId: string, name: string) => void
  applyTagToCategory: (catId: string, tagName: string) => number
  // custom fields
  addCustomField: (paperId: string, label: string) => void
  updateCustomField: (paperId: string, fieldId: string, patch: Partial<Omit<PaperCustomField, 'id'>>) => void
  removeCustomField: (paperId: string, fieldId: string) => void
  // notes
  getNote: (paperId: string, type: NoteType) => Note | undefined
  createNote: (paperId: string, type: NoteType) => Note
  saveNote: (id: string, content: string) => void
  // profile
  updateProfileName: (name: string) => void
}

const LibraryContext = createContext<LibraryContextValue | null>(null)

function defaultStructuredContent(): string {
  return JSON.stringify(
    DEFAULT_SECTION_TITLES.map((title) => ({ id: uid(), title, html: '' })),
  )
}

function defaultProfile(): UserProfile {
  return { name: '研究者', points: 0, awarded: { structuredComplete: [], favorite: [] } }
}

/** 将后端返回的数据格式化为前端 Paper 类型 */
function normalizePaper(p: any): Paper {
  return {
    id: p.id,
    title: p.title || '',
    authors: p.authors || '',
    venue: p.venue || '',
    year: p.year || '',
    abstract: p.abstract || '',
    citation: p.citation || '',
    doi: p.doi || '',
    url: p.url || '',
    fileName: p.fileName || '',
    fileKey: p.fileKey || '',
    tags: Array.isArray(p.tags) ? p.tags : [],
    categories: Array.isArray(p.categories) ? p.categories : [],
    customFields: Array.isArray(p.customFields) ? p.customFields : [],
    favorite: !!p.favorite,
    lastReadPage: p.lastReadPage || 1,
    createdAt: typeof p.createdAt === 'number' ? p.createdAt : new Date(p.createdAt).getTime(),
    updatedAt: typeof p.updatedAt === 'number' ? p.updatedAt : new Date(p.updatedAt).getTime(),
  }
}

function normalizeNote(n: any): Note {
  return {
    id: n.id,
    paperId: n.paperId,
    type: n.type as NoteType,
    content: n.content || '',
    createdAt: typeof n.createdAt === 'number' ? n.createdAt : new Date(n.createdAt).getTime(),
    updatedAt: typeof n.updatedAt === 'number' ? n.updatedAt : new Date(n.updatedAt).getTime(),
  }
}

function normalizeCategory(c: any): Category {
  return {
    id: c.id,
    name: c.name,
    createdAt: typeof c.createdAt === 'number' ? c.createdAt : new Date(c.createdAt).getTime(),
  }
}

function normalizeTag(t: any): Tag {
  return {
    id: t.id,
    name: t.name,
    createdAt: typeof t.createdAt === 'number' ? t.createdAt : new Date(t.createdAt).getTime(),
  }
}

export function LibraryProvider({ children }: { children: ReactNode }) {
  const { user: authUser, refreshUser } = useAuth()
  const { settings } = useSettings()
  const [papers, setPapers] = useState<Paper[]>([])
  const [notes, setNotes] = useState<Note[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [profile, setProfile] = useState<UserProfile>(defaultProfile())
  const [loading, setLoading] = useState(false)

  // 标记是否使用本地模式（无后端时降级）
  const useLocalModeRef = useRef(false)

  /** 从后端加载全部数据 */
  const loadAll = useCallback(async () => {
    if (!authUser) return
    setLoading(true)
    try {
      const [paperRes, catRes, tagRes, profileRes] = await Promise.all([
        api.get<any[]>('/api/papers'),
        api.get<any[]>('/api/categories'),
        api.get<any[]>('/api/tags'),
        api.get<any>('/api/profile'),
      ])

      if (paperRes.code === 'OK') {
        setPapers((paperRes.data || []).map(normalizePaper))
      }
      if (catRes.code === 'OK') {
        setCategories((catRes.data || []).map(normalizeCategory))
      }
      if (tagRes.code === 'OK') {
        setTags((tagRes.data || []).map(normalizeTag))
      }
      if (profileRes.code === 'OK' && profileRes.data) {
        setProfile({
          name: profileRes.data.nickname || '研究者',
          points: profileRes.data.points || 0,
          awarded: { structuredComplete: [], favorite: [] },
        })
      }
      useLocalModeRef.current = false
    } catch (e) {
      console.warn('[Library] 后端加载失败，降级为本地模式', e)
      useLocalModeRef.current = true
    } finally {
      setLoading(false)
    }
  }, [authUser])

  // 用户变化时加载数据
  useEffect(() => {
    loadAll()
  }, [loadAll])

  // 数据更新辅助
  const award = useCallback((delta: number) => {
    setProfile((prev) => ({ ...prev, points: prev.points + delta }))
  }, [])

  // ---------- papers ----------
  const addPaper = useCallback((p: { fileName: string; fileKey: string; title?: string }) => {
    // 本地模式兜底
    const paper: Paper = {
      id: uid(),
      title: p.title || p.fileName.replace(/\.pdf$/i, ''),
      authors: '',
      venue: '',
      year: '',
      abstract: '',
      citation: '',
      doi: '',
      url: '',
      fileName: p.fileName,
      fileKey: p.fileKey,
      tags: [],
      categories: [],
      customFields: [],
      favorite: false,
      lastReadPage: 1,
      createdAt: now(),
      updatedAt: now(),
    }
    setPapers((prev) => [paper, ...prev])
    award(POINTS.importPaper)
    return paper
  }, [award])

  /**
   * 导入后按用户偏好的引文格式自动填充引文（仅当引文为空时）。
   * 用户已手动填写的引文不覆盖；双击编辑功能不受影响。
   */
  const ensureCitation = useCallback(
    (paper: Paper): Paper => {
      if (paper.citation || !paper.title) return paper
      const cit = formatCitation(paper, settings.citationStyle)
      if (!cit) return paper
      if (!useLocalModeRef.current) {
        api.put(`/api/papers/${paper.id}`, { citation: cit }).catch(() => {})
      }
      return { ...paper, citation: cit }
    },
    [settings.citationStyle],
  )

  const uploadPaper = useCallback(async (file: File, title?: string): Promise<Paper | null> => {
    if (!authUser) return null
    try {
      const fd = new FormData()
      fd.append('file', file)
      if (title) fd.append('title', title)
      const res = await api.upload<any>('/api/papers/upload', fd)
      if (res.code === 'OK' && res.data) {
        const paper = ensureCitation(normalizePaper(res.data))
        setPapers((prev) => [paper, ...prev])
        await refreshUser()
        return paper
      }
    } catch (e) {
      console.warn('[Library] 上传失败，使用本地模式', e)
    }
    // 降级：本地模式
    return addPaper({ fileName: file.name, fileKey: title || file.name, title })
  }, [authUser, refreshUser, addPaper, ensureCitation])

  const importFromUrl = useCallback(
    async (url: string): Promise<{ paper?: Paper; error?: string }> => {
      if (!authUser) return { error: '请先登录' }
      try {
        const res = await api.post<any>('/api/papers/import-url', { url })
        if (res.code === 'OK' && res.data) {
          const paper = ensureCitation(normalizePaper(res.data))
          setPapers((prev) => [paper, ...prev])
          await refreshUser()
          return { paper }
        }
        return { error: res.message || '识别失败' }
      } catch {
        return { error: '网络错误，请稍后再试' }
      }
    },
    [authUser, refreshUser, ensureCitation],
  )

  const updatePaper = useCallback((id: string, patch: Partial<Paper>) => {
    setPapers((prev) =>
      prev.map((p) => (p.id === id ? { ...p, ...patch, updatedAt: now() } : p)),
    )
    // 同步后端（忽略失败）
    if (!useLocalModeRef.current) {
      api.put(`/api/papers/${id}`, patch).catch(() => {})
    }
  }, [])

  const deletePaper = useCallback((id: string) => {
    setPapers((prev) => prev.filter((p) => p.id !== id))
    setNotes((prev) => prev.filter((n) => n.paperId !== id))
    if (!useLocalModeRef.current) {
      api.delete(`/api/papers/${id}`).catch(() => {})
    }
  }, [])

  const toggleFavorite = useCallback((id: string) => {
    setPapers((prev) => prev.map((p) => (p.id === id ? { ...p, favorite: !p.favorite } : p)))
    if (!useLocalModeRef.current) {
      api.patch(`/api/papers/${id}/favorite`).catch(() => {})
    }
  }, [])

  const getPaper = useCallback((id: string) => papers.find((p) => p.id === id), [papers])

  // ---------- categories ----------
  const addCategory = useCallback((name: string) => {
    const cat: Category = { id: uid(), name, createdAt: now() }
    setCategories((prev) => [...prev, cat])
    if (!useLocalModeRef.current) {
      api.post(`/api/categories`, { name }).catch(() => {})
    }
    return cat
  }, [])

  const deleteCategory = useCallback((id: string) => {
    setCategories((prev) => prev.filter((c) => c.id !== id))
    setPapers((prev) =>
      prev.map((p) => ({ ...p, categories: p.categories.filter((c) => c !== id) })),
    )
    if (!useLocalModeRef.current) {
      api.delete(`/api/categories/${id}`).catch(() => {})
    }
  }, [])

  const togglePaperCategory = useCallback((paperId: string, catId: string) => {
    setPapers((prev) =>
      prev.map((p) => {
        if (p.id !== paperId) return p
        const has = p.categories.includes(catId)
        return {
          ...p,
          categories: has ? p.categories.filter((c) => c !== catId) : [...p.categories, catId],
          updatedAt: now(),
        }
      }),
    )
    if (!useLocalModeRef.current) {
      const p = papers.find((x) => x.id === paperId)
      if (p?.categories.includes(catId)) {
        api.delete(`/api/papers/${paperId}/categories/${catId}`).catch(() => {})
      } else {
        api.post(`/api/papers/${paperId}/categories`, { categoryId: catId }).catch(() => {})
      }
    }
  }, [papers])

  const assignPaperCategory = useCallback((paperId: string, catId: string): boolean => {
    const target = papers.find((p) => p.id === paperId)
    if (!target || target.categories.includes(catId)) return false
    setPapers((prev) =>
      prev.map((p) =>
        p.id === paperId ? { ...p, categories: [...p.categories, catId], updatedAt: now() } : p,
      ),
    )
    if (!useLocalModeRef.current) {
      api.post(`/api/papers/${paperId}/categories`, { categoryId: catId }).catch(() => {})
    }
    return true
  }, [papers])

  // ---------- tags ----------
  const addTag = useCallback((name: string) => {
    const trimmed = name.trim().replace(/^#/, '')
    const existed = tags.find((t) => t.name.toLowerCase() === trimmed.toLowerCase())
    if (existed) return existed
    const tag: Tag = { id: uid(), name: trimmed, createdAt: now() }
    setTags((prev) => [...prev, tag])
    if (!useLocalModeRef.current) {
      api.post(`/api/tags`, { name: trimmed }).catch(() => {})
    }
    return tag
  }, [tags])

  const deleteTag = useCallback((id: string) => {
    const name = tags.find((t) => t.id === id)?.name
    setTags((prev) => prev.filter((t) => t.id !== id))
    if (name) {
      setPapers((prev) =>
        prev.map((p) => ({
          ...p,
          tags: p.tags.filter((t) => t.toLowerCase() !== name.toLowerCase()),
        })),
      )
    }
    if (!useLocalModeRef.current) {
      api.delete(`/api/tags/${id}`).catch(() => {})
    }
  }, [tags])

  const addPaperTag = useCallback((paperId: string, name: string) => {
    const trimmed = name.trim().replace(/^#/, '')
    if (!trimmed) return
    const target = papers.find((p) => p.id === paperId)
    const existed = target?.tags.some((t) => t.toLowerCase() === trimmed.toLowerCase())
    addTag(trimmed)
    if (existed) return
    setPapers((prev) =>
      prev.map((p) =>
        p.id === paperId ? { ...p, tags: [...p.tags, trimmed], updatedAt: now() } : p,
      ),
    )
    award(POINTS.addTag)
    if (!useLocalModeRef.current) {
      api.post(`/api/papers/${paperId}/tags`, { name: trimmed }).catch(() => {})
    }
  }, [addTag, award, papers])

  const removePaperTag = useCallback((paperId: string, name: string) => {
    setPapers((prev) =>
      prev.map((p) =>
        p.id === paperId
          ? { ...p, tags: p.tags.filter((t) => t !== name), updatedAt: now() }
          : p,
      ),
    )
    if (!useLocalModeRef.current) {
      // 找到 tagId
      const tag = tags.find((t) => t.name === name)
      if (tag) {
        api.delete(`/api/papers/${paperId}/tags/${tag.id}`).catch(() => {})
      }
    }
  }, [tags])

  const applyTagToCategory = useCallback((catId: string, tagName: string): number => {
    const trimmed = tagName.trim().replace(/^#/, '')
    if (!trimmed) return 0
    addTag(trimmed)
    const affected = papers.filter(
      (p) =>
        p.categories.includes(catId) &&
        !p.tags.some((t) => t.toLowerCase() === trimmed.toLowerCase()),
    )
    if (affected.length === 0) return 0
    const ids = new Set(affected.map((p) => p.id))
    setPapers((prev) =>
      prev.map((p) =>
        ids.has(p.id) ? { ...p, tags: [...p.tags, trimmed], updatedAt: now() } : p,
      ),
    )
    award(POINTS.addTag * affected.length)
    if (!useLocalModeRef.current) {
      affected.forEach((p) => {
        api.post(`/api/papers/${p.id}/tags`, { name: trimmed }).catch(() => {})
      })
    }
    return affected.length
  }, [addTag, award, papers])

  // ---------- custom fields ----------
  const addCustomField = useCallback((paperId: string, label: string) => {
    const trimmed = label.trim()
    if (!trimmed) return
    const field: PaperCustomField = { id: uid(), label: trimmed, value: '' }
    setPapers((prev) =>
      prev.map((p) =>
        p.id === paperId
          ? { ...p, customFields: [...p.customFields, field], updatedAt: now() }
          : p,
      ),
    )
    if (!useLocalModeRef.current) {
      api.post(`/api/papers/${paperId}/fields`, { label: trimmed }).catch(() => {})
    }
  }, [])

  const updateCustomField = useCallback(
    (paperId: string, fieldId: string, patch: Partial<Omit<PaperCustomField, 'id'>>) => {
      setPapers((prev) =>
        prev.map((p) =>
          p.id === paperId
            ? {
                ...p,
                customFields: p.customFields.map((f) =>
                  f.id === fieldId ? { ...f, ...patch } : f,
                ),
                updatedAt: now(),
              }
            : p,
        ),
      )
      if (!useLocalModeRef.current) {
        api.put(`/api/papers/${paperId}/fields/${fieldId}`, patch).catch(() => {})
      }
    },
    [],
  )

  const removeCustomField = useCallback((paperId: string, fieldId: string) => {
    setPapers((prev) =>
      prev.map((p) =>
        p.id === paperId
          ? { ...p, customFields: p.customFields.filter((f) => f.id !== fieldId), updatedAt: now() }
          : p,
      ),
    )
    if (!useLocalModeRef.current) {
      api.delete(`/api/papers/${paperId}/fields/${fieldId}`).catch(() => {})
    }
  }, [])

  // ---------- notes ----------
  const getNote = useCallback(
    (paperId: string, type: NoteType) => notes.find((n) => n.paperId === paperId && n.type === type),
    [notes],
  )

  const createNote = useCallback((paperId: string, type: NoteType) => {
    const note: Note = {
      id: uid(),
      paperId,
      type,
      content: type === 'structured' ? defaultStructuredContent() : '',
      createdAt: now(),
      updatedAt: now(),
    }
    setNotes((prev) => [...prev, note])
    award(POINTS.createNote)
    if (!useLocalModeRef.current) {
      api.post(`/api/papers/${paperId}/notes`, { type, content: note.content }).catch(() => {})
    }
    return note
  }, [award])

  const saveNote = useCallback((id: string, content: string) => {
    setNotes((prev) =>
      prev.map((n) => (n.id === id ? { ...n, content, updatedAt: now() } : n)),
    )
    // 完成结构化笔记奖励
    const note = notes.find((n) => n.id === id)
    if (note && note.type === 'structured') {
      try {
        const sections = JSON.parse(content) as { html?: string }[]
        const hasContent = sections.some((s) => stripHtml(s.html || '').trim().length > 0)
        if (hasContent && !profile.awarded.structuredComplete.includes(id)) {
          award(POINTS.completeStructured)
          setProfile((prev) =>
            prev.awarded.structuredComplete.includes(id)
              ? prev
              : {
                  ...prev,
                  awarded: {
                    ...prev.awarded,
                    structuredComplete: [...prev.awarded.structuredComplete, id],
                  },
                },
          )
        }
      } catch {
        /* ignore */
      }
    }
    // 同步后端
    if (!useLocalModeRef.current) {
      api.put(`/api/notes/${id}`, { content }).catch(() => {})
    }
  }, [notes, profile, award])

  // ---------- profile ----------
  const updateProfileName = useCallback((name: string) => {
    const trimmed = name.trim() || '研究者'
    setProfile((prev) => ({ ...prev, name: trimmed }))
    if (!useLocalModeRef.current) {
      api.put(`/api/profile`, { nickname: trimmed }).then(() => refreshUser()).catch(() => {})
    }
  }, [refreshUser])

  const value = useMemo<LibraryContextValue>(
    () => ({
      papers,
      notes,
      categories,
      tags,
      profile,
      loading,
      addPaper,
      uploadPaper,
      importFromUrl,
      updatePaper,
      deletePaper,
      toggleFavorite,
      getPaper,
      addCategory,
      deleteCategory,
      togglePaperCategory,
      assignPaperCategory,
      addTag,
      deleteTag,
      addPaperTag,
      removePaperTag,
      applyTagToCategory,
      addCustomField,
      updateCustomField,
      removeCustomField,
      getNote,
      createNote,
      saveNote,
      updateProfileName,
    }),
    [
      papers,
      notes,
      categories,
      tags,
      profile,
      loading,
      addPaper,
      uploadPaper,
      importFromUrl,
      updatePaper,
      deletePaper,
      toggleFavorite,
      getPaper,
      addCategory,
      deleteCategory,
      togglePaperCategory,
      assignPaperCategory,
      addTag,
      deleteTag,
      addPaperTag,
      removePaperTag,
      applyTagToCategory,
      addCustomField,
      updateCustomField,
      removeCustomField,
      getNote,
      createNote,
      saveNote,
      updateProfileName,
    ],
  )

  return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>
}

export function useLibrary(): LibraryContextValue {
  const ctx = useContext(LibraryContext)
  if (!ctx) throw new Error('useLibrary 必须在 LibraryProvider 内使用')
  return ctx
}
