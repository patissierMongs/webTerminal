# OpenClaw Web Terminal

브라우저에서 tmux 세션에 접속할 수 있는 실시간 웹 터미널 애플리케이션.
Claude Code CLI와 함께 사용하도록 설계되었으며, 세션 모니터링, 로깅, AI 요약 기능을 제공한다.

## 주요 기능

- **웹 터미널** - xterm.js 기반 브라우저 터미널 (실시간 Socket.IO 통신)
- **세션 로깅** - 일별 자동 로테이션, Plain/Raw 이중 로그 저장
- **패턴 감시** - 권한 요청, 에러, 완료, 유휴 상태 자동 감지 및 알림
- **Telegram 알림** - 에러/권한 프롬프트 발생 시 Telegram 메시지 전송
- **AI 요약** - Ollama(로컬 LLM)를 활용한 세션 요약 생성
- **시스템 모니터** - CPU, GPU(nvidia-smi), 네트워크 실시간 모니터링
- **PWA 지원** - 모바일 홈 화면 추가, 오프라인 캐싱, Nerd Font 로컬 서빙

## 기술 스택

| 구분 | 기술 |
|------|------|
| Backend | Node.js, Express, Socket.IO, node-pty |
| Frontend | xterm.js v5.5.0, Vanilla JS, Service Worker |
| Font | FiraCode Nerd Font (로컬 서빙, WOFF2) |
| 외부 서비스 | tmux, Ollama (선택), Tailscale (선택), OpenClaw CLI (선택) |

## 프로젝트 구조

```
newopenclaw/
├── server.js              # Express/Socket.IO 메인 서버
├── start.sh               # 사전 점검 및 서버 실행 스크립트
├── package.json
├── .env.example           # 환경변수 템플릿
├── lib/
│   ├── terminal.js        # PTY/tmux 브릿지 매니저
│   ├── logger.js          # 세션 로깅 (Plain + Raw)
│   ├── watcher.js         # 패턴 기반 알림 시스템
│   ├── notifier.js        # Telegram 알림 발송
│   ├── summarizer.js      # Ollama 기반 로그 요약
│   └── monitor.js         # 시스템 모니터 (CPU/GPU/NET)
├── public/
│   ├── index.html         # SPA 메인 페이지
│   ├── app.js             # 클라이언트 앱 로직
│   ├── style.css          # 다크 테마 UI
│   ├── manifest.json      # PWA 매니페스트
│   ├── sw.js              # Service Worker (v2)
│   ├── fonts/
│   │   ├── nerd-font.css  # @font-face 선언
│   │   ├── FiraCodeNerdFont-Regular.woff2
│   │   └── FiraCodeNerdFont-Bold.woff2
│   ├── icon-192.png
│   └── icon-512.png
├── logs/                  # 세션 로그 (자동 생성)
└── summaries/             # AI 요약 파일 (자동 생성)
```

## 요구 사항

- **Node.js** 18+
- **tmux** (필수)
- **Ollama** v0.16+ (선택 - AI 요약 기능 사용 시. Blackwell GPU는 v0.13+ 필수)
- **Tailscale** (선택 - 원격 접속 시)

## 설치 및 실행

```bash
# 의존성 설치
npm install

# 환경변수 설정
cp .env.example .env
# .env 파일을 편집하여 필요한 값 입력

# 실행 (start.sh 사용 - 권장)
chmod +x start.sh
./start.sh

# 또는 직접 실행
npm start

# 개발 모드 (파일 변경 시 자동 재시작)
npm run dev
```

## 환경 변수

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `PORT` | `3030` | HTTP 서버 포트 |
| `HOST` | `0.0.0.0` | HTTP 리슨 주소 |
| `TMUX_SESSION` | `openclaw` | tmux 세션 이름 |
| `TELEGRAM_CHAT_ID` | - | Telegram 수신자 ID |
| `OLLAMA_URL` | `http://localhost:11434` | Ollama API 엔드포인트 |
| `OLLAMA_MODEL` | `qwen3:30b-a3b` | 요약에 사용할 LLM 모델 (MoE) |

