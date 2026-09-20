/**
 * AI 服务层（OpenAI 兼容协议，当前对接阿里百炼 Qwen）
 * - baseURL / model / key 全部来自 .env，更换供应商零代码改动
 * - 境外供应商需要代理时设 AI_USE_PROXY=true（走 HTTPS_PROXY）
 * - 三大能力：chat（论文问答）/ fillSection（笔记章节填充）/ translate（划词翻译）
 */
import { fetch as uFetch, ProxyAgent, type Dispatcher } from 'undici'

const baseURL = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '')
const apiKey = process.env.OPENAI_API_KEY || ''
const model = process.env.OPENAI_MODEL || 'gpt-5-mini'
// 视觉模型：仅在用户主动分析图表/图片时调用，与文本模型共用同一 API Key
const vlModel = process.env.OPENAI_VL_MODEL || 'qwen-vl-plus'
// OpenAI 新模型（gpt-5/o 系列）要求 max_completion_tokens 且不接受 temperature
const isOpenAIOfficial = /api\.openai\.com/i.test(baseURL)

export function aiConfigured(): boolean {
  return Boolean(apiKey)
}

function proxyDispatcher(): Dispatcher | undefined {
  if (process.env.AI_USE_PROXY === 'true' && process.env.HTTPS_PROXY) {
    return new ProxyAgent(process.env.HTTPS_PROXY)
  }
  return undefined
}

interface ChatMsg {
  role: 'system' | 'user' | 'assistant'
  content: string
}

