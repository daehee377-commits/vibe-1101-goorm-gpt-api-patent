// Vercel Serverless: POST /api/report
// PromptTemplate → ChatOpenAI(gpt-4o-mini) → StructuredOutputParser(zod) → Markdown → (선택) Notion 업서트

import { Client } from '@notionhq/client'
import { z } from 'zod'

const reportSchema = z.object({
  summary: z.string().describe('이번 주 업무 전체 요약 (2~3문장)'),
  wins: z.array(z.string()).describe('이번 주 성과 3~5개'),
  blockers: z.array(z.string()).describe('이슈/리스크 3~5개'),
  next_actions: z.array(z.string()).describe('다음 주 계획 3~5개'),
  requests: z.array(z.string()).describe('요청사항 3~5개'),
})

function clampList(items, fallback) {
  const cleaned = (Array.isArray(items) ? items : [])
    .map((v) => String(v).trim())
    .filter(Boolean)
  const unique = [...new Set(cleaned)]
  if (unique.length >= 3) return unique.slice(0, 5)
  const padded = [...unique]
  while (padded.length < 3) padded.push(fallback)
  return padded
}

function normalize(report) {
  return {
    summary: String(report.summary || '').trim() || '원자료 기준으로 이번 주 업무를 정리했습니다.',
    wins: clampList(report.wins, '추가 성과 항목 확인 필요'),
    blockers: clampList(report.blockers, '추가 이슈 확인 필요'),
    next_actions: clampList(report.next_actions, '다음 주 계획 보완 필요'),
    requests: clampList(report.requests, '요청사항 보완 필요'),
  }
}

function toMarkdown(r, title, week) {
  const list = (items) => items.map((v) => `- ${v}`).join('\n')
  return [
    `# ${title}`,
    '',
    `> 보고일: ${week}`,
    '',
    '## 요약',
    r.summary,
    '',
    '## 이번 주 성과',
    list(r.wins),
    '',
    '## 이슈 · 리스크',
    list(r.blockers),
    '',
    '## 다음 주 계획',
    list(r.next_actions),
    '',
    '## 요청사항',
    list(r.requests),
    '',
  ].join('\n')
}

const richText = (text) => [{ type: 'text', text: { content: String(text).slice(0, 2000) } }]

function propertiesOf(report, title, week) {
  return {
    Title: { title: richText(title) },
    Week: { date: { start: week } },
    Summary: { rich_text: richText(report.summary) },
    Wins: { rich_text: richText(report.wins.join('\n')) },
    Blockers: { rich_text: richText(report.blockers.join('\n')) },
    NextActions: { rich_text: richText(report.next_actions.map((v) => `[ ] ${v}`).join('\n')) },
  }
}

function childrenOf(report) {
  const heading = (text) => ({
    object: 'block',
    type: 'heading_2',
    heading_2: { rich_text: richText(text) },
  })
  const paragraph = (text) => ({
    object: 'block',
    type: 'paragraph',
    paragraph: { rich_text: richText(text) },
  })
  const bullet = (text) => ({
    object: 'block',
    type: 'bulleted_list_item',
    bulleted_list_item: { rich_text: richText(text) },
  })
  const todo = (text) => ({
    object: 'block',
    type: 'to_do',
    to_do: { rich_text: richText(text), checked: false },
  })
  return [
    heading('요약'),
    paragraph(report.summary),
    heading('이번 주 성과'),
    ...report.wins.map(bullet),
    heading('이슈 · 리스크'),
    ...report.blockers.map(bullet),
    heading('다음 주 계획'),
    ...report.next_actions.map(todo),
    heading('요청사항'),
    ...report.requests.map(bullet),
  ]
}

async function resolveDataSourceId(notion, databaseId) {
  try {
    const db = await notion.databases.retrieve({ database_id: databaseId })
    const id = db.data_sources?.[0]?.id
    if (id) return id
  } catch {
    // NOTION_DB_ID가 data source ID일 수 있음
  }
  return databaseId
}

