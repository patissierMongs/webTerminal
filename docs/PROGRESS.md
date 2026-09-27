# 진행 기록

[English](PROGRESS.en.md) | 한국어

## 최종 목표

PC 브라우저나 휴대폰에서 서버의 tmux 세션에 접속해 Claude Code CLI(Command Line Interface) 작업을 이어서 하고, 권한 요청이나 오류를 알림으로 받고, 로컬 LLM(Large Language Model)으로 세션 내용을 요약해 보는 개인용 원격 웹 터미널을 만드는 것입니다(`package.json`의 설명: "Remote web terminal for Claude Code CLI via tmux + xterm.js").

## 현재 구현 상태

아래 상태는 2026-09-27에 코드를 직접 읽고 로컬에서 서버를 실행해 확인한 결과입니다. 이 저장소에는 자동화된 테스트가 없습니다.

| 기능 | 상태 | 코드 위치 | 확인 내용 |
|------|------|-----------|-----------|
| tmux 세션 연결(node-pty로 `tmux attach-session`) | 구현됨 | `lib/terminal.js` `spawn()`, `ensureTmuxSession()` | 실행해서 입력·출력 확인 |
| 브라우저 터미널(xterm.js + Socket.IO) | 구현됨 | `public/app.js` 앞부분, `server.js` `io.on('connection')` | 실행해서 확인 |
| 최근 출력 재전송(100KB) | 구현됨 | `lib/terminal.js` `appendScrollback()`, `addClient()` | 코드 확인. 재전송 중 터미널 질의 응답이 셸에 입력되는 문제 관찰(아래 알려진 문제) |
| PTY(pseudo-terminal) 종료 시 2초 뒤 재연결 | 구현됨 | `lib/terminal.js` `onExit` | tmux 서버 종료 후 세션이 다시 만들어지는 것 확인 |
| 날짜별 로그(plain/raw) | 구현됨 | `lib/logger.js` | `logs/<날짜>-plain.log`, `-raw.log` 생성 확인 |
| 로그 조회 API(Application Programming Interface)·서랍 메뉴 | 구현됨 | `server.js` `/api/logs`, `public/app.js` `showLogs()` | 실행해서 확인 |
| 패턴 알림(권한/오류/완료, 30초 쿨다운) | 구현됨 | `lib/watcher.js` | `command not found` 입력 시 오류 알림 표시 확인 |
| 유휴(Idle) 감지 | 미구현 | — | 커밋 `b458320`에서 제거됨. 이전 README에는 남아 있었음 |
| Telegram 알림(`openclaw` CLI) | 부분 구현 | `lib/notifier.js`, `server.js` `watcher.on('alert')` | 코드는 있으나 `openclaw` CLI가 없어 이 환경에서는 전송을 확인하지 못함 |
| Ollama 요약(REST, 저장) | 구현됨 | `lib/summarizer.js` `summarize()`, `server.js` `/api/summarize` | Ollama 없이 실행해 오류 처리(HTTP(Hypertext Transfer Protocol) 503)까지만 확인 |
| Ollama 스트리밍 패널 | 구현됨 | `lib/summarizer.js` `streamSummarize()`, `public/app.js` 확장 패널 | 코드 확인, Ollama 미연결로 실제 스트림은 미확인 |
| 시스템 모니터(CPU(Central Processing Unit)/GPU(Graphics Processing Unit)/NET(네트워크)) | 구현됨 | `lib/monitor.js`, `public/app.js` `updateMonitor()` | `/api/monitor` 응답과 화면 표시 확인(GPU 없음 → 숨김) |
| PWA(Progressive Web App) 매니페스트·Service Worker | 구현됨 | `public/manifest.json`, `public/sw.js`(캐시 `v7`) | 코드 확인 |
| PWA 전용 HHKB(Happy Hacking Keyboard) 키보드·단축키 줄·Fn 레이어 | 구현됨 | `public/app.js` `if (isPWA())` 블록 | PWA 모드로 띄워 탭 입력 확인 |
| 두벌식 한글 입력(버퍼 방식) | 구현됨 | `public/app.js` `ime`, `toggleKoreanMode()` | `echo 한글` 입력·출력 확인 |
| PWA 크기 조정 제한(PC(Personal Computer) 브라우저 우선) | 구현됨 | `lib/terminal.js` `resizeIfAllowed()` | 코드 확인 |
| 스크롤 버튼 | 구현됨 | `public/app.js` `setupRepeatButton()` | PWA 화면에서 표시 확인 |
| 인증(로그인·토큰) | 미구현 | — | 서버에 인증이 없고 Socket.IO CORS(Cross-Origin Resource Sharing)가 `*` |
| 자동화 테스트 | 미구현 | — | 테스트 파일과 `test` 스크립트 없음 |