## API

| 메서드 | 경로 | 설명 |
|--------|------|------|
| `GET` | `/api/status` | 서버 상태 (tmux, PTY, 클라이언트 수, Ollama) |
| `GET` | `/api/logs` | 로그 파일 목록 |
| `GET` | `/api/logs/:filename` | 로그 파일 내용 |
| `POST` | `/api/summarize` | AI 요약 생성 (Ollama 필요) |
| `GET` | `/api/summaries` | 요약 파일 목록 |
| `GET` | `/api/summaries/:filename` | 요약 파일 내용 |
| `GET` | `/api/monitor` | 시스템 사용률 (CPU/GPU/NET) |

## Socket.IO 이벤트

**Client → Server:**
- `input` - 터미널 입력
- `resize` - 터미널 크기 변경 `{ cols, rows }`

**Server → Client:**
- `output` - 터미널 출력
- `alert` - 알림 이벤트 `{ type, detail, timestamp }`
- `pty-exit` - PTY 프로세스 종료 (자동 재접속)

## 알림 패턴

| 유형 | 감지 대상 |
|------|-----------|
| Permission | Allow, y/n, approve 등 권한 요청 프롬프트 |
| Error | Error:, ENOENT, TypeError, panic 등 |
| Completion | Done, Completed, Success 등 완료 메시지 |
| Idle | 10초 이상 무활동 |

---

## 작업 이력

### 2026-02-13 — 초기 세팅 및 최적화

#### Nerd Font 로컬 서빙
- CDN 의존 제거, `public/fonts/`에 FiraCode Nerd Font WOFF2 로컬 호스팅
- `font-display: swap` 적용, Service Worker v2 프리캐시에 포함
- Android 웹에서 tmux 글리프 깨짐 해결

#### 시스템 모니터 (`lib/monitor.js`) 전면 수정
- **CPU**: 부팅 이후 누적값 → 델타 기반 실시간 사용률로 변경
- **GPU**: `nvidia-smi` 감지, 미사용 시 UI에서 자동 숨김
- **NET**: 하드코딩 인터페이스(`eth0`) → 가장 트래픽 많은 인터페이스 자동 감지 (60초마다 재감지), 실제 속도(`KB/s`, `MB/s`) 표시
- `execSync` 셸 파이프 → `fs.readFileSync('/proc/net/dev')` 직접 파싱으로 개선

#### 한글 IME 입력 개선
- xterm.js 내부 textarea에 `autocomplete/autocorrect/autocapitalize/spellcheck` off 설정
- Android 키보드 자동완성/예측 간섭 최소화
- 주의: textarea.value 초기화는 한글 교차 음절 조합을 깨뜨리므로 금지

#### Ollama v0.9.4 → v0.16.1 업그레이드
- **문제**: RTX 5090 (Blackwell, sm_120, CUDA 13)용 커널이 v0.9.4에 없어 GPU 감지만 하고 CPU 폴백
- **증상**: `ollama ps` "100% GPU" 표시하지만 실제 GPU 사용률 0%, 6.57 t/s
- **해결**: v0.16.1의 `cuda_v13` 라이브러리 포함 → 49/49 레이어 GPU 오프로드, Flash Attention 활성화
- **결과**: 6.57 t/s → 237 t/s (36배 향상), 요약 생성 130초 → 7.7초

#### UI 개선
- Logs/Summary 패널: 하단 슬라이드업 → 센터 모달 팝업으로 변경
- 모바일 터치 스크롤 최적화 (`-webkit-overflow-scrolling`, `overscroll-behavior`)
- 배경 클릭으로 모달 닫기 지원
- Reload 버튼 추가 (PWA에서 새로고침 불가 대응)

#### 알려진 이슈
- 한글 입력 시 Android 일부 키보드에서 이전 문장 반복 현상 잔존 가능 (xterm.js textarea 축적 문제)
- WSL2 환경에서 `nvidia-smi` GPU 사용률이 0%로 보고되는 경우 있음 (실제로는 정상 작동)
