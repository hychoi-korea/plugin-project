# Banner 생성기 Figma 플러그인 설계

**날짜:** 2026-04-05
**대상:** 디자이너 및 콘텐츠 마케터
**목적:** 피그마 배너 템플릿에 AI 기반으로 카피·이미지·컬러를 자동으로 채워주는 플러그인

---

## 1. 전체 아키텍처

```
┌─────────────────────────────────────────┐
│  Figma Plugin UI (ui.html)              │
│  - 단일 스크롤 패널                      │
│  - Claude / Gemini API 호출 (fetch)     │
└────────────────┬────────────────────────┘
                 │ postMessage
┌────────────────▼────────────────────────┐
│  Plugin Main Thread (code.ts)           │
│  - Figma API 접근 (레이어 탐색/수정)    │
│  - clientStorage (API 키 저장/조회)     │
│  - 선택된 노드 분석 및 콘텐츠 적용      │
└────────────────┬────────────────────────┘
        ┌────────┴────────┐
        ▼                 ▼
┌──────────────┐  ┌──────────────┐
│  Claude API  │  │  Gemini API  │
│  (카피 생성/ │  │  (이미지 생성)│
│   다듬기)    │  │              │
└──────────────┘  └──────────────┘
```

**핵심 원칙:**
- API 호출은 UI 스레드(브라우저 환경)에서 수행 — 메인 스레드는 `fetch` 불가
- 두 스레드 간 통신은 `postMessage` / `onmessage`로만
- `manifest.json`의 `networkAccess.allowedDomains`에 Claude(`api.anthropic.com`), Gemini(`generativelanguage.googleapis.com`) 도메인 추가