### 알려진 문제

- **질의 응답이 셸로 들어감**: 새 클라이언트가 접속하면 저장된 출력을 다시 받는데, 그 안의 터미널 질의(Device Attributes)에 xterm.js가 응답하고 그 응답이 `input`으로 셸에 전달됩니다. 로컬 실행 때 프롬프트에 `1;2c0;276;0c` 같은 문자열이 입력되는 것을 확인했습니다.
- **로그 날짜가 UTC(협정 세계시)**: `new Date().toISOString()`을 쓰기 때문에 한국 시간 오전 9시에 로그 파일이 바뀝니다.
- **`start.sh`와 `.env`**: `start.sh`는 `.env`를 읽지 않고, Ollama 확인도 `http://localhost:11434`로 고정되어 있습니다.
- **tmux 로캘**: 서버 프로세스에 UTF-8 로캘(`LANG`)이 없으면 tmux가 한글을 `_`로 바꿔 보여 줍니다.
- 이전 README에 적힌 Android 일부 키보드의 문장 반복 현상, WSL2(Windows Subsystem for Linux 2)에서 `nvidia-smi` 사용률이 0%로 나오는 현상은 이 환경에서 재현하지 못했습니다.

## 작업 이력

`git log`에서 뽑았으며 시각은 한국 표준시(KST, Asia/Seoul)입니다. 커밋에 저장된 오프셋이 이미 `+0900`이라 그대로 옮겼습니다.

| 날짜(KST) | 커밋 | 내용 |
|-----------|------|------|
| 2026-02-14 05:26 | `a5f6390` | 첫 커밋(v1.0.0): 서버, tmux 연결, 로그, 패턴 알림, Telegram 알림, Ollama 요약, 시스템 모니터, PWA. 커밋 전날(2026-02-13) 작업으로 Nerd Font 로컬 제공, 모니터를 델타 방식과 인터페이스 자동 감지로 수정, 모바일 입력창 자동완성 끄기, Ollama 0.9.4→0.16.1 업그레이드(Blackwell GPU 지원), 로그/요약 모달 UI(User Interface)가 포함됨 |
| 2026-02-14 06:23 | `b458320` | 유휴 감지 제거 |
| 2026-02-14 06:24 | `51e7d72` | PWA/브라우저 동시 접속 시 크기 조정 정책 추가 |
| 2026-02-14 06:26 | `68c349a` | 헤더를 상태 표시줄로 교체, PWA 전체 화면, 스크롤 개선 |
| 2026-02-14 06:27 | `e5bddbc` | 모달을 오른쪽 서랍 메뉴로 교체 |
| 2026-02-14 06:28 | `f1c5439` | PWA 전용 HHKB 키보드 추가 |
| 2026-02-14 06:28 | `465a57b` | Service Worker 캐시 버전 v4 |
| 2026-02-14 06:41 | `1ccfca8` | Ollama 실시간 스트리밍 패널 추가, 모니터 위치 수정 |
| 2026-02-14 06:55 | `1ad80d8` | PWA 키보드에 한/영 전환과 스크롤 버튼 추가, IME(Input Method Editor)/tmux 문제 수정 |
| 2026-02-14 07:09 | `d9152db` | PWA 키보드용 두벌식 한글 입력기 추가 |
| 2026-02-14 08:54 | `a6df067` | 한글 입력을 버퍼 방식으로 변경(백스페이스 치환 제거) |
| 2026-09-27 | (이번 작업) | README 한국어/영어 분리 재작성, 스크린샷·GIF 추가, 진행 기록 추가 |