async function upsertToNotion(report, title, week) {
  const token = process.env.NOTION_TOKEN
  const databaseId = process.env.NOTION_DB_ID
  if (!token || !databaseId) {
    throw new Error('NOTION_TOKEN / NOTION_DB_ID 환경변수가 설정되지 않았습니다.')
  }

  const notion = new Client({ auth: token })
  const properties = propertiesOf(report, title, week)
  const dataSourceId = await resolveDataSourceId(notion, databaseId)

  let existingId = null
  try {
    const found = await notion.dataSources.query({
      data_source_id: dataSourceId,
      page_size: 1,
      filter: {
        and: [
          { property: 'Title', title: { equals: title } },
          { property: 'Week', date: { equals: week } },
        ],
      },
    })
    existingId = found.results?.[0]?.id ?? null
  } catch {
    existingId = null
  }

  const urlOf = (page, fallbackId) =>
    page.url || `https://www.notion.so/${String(fallbackId).replace(/-/g, '')}`

  if (existingId) {
    const page = await notion.pages.update({ page_id: existingId, properties })
    return urlOf(page, existingId)
  }

  const page = await notion.pages.create({
    parent: { database_id: databaseId },
    properties,
    children: childrenOf(report),
  })
  return urlOf(page, page.id)
}

function setCors(res) {
  res.setHeader?.('Access-Control-Allow-Origin', '*')
  res.setHeader?.('Access-Control-Allow-Methods', 'POST,OPTIONS')
  res.setHeader?.('Access-Control-Allow-Headers', 'Content-Type')
}

async function generateReport(notes) {
  const { PromptTemplate } = await import('@langchain/core/prompts')
  const { StructuredOutputParser } = await import('@langchain/core/output_parsers')
  const { ChatOpenAI } = await import('@langchain/openai')

  const parser = StructuredOutputParser.fromZodSchema(reportSchema)
  const prompt = PromptTemplate.fromTemplate(
    `당신은 팀의 주간 업무보고서를 작성하는 전문 비서입니다.
아래 원자료(회의록, 할 일, 성과 메모)를 바탕으로 주간보고 내용을 작성하세요.

규칙:
- 한국어로, 간결한 개조식 문장(한 항목 한 문장)으로 작성
- wins, blockers, next_actions, requests는 각각 반드시 3개 이상 5개 이하
- 원자료에 없는 사실은 만들어내지 말고, 부족하면 원자료에서 추론 가능한 범위로만 작성
- 요청사항은 상위자/타 부서에 필요한 지원·결정 사항
- 출력은 지정된 JSON 스키마만 사용

원자료:
{notes}

{format_instructions}`,
  )

  const model = new ChatOpenAI({ model: 'gpt-4o-mini', temperature: 0.3 })
  const chain = prompt.pipe(model).pipe(parser)
  return chain.invoke({
    notes: notes.slice(0, 20000),
    format_instructions: parser.getFormatInstructions(),
  })
}

export default async function handler(req, res) {
  setCors(res)
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { notes, title, week, saveNotion } = req.body ?? {}
  if (typeof notes !== 'string' || notes.trim().length === 0) {
    return res.status(400).json({ error: '원자료를 입력해주세요.' })
  }
  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: 'OPENAI_API_KEY가 설정되지 않았습니다.' })
  }

  const reportTitle = (typeof title === 'string' && title.trim()) || '주간 업무보고'
  const reportWeek =
    typeof week === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(week)
      ? week
      : new Date().toISOString().slice(0, 10)

  try {
    const raw = await generateReport(notes)
    const report = normalize(raw)
    const markdown = toMarkdown(report, reportTitle, reportWeek)

    let notionUrl = null
    let notionError = null
    if (saveNotion) {
      try {
        notionUrl = await upsertToNotion(report, reportTitle, reportWeek)
      } catch (e) {
        console.error('Notion upsert failed:', e)
        notionError = e.message
      }
    }

    return res.status(200).json({ report, markdown, notionUrl, notionError })
  } catch (e) {
    console.error('Report generation failed:', e)
    return res.status(500).json({
      error: '보고서 생성 중 오류가 발생했습니다.',
      detail: process.env.NODE_ENV === 'development' ? e.message : undefined,
    })
  }
}
