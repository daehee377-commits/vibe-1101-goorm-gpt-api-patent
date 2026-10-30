# AI 주간 업무보고 자동화

메모·회의록을 입력하면 GPT-4o-mini(LangChain)가 주간보고 Markdown을 만들고, 선택적으로 Notion 데이터베이스에 저장합니다.

## 로컬 실행

```bash
npm install
cp .env.example .env
# OPENAI_API_KEY, NOTION_TOKEN, NOTION_DB_ID 입력
npm run dev
```

브라우저에서 `http://localhost:5173` 을 엽니다.

## Notion 데이터베이스 속성

| 속성 | 타입 |
| --- | --- |
| Title | 제목 |
| Week | 날짜 |
| Summary | 텍스트 |
| Wins | 텍스트 (여러 줄) |
| Blockers | 텍스트 (여러 줄) |
| NextActions | 텍스트 (체크리스트 형식) |

Integration을 해당 DB에 연결한 뒤 `NOTION_TOKEN`, `NOTION_DB_ID`를 서버 환경변수로만 설정하세요.

## Vercel 배포

이 폴더를 프로젝트 루트로 배포하고 Environment Variables에 `OPENAI_API_KEY`, `NOTION_TOKEN`, `NOTION_DB_ID`를 넣습니다. API 키는 `/api/report` 서버리스 함수에서만 사용됩니다.
