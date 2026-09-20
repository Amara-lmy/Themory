/**
 * AI 能力接口层（真实后端 /api/ai/*）
 * - chat: 论文问答（后端自动读取论文全文作为上下文）
 * - fill-note: 结构化笔记章节填充（返回 HTML）
 * - translate: 划词翻译（英 → 中）
 * 保留 Mock 分支以便离线开发（USE_MOCK = true）
 */

import { api } from './api'

export interface AiChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface AiPaperContext {
  title: string
  authors?: string
  venue?: string
  year?: string
  /** 传入论文 id 时，后端读取全文作为 AI 上下文 */
  paperId?: string
}

const USE_MOCK = false

/** 真实 AI API 调用 */
async function requestAiApi(endpoint: 'chat' | 'fill-note', payload: unknown): Promise<string> {
  const res = await api.post<{ data: string }>(`/api/ai/${endpoint}`, payload)
  if (res.code === 'OK' && typeof res.data === 'string') return res.data
  throw new Error(res.message || 'AI 请求失败')
}

/** 论文问答 */
export async function chatWithAi(
  messages: AiChatMessage[],
  context: AiPaperContext,
): Promise<string> {
  if (USE_MOCK) {
    await delay(900 + Math.random() * 700)
    const lastUser = [...messages].reverse().find((m) => m.role === 'user')
    return mockChatReply(lastUser?.content ?? '', context)
  }
  return requestAiApi('chat', { messages, context, paperId: context.paperId })
}

/** 生成单个笔记章节内容（返回 HTML） */
export async function generateSection(
  sectionTitle: string,
  context: AiPaperContext,
): Promise<string> {
  if (USE_MOCK) {
    await delay(700 + Math.random() * 600)
    return mockSectionHtml(sectionTitle, context)
  }
  return requestAiApi('fill-note', { sectionTitle, context, paperId: context.paperId })
}

/** 划词翻译（英 → 中） */
export async function translateTextAi(text: string): Promise<string> {
  if (USE_MOCK) {
    await delay(600 + Math.random() * 500)
    return `【Mock 译文】${text.slice(0, 80)}… 的中文翻译。`
  }
  const res = await api.post<{ data: string }>('/api/ai/translate', { text })
  if (res.code === 'OK' && typeof res.data === 'string') return res.data
  throw new Error(res.message || '翻译失败')
}

/**
 * 图表分析（多模态）：仅此时由后端调用 qwen-vl-plus，普通问答不走视觉模型
 * @param image 前端压缩后的 data URI（image/jpeg;base64）
 */
export async function analyzeChartWithAi(params: {
  paperId?: string
  image: string
  question?: string
}): Promise<string> {
  const res = await api.post<{ data: string }>('/api/ai/analyze-chart', params)
  if (res.code === 'OK' && typeof res.data === 'string') return res.data
  throw new Error(res.message || '图表分析失败')
}

/* ================= Mock 实现 ================= */

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

function mockChatReply(question: string, ctx: AiPaperContext): string {
  const t = ctx.title || '这篇论文'
  const tail = '\n\n（Mock 回答 · 接入真实 AI 后将基于论文全文作答）'
  if (/摘要|总结|概括|讲了什么|主要内容|主旨/.test(question))
    return `《${t}》主要围绕……展开：作者提出了……方法／观点，通过……实验验证了……，最终发现……。${tail}`
  if (/方法|实验|设计|怎么做|如何/.test(question))
    return `在方法层面，该论文采用……的研究设计：首先……，随后……，最后……。实验部分设置了……对照条件，保证结论可靠。${tail}`
  if (/结论|发现|结果|贡献/.test(question))
    return `论文的核心结论有三点：1）……；2）……；3）……。其中最主要的理论贡献是……，实践启示是……。${tail}`
  if (/局限|不足|缺陷/.test(question))
    return `这篇论文的局限主要有：样本与情境的代表性有限、测量方式依赖自我报告、缺少纵向追踪数据。未来研究可以进一步……。${tail}`
  if (/启发|启示|意义|应用/.test(question))
    return `对你的启发：可以借鉴它「小而具体」的问题定义方式与对照实验设计；在实际应用中，该成果可用于……场景。${tail}`
  return `关于「${question}」，我的理解是：该论文在……方面给出了有价值的探索。你也可以继续问我研究方法、核心发现或研究局限等具体内容。${tail}`
}

function mockSectionHtml(sectionTitle: string, ctx: AiPaperContext): string {
  const t = ctx.title || '该论文'
  const M = '（Mock 数据 · 接入真实 AI 后将基于论文全文生成）'
  const map: Record<string, string> = {
    研究目的: `<p>本研究旨在探究《${t}》所关注的核心现象，明确研究动机与预期贡献，为后续研究设计与数据收集提供方向依据。${M}</p>`,
    研究问题: `<p>围绕研究目的，论文提出以下关键问题：<br>1. ……现象背后的核心影响因素是什么？<br>2. 所提出的方法／模型能否有效改善现有不足？${M}</p>`,
    实验设计: `<p>作者设计了对照实验：选取……作为被试／数据集，设置实验组与对照组，控制……等无关变量，以系统验证研究假设。${M}</p>`,
    研究方法: `<p>论文采用……方法（定量／定性／混合），通过……工具完成数据收集，并使用……方法进行分析，保证结论的信度与效度。${M}</p>`,
    核心发现: `<p>结果表明：所提出的方法在……指标上显著优于基线，说明……；同时发现……对结果具有调节作用。${M}</p>`,
    研究局限: `<p>样本范围与实验情境存在一定限制，结论的普适性有待进一步验证；未来可扩大样本、引入纵向设计加以检验。${M}</p>`,
    我的理解: `<p>我认为这篇论文最大的亮点在于……；它提醒我研究问题要小而具体，方法要与研究问题严格匹配。${M}</p>`,
    对我的研究启示: `<p>可借鉴其研究设计与变量测量方式；在此基础上，我的研究可以进一步考虑……，形成差异化贡献。${M}</p>`,
    其他: `<p>补充记录：与相关文献的联系、待查阅的参考资料、可复现的实验细节等。${M}</p>`,
  }
  return (
    map[sectionTitle] ??
    `<p>「${sectionTitle}」：此处为 AI 生成的 Mock 内容，接入真实 AI 后将根据《${t}》的具体内容撰写本章节。${M}</p>`
  )
}