/** OpenAI 兼容 chat/completions 调用 */
export async function aiChatCompletion(
  messages: ChatMsg[],
  opts: { json?: boolean; maxTokens?: number } = {},
): Promise<string> {
  if (!apiKey) {
    throw Object.assign(new Error('AI 服务未配置（缺少 OPENAI_API_KEY）'), {
      code: 'AI_NOT_CONFIGURED',
    })
  }

  const body: Record<string, unknown> = { model, messages }
  body[isOpenAIOfficial ? 'max_completion_tokens' : 'max_tokens'] = opts.maxTokens ?? 2048
  if (!isOpenAIOfficial) body.temperature = 0.4
  if (opts.json) body.response_format = { type: 'json_object' }

  const res = await uFetch(`${baseURL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    dispatcher: proxyDispatcher(),
    signal: AbortSignal.timeout(120_000),
  } as any)

  const json = (await res.json()) as any
  if (!res.ok) {
    throw Object.assign(
      new Error(json?.error?.message || `AI 请求失败（HTTP ${res.status}）`),
      { code: json?.error?.code || 'AI_ERROR' },
    )
  }
  return json.choices?.[0]?.message?.content ?? ''
}

export interface PaperMeta {
  title: string
  authors?: string
  venue?: string
  year?: string
  abstract?: string
}

function buildPaperPrompt(meta: PaperMeta | null, fullText: string | null): string {
  const lines: string[] = []
  if (meta) {
    lines.push(`论文标题：${meta.title}`)
    if (meta.authors) lines.push(`作者：${meta.authors}`)
    if (meta.venue) lines.push(`发表venue：${meta.venue}`)
    if (meta.year) lines.push(`年份：${meta.year}`)
    if (meta.abstract) lines.push(`摘要：${meta.abstract}`)
  }
  if (fullText) {
    lines.push(`以下是论文全文（可能截断）：\n"""\n${fullText}\n"""`)
  } else {
    lines.push('（该论文暂无全文文件，仅能基于以上元信息作答，如信息不足请如实说明。）')
  }
  return lines.join('\n')
}

/** 论文问答 */
export async function chatAboutPaper(
  userMessages: { role: 'user' | 'assistant'; content: string }[],
  meta: PaperMeta | null,
  fullText: string | null,
): Promise<string> {
  const sys = PAPER_EXPERT_SYSTEM_PROMPT
  return aiChatCompletion([
    { role: 'system', content: sys },
    { role: 'user', content: buildPaperPrompt(meta, fullText) },
    ...userMessages,
  ])
}

/** 研究助手人设：严谨、批判性的论文研究专家（由产品需求统一定义） */
const PAPER_EXPERT_SYSTEM_PROMPT =
  '你是学术论文阅读助手「研忆」，一名严谨、专业、善于批判性思考的论文研究专家。' +
  '你的核心任务不是简单总结论文，而是在用户阅读论文的过程中，帮助用户理解论文、分析论文、发现问题，' +
  '并建立论文内容与自身研究之间的联系。你应始终优先依据当前用户正在阅读的论文内容回答问题；' +
  '如果论文中没有足够信息，必须明确说明“论文中未明确说明”或“根据现有内容无法判断”，' +
  '不得编造作者观点、研究数据、实验结果、参考文献或论文中不存在的信息。' +
  '回答论文相关问题时，应尽可能结合论文中的原文、研究背景、研究目的、研究问题、理论框架、研究方法、' +
  '实验设计、数据分析、研究结果和局限进行解释，并在适当情况下指出相关内容位于论文的哪个章节或部分。' +
  '面对专业概念时，不要只给出定义，应结合当前论文语境解释“它是什么意思、作者为什么使用它、' +
  '它在本研究中解决了什么问题、如何理解或应用”。面对研究方法问题时，应说明方法的基本逻辑、' +
  '在该论文中的具体使用方式、适用条件以及可能存在的局限。面对用户对论文结论的疑问时，' +
  '应区分“作者明确证明的内容”和“作者基于结果提出的解释”，避免把相关性描述成因果关系，' +
  '也不要将作者的推测直接当作事实。面对用户提出“这个方法好不好”“这个研究是否合理”等问题时，' +
  '不直接给出简单的好/不好判断，而应从研究问题与方法匹配度、样本、变量、实验设计、数据质量、' +
  '分析方法、证据充分性、结论边界等角度进行分析，并说明判断依据。面对用户提出与自己研究相关的问题时，' +
  '可以进一步指出该论文的方法、框架、变量、研究设计或结论可能如何借鉴，但必须明确区分' +
  '“论文作者的观点”和“基于论文内容产生的研究启示”。当用户提出一个可能存在误解的问题时，' +
  '应先指出问题中的关键概念，再进行解释，而不是顺着错误前提回答。回答应具有学术性，但避免过度晦涩；' +
  '优先使用清晰、准确、简洁的语言。可以使用“结论—依据—解释—启示”的结构组织复杂回答。' +
  '对于简单问题直接回答，不需要机械套用固定结构。对于复杂问题，可以适当使用分点、表格或举例帮助理解。' +
  '涉及论文原文时，不要大段复制，优先进行概括和必要的短句引用。涉及不确定信息时，应明确标注不确定性。' +
  '你的目标是让用户不仅“知道论文写了什么”，还能够理解“作者为什么这样研究、这个研究是怎么做的、' +
  '证据是否支持结论、这个研究对自己的研究有什么启发”。'

/** 结构化笔记章节填充（返回 HTML 片段） */
export async function fillSection(
  sectionTitle: string,
  meta: PaperMeta | null,
  fullText: string | null,
): Promise<string> {
  const sys =
    '你是学术论文笔记助手。请根据论文内容为结构化笔记撰写指定章节，要求：' +
    '1) 简体中文；2) 120~300 字；3) 输出 JSON 对象 {"html": "..."}，' +
    'html 字段只使用 <p> 和 <br> 标签，不要 markdown、不要标题标签、不要列表。'
  const raw = await aiChatCompletion(
    [
      { role: 'system', content: sys },
      {
        role: 'user',
        content: `请为章节「${sectionTitle}」撰写内容。\n\n${buildPaperPrompt(meta, fullText)}`,
      },
    ],
    { json: true, maxTokens: 1024 },
  )
  return parseHtmlFromAi(raw, sectionTitle)
}

/** 从 AI 返回中解析 html（JSON → 宽松提取 → 兜底包裹） */
function parseHtmlFromAi(raw: string, sectionTitle: string): string {
  const text = raw.trim()
  // 1. 直接 JSON 解析
  try {
    const obj = JSON.parse(text)
    if (typeof obj.html === 'string' && obj.html.trim()) return obj.html.trim()
  } catch {
    /* 继续宽松解析 */
  }
  // 2. ```json 围栏或首尾大括号提取
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const candidate = fence ? fence[1] : text
  const brace = candidate.match(/\{[\s\S]*\}/)
  if (brace) {
    try {
      const obj = JSON.parse(brace[0])
      if (typeof obj.html === 'string' && obj.html.trim()) return obj.html.trim()
    } catch {
      /* 兜底 */
    }
  }
  // 3. 兜底：把纯文本包成 <p>
  const plain = candidate.replace(/<[^>]+>/g, '').trim() || `（${sectionTitle} 内容生成失败，请重试）`
  return `<p>${plain.replace(/\n/g, '<br>')}</p>`
}

/** 划词翻译（英 → 中） */
export async function translateText(text: string): Promise<string> {
  const sys =
    '你是专业学术翻译。将用户提供的英文文本准确翻译为简体中文：' +
    '术语规范、语句通顺，只输出译文，不要任何解释或原文。'
  return aiChatCompletion(
    [
      { role: 'system', content: sys },
      { role: 'user', content: text },
    ],
    { maxTokens: 2048 },
  )
}

/* ============================================================
   多模态：论文图表/图片分析（仅用户主动发起时调用视觉模型 qwen-vl-plus）
   ============================================================ */

type VisionPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }

interface VisionMsg {
  role: 'system' | 'user'
  content: string | VisionPart[]
}

/** 多模态 chat/completions：图片支持 data URI（base64）或公网 URL */
async function aiVisionChatCompletion(messages: VisionMsg[], maxTokens = 1500): Promise<string> {
  if (!apiKey) {
    throw Object.assign(new Error('AI 服务未配置（缺少 OPENAI_API_KEY）'), {
      code: 'AI_NOT_CONFIGURED',
    })
  }

  const body: Record<string, unknown> = {
    model: vlModel,
    messages,
    max_tokens: maxTokens,
  }
  if (!isOpenAIOfficial) body.temperature = 0.3

  const res = await uFetch(`${baseURL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    dispatcher: proxyDispatcher(),
    signal: AbortSignal.timeout(120_000),
  } as any)

  const json = (await res.json()) as any
  if (!res.ok) {
    throw Object.assign(
      new Error(json?.error?.message || `视觉模型请求失败（HTTP ${res.status}）`),
      { code: json?.error?.code || 'AI_ERROR' },
    )
  }
  return json.choices?.[0]?.message?.content ?? ''
}

export interface ChartAnalysisInput {
  /** data:image/...;base64,... 或公网可访问的图片 URL */
  image: string
  /** 用户针对图表的具体问题；为空时做通用图表解读 */
  question?: string
  meta?: PaperMeta | null
}

const CHART_SYSTEM_PROMPT =
  '你是学术论文图表分析专家「研忆」，一名严谨、善于批判性思考的论文研究助手。' +
  '用户会提供论文中的图表截图（如折线图、柱状图、散点图、箱线图、热力图、实验表格等）。' +
  '请按以下要求作答：' +
  '1) 先客观描述图表中确实可见的信息：图表类型、标题、坐标轴或行列的含义、变量、图例、单位、' +
  '关键数据点、对比关系与变化趋势；' +
  '2) 明确区分「图中直接显示的数据与结果」和「基于结果的解释或推断」，不要把相关性说成因果关系；' +
  '3) 图片模糊、被截断或无法辨认的数字与文字，必须明确说明“图中无法辨认”，' +
  '绝不编造数值、误差线、显著性标记或图中不存在的信息；' +
  '4) 结合论文语境说明该图表试图支撑什么结论、证据是否充分、可能存在哪些解读上的局限；' +
  '5) 用简体中文、条理清晰，必要时分点或使用小表格，避免大段套话；不确定处明确标注。'

/** 图表分析（多模态）：图片 + 论文元信息 + 用户问题 → 中文分析 */
export async function analyzeChart(input: ChartAnalysisInput): Promise<string> {
  const metaLines: string[] = ['（图表来自用户当前阅读的论文）']
  if (input.meta) {
    if (input.meta.title) metaLines.push(`论文标题：${input.meta.title}`)
    if (input.meta.authors) metaLines.push(`作者：${input.meta.authors}`)
    if (input.meta.venue) metaLines.push(`发表venue：${input.meta.venue}`)
    if (input.meta.year) metaLines.push(`年份：${input.meta.year}`)
  }
  const question =
    input.question?.trim() ||
    '请分析这张图表：它属于什么类型、坐标轴/行列变量是什么、展示了哪些关键结果与趋势？'

  const text = `${metaLines.join('\n')}\n\n用户问题：${question}`

  return aiVisionChatCompletion(
    [
      { role: 'system', content: CHART_SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: input.image } },
          { type: 'text', text },
        ],
      },
    ],
    1600,
  )
}
