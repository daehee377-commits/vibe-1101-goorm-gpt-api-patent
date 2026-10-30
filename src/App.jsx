import { useState } from 'react'
import Markdown from 'react-markdown'
import './App.css'

const today = () => new Date().toISOString().slice(0, 10)

const SAMPLE = `월요일 스탠드업
- 특허 검색 API 초안 완료, 응답 지연 1.8초 → 캐시 도입 검토
- 고객사 A 킥오프: 주간보고 자동화 PoC 요청 (기한 금요일)

화요일
- GPT 프롬프트 5섹션 초안 작성
- Notion DB 속성(Title, Week, Summary, Wins, Blockers, NextActions) 생성
- 이슈: OpenAI 429 한 차례, 재시도로 복구

수요일~목요일
- Vite + 서버리스 /api/report 연동
- 미리보기/복사/다운로드 버튼 구현
- 블로커: Notion 통합이 DB에 연결되지 않아 페이지 생성 실패 → 권한 재초대 필요

금요일 성과
- 내부 데모 성공, 팀장 피드백 "항목 3~5개 유지" 반영
- 다음주: Vercel 배포, 실사용 온보딩, 토큰 비용 모니터링`

export default function App() {
  const [notes, setNotes] = useState('')
  const [title, setTitle] = useState('주간 업무보고')
  const [week, setWeek] = useState(today())
  const [saveNotion, setSaveNotion] = useState(false)
  const [loading, setLoading] = useState(false)
  const [markdown, setMarkdown] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  async function generate() {
    setLoading(true)
    setError('')
    setNotice('')
    try {
      const res = await fetch('/api/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes, title, week, saveNotion }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || '요청에 실패했습니다.')
      setMarkdown(data.markdown)
      if (data.notionUrl) setNotice(`Notion에 저장했습니다. ${data.notionUrl}`)
      else if (data.notionError) setError(`Notion 저장 실패: ${data.notionError}`)
      else setNotice('보고서를 생성했습니다.')
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  async function copy() {
    await navigator.clipboard.writeText(markdown)
    setNotice('클립보드에 복사했습니다.')
  }

  function download() {
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${title}-${week}.md`
    a.click()
    URL.revokeObjectURL(url)
    setNotice('Markdown 파일을 다운로드했습니다.')
  }

  function onNotesKeyDown(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault()
      if (!loading && notes.trim()) generate()
    }
  }

  return (
    <div className="app">
      <header className="header">
        <div>
          <p className="eyebrow">LangChain · GPT-4o-mini · Notion</p>
          <h1>AI 주간 업무보고 자동화</h1>
          <p className="sub">
            회의록·할 일·성과를 넣으면 5섹션 Markdown 보고서를 만들고, 필요하면 Notion DB에 저장합니다.
          </p>
        </div>
        <div className="options">
          <label className="field">
            제목
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label className="field">
            보고일
            <input type="date" value={week} onChange={(e) => setWeek(e.target.value)} />
          </label>
          <label className={`toggle ${saveNotion ? 'on' : ''}`}>
            <input
              type="checkbox"
              checked={saveNotion}
              onChange={(e) => setSaveNotion(e.target.checked)}
            />
            Notion 저장
          </label>
        </div>
      </header>

      <div className="panes">
        <section className="pane">
          <div className="pane-head">
            <h2>원자료</h2>
            <button type="button" className="ghost" onClick={() => setNotes(SAMPLE)}>
              예시 채우기
            </button>
          </div>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onKeyDown={onNotesKeyDown}
            placeholder="메모나 회의록을 붙여넣으세요. Ctrl+Enter로 생성"
          />
          <div className="actions">
            <button type="button" onClick={generate} disabled={loading || !notes.trim()}>
              {loading && <span className="spinner" aria-hidden />}
              {loading ? '생성 중…' : '보고서 생성'}
            </button>
          </div>
          {error && <div className="error" role="alert">{error}</div>}
        </section>

        <section className="pane">
          <div className="pane-head">
            <h2>미리보기</h2>
          </div>
          <div className={`preview ${loading ? 'is-loading' : ''}`}>
            {loading && (
              <div className="overlay">
                <span className="spinner lg" />
                <span>GPT가 주간보고를 작성하는 중</span>
              </div>
            )}
            {markdown ? (
              <Markdown>{markdown}</Markdown>
            ) : (
              <p className="placeholder">생성된 보고서가 여기에 표시됩니다.</p>
            )}
          </div>
          <div className="actions">
            <button type="button" className="secondary" onClick={copy} disabled={!markdown}>
              복사
            </button>
            <button type="button" className="secondary" onClick={download} disabled={!markdown}>
              .md 다운로드
            </button>
          </div>
          {notice && <div className="notice">{notice}</div>}
        </section>
      </div>
    </div>
  )
}
