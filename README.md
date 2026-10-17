<div align="center">

<img src="images/brand/limn-icon.svg" width="96" alt="Limn 아이콘">

# Limn

**포토샵처럼 손에 익은 그대로 쓰는, 내 컴퓨터 안의 사진 편집기**

`Limn`(림) — "그리다, 생생하게 묘사하다"라는 뜻의 영어 단어에서 이름을 가져왔습니다.

![Windows](https://img.shields.io/badge/Windows-데스크톱_앱-0078D4?logo=windows&logoColor=white)
![Tauri](https://img.shields.io/badge/Tauri-2-24C8DB?logo=tauri&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-ES2020-F7DF1E?logo=javascript&logoColor=black)
![License](https://img.shields.io/badge/License-MIT-green)

<img src="images/readme/screenshot.jpg" width="820" alt="Limn 편집 화면">

</div>

---

## 왜 만들었나요

사진을 찍고 보정하는 걸 좋아하는데, 매달 구독료를 내야 하는 편집기는 늘 부담이었습니다.
그렇다고 무료 편집기를 쓰면 도구 위치도, 단축키도, 메뉴 이름도 달라서 손이 자꾸 멈췄어요.

그래서 목표를 하나로 정했습니다.

> **포토샵을 쓰던 손 그대로 쓸 수 있을 것.**
> 도구 위치, 단축키, 메뉴 이름(한국어판 기준), 동작 방식까지 최대한 똑같이.

오픈 소스 웹 편집기 [miniPaint](https://github.com/viliusle/miniPaint)를 출발점으로 삼아
화면 구성과 편집 엔진 대부분을 새로 만들고, Windows 데스크톱 앱으로 묶었습니다.
사진은 어디에도 업로드되지 않고, AI 기능까지 모두 내 컴퓨터 안에서 돌아갑니다.

## 이런 걸 할 수 있어요

### 🖌️ 포토샵과 같은 작업 환경
- 왼쪽 도구 막대, 위쪽 옵션 막대, 오른쪽 패널까지 같은 배치 — **V, M, L, W, C, J, B, S, E, T, P, R, H, Z** 같은 단축키도 그대로
- 패널·도구 막대·옵션 막대를 끌어서 원하는 곳에 붙이거나 띄울 수 있음 (탭 순서 바꾸기, 왼쪽/오른쪽 도킹)
- 여러 문서를 탭으로 열기, 저장 안 된 문서는 닫을 때 `저장 / 저장 안 함 / 취소` 확인
- 레이어 우클릭 메뉴는 포토샵에서 자주 쓰는 순서로, 상황에 맞는 항목만 표시

### 🧩 레이어
- 레이어 그룹, 혼합 모드, 불투명도/칠, 잠금
- **레이어 마스크**, **조정 레이어**(명도/대비, 레벨, 곡선, 색조/채도, 흑백, 채널 혼합, 그레이디언트 맵 …)
- **스마트 오브젝트**, 레이어 스타일(드롭 섀도, 획, 외부 광선, 색상 오버레이)
- 편집 가능한 모양 레이어, 문자 레이어(문자·단락 패널)

### 🎨 보정과 리터칭
- Camera Raw 필터, 레벨·곡선·노출·활기·색상 균형 등 조정 대화상자 (실시간 미리보기)
- 스팟 복구 브러시, 복구 브러시, 패치, 복제 도장, 적목 현상, 닷지/번/스펀지
- 픽셀 유동화, 가우시안·조리개·기울기-이동 흐림 효과, 언샵 마스크, 하이 패스
- **내용 인식 비율** — 사람·건물 같은 피사체는 그대로 두고 하늘·벽처럼 단조로운 부분만 늘이거나 줄여서 비율 바꾸기
- **회전 보기 도구(R)** — 종이를 돌리듯 화면만 돌려서 편한 각도로 작업 (이미지는 그대로)

### 🤖 내 컴퓨터에서 도는 AI
| 기능 | 모델 |
|---|---|
| 오브젝트 선택 / 피사체 선택 | SlimSAM |
| 내용 인식 채우기 / 지우기 | LaMa |
| AI 노이즈 감소 | NAFNet |

인터넷 서버로 사진을 보내지 않습니다. 그래픽 카드(WebGPU)가 있으면 GPU로, 없으면 CPU로 실행돼요.

### 📷 파일
- JPG · PNG · WEBP · GIF · TIFF, **PSD 열기/저장**, 카메라 **RAW** 열기
- **16비트/채널** 편집과 16비트 PNG 내보내기 — 보정을 여러 번 해도 계단 현상이 덜 생김

## 신경 써서 만든 부분

**1. 조정 레이어가 많아도 버벅이지 않게**
조정 레이어는 화면을 그릴 때마다 모든 픽셀을 다시 계산해야 해서 처음에는 레이어를 켜고 끌 때마다 0.1~0.3초씩 멈췄습니다.
결과를 캐시하고, 화면에 보이는 부분만 계산하고, 단순한 조정(흑백·반전·레벨·곡선 등)은 SVG 필터로 **GPU에서** 처리하도록 바꿔서 대부분 **15ms 안팎**으로 줄였습니다.

**2. 16비트 편집**
캔버스는 8비트만 다루기 때문에 레이어마다 16비트 원본을 따로 들고 다니면서, 조정·Camera Raw는 16비트로 계산하고 화면에는 디더링해서 보여줍니다. 실행 취소/다시 실행에도 16비트 데이터가 함께 저장됩니다.

**3. 내용 인식 비율 (Seam Carving)**
사진에서 "에너지"(경계·질감)가 가장 낮은 픽셀 경로를 찾아 하나씩 빼거나 복제합니다.
큰 사진에서도 빠르도록 축소본에서 경로 순서를 구한 뒤 원본 해상도에 적용해서, 900만 화소 사진도 1초 안에 끝납니다.
선택 영역이나 피부 톤을 보호 영역으로 지정할 수 있습니다.

**4. 실행 취소가 믿을 수 있도록**
메뉴 238개, 모든 도구, 무작위 조작을 섞어 돌리는 자동 테스트를 만들고, 작업 → 실행 취소 → 다시 실행 후 픽셀이 똑같은지 비교해서 찾은 버그들을 고쳤습니다.

## 시작하기

### 필요한 것
- [Node.js](https://nodejs.org/) 18 이상
- 데스크톱 앱을 빌드하려면 추가로 [Rust](https://www.rust-lang.org/tools/install) (Tauri 2)

### 브라우저에서 실행
```bash
npm install
npm run models   # AI 모델 받기 (약 340MB, 처음 한 번만)
npm run build
npm start        # http://localhost:8080
```

### Windows 앱 만들기
```bash
npm run build
npm run app      # 결과: release/Limn.exe (설치 파일)
```

> AI 모델 파일은 용량이 커서 저장소에 넣지 않았습니다. `npm run models`가 Hugging Face에서 받아 `models/` 폴더에 넣어 줍니다.

## 자주 쓰는 단축키

| 키 | 기능 | 키 | 기능 |
|---|---|---|---|
| `V` | 이동 도구 | `Ctrl + T` | 자유 변형 |
| `M` | 선택 윤곽 도구 | `Ctrl + J` | 레이어 복제 |
| `W` | 오브젝트 선택 도구 | `Ctrl + L` / `Ctrl + M` | 레벨 / 곡선 |
| `J` | 스팟 복구 브러시 | `Ctrl + U` | 색조/채도 |
| `B` | 브러시 도구 | `Alt + Shift + Ctrl + C` | 내용 인식 비율 |
| `R` | 회전 보기 (누른 채 끌면 잠깐만) | `Ctrl + Alt + Shift + E` | 도장 찍기 |
| `Space` | 잠깐 손 도구 | `[` / `]` | 브러시 크기 |
| `Ctrl + Z` | 실행 취소 | `Ctrl + Shift + Z` | 다시 실행 |

## 프로젝트 구조

```
src/
├─ js/
│  ├─ core/        편집 엔진 (레이어 렌더링, 선택 영역, 16비트, 실행 취소, 단축키, AI 실행)
│  │  └─ gui/      작업 영역, 도구 막대, 패널, 대화상자
│  ├─ tools/       도구 하나당 파일 하나 (브러시, 펜, 자르기, 회전 보기 …)
│  ├─ modules/     메뉴 명령 (파일, 편집, 이미지, 레이어, 선택, 필터 …)
│  ├─ actions/     실행 취소가 가능한 작업 단위
│  └─ libs/        조정 대화상자, 필터 계산 등
├─ css/
src-tauri/          Windows 앱 (Tauri 2)
tools/              실행 · 빌드 · 모델 받기 스크립트
images/brand/       Limn 아이콘
```

## 아직 남은 것
- 생성형 채우기, 퍼펫 뒤틀기, CMYK 모드는 아직 없습니다.
- 그룹이 복잡하게 얽힌 문서에서 아주 드물게 실행 취소 결과가 어긋나는 경우가 있습니다.
- 색조/채도 · 색상 균형 같은 일부 조정 레이어는 아직 CPU로 계산해서 큰 사진에서는 조금 느릴 수 있습니다.

## 고마운 프로젝트
- [miniPaint](https://github.com/viliusle/miniPaint) — 출발점이 된 웹 이미지 편집기 (MIT)
- [Tauri](https://tauri.app/) — 데스크톱 앱
- [ONNX Runtime Web](https://onnxruntime.ai/) · [Transformers.js](https://github.com/huggingface/transformers.js) — 브라우저 안 AI 실행
- [ag-psd](https://github.com/Agamnentzar/ag-psd) — PSD 읽기/쓰기
- [LibRaw](https://www.libraw.org/) (libraw-wasm) — RAW 현상
- AI 모델: [SlimSAM](https://huggingface.co/Xenova/slimsam-77-uniform), [LaMa](https://huggingface.co/Carve/LaMa-ONNX), [NAFNet](https://github.com/megvii-research/NAFNet)

## 라이선스
MIT — [MIT-LICENSE.txt](MIT-LICENSE.txt) (miniPaint의 저작권 표시를 포함합니다)

Photoshop은 Adobe의 상표이며, Limn은 Adobe와 관계없는 개인 프로젝트입니다.
