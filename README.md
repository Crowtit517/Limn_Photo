<div align="center">

<img src="images/brand/limn-icon.svg" width="96" alt="Limn 아이콘">

# Limn

포토샵 쓰던 손 그대로 쓰는 사진 편집기

<img src="images/readme/screenshot.jpg" width="820" alt="Limn 편집 화면">

</div>

<br>

## 소개

사진 찍고 보정하는 걸 좋아합니다. 그런데 포토샵은 매달 나가는 구독료가 부담이었고,
무료 편집기로 넘어가 보면 도구 위치도 단축키도 메뉴 이름도 다 달라서 손이 계속 멈추더라고요.

그래서 직접 만들어 보기로 했습니다. 목표는 처음부터 하나였어요.

**포토샵을 쓰던 사람이 아무 설명 없이 바로 쓸 수 있을 것.**

도구 배치, 단축키, 한국어판 메뉴 이름, 레이어를 우클릭했을 때 나오는 메뉴 순서까지 최대한 똑같이 맞췄습니다.
오픈 소스 웹 편집기 miniPaint를 바탕으로 시작했고, 화면 구성과 편집 기능 대부분을 새로 만든 뒤 Windows 앱으로 묶었어요.

사진은 어디에도 올라가지 않습니다. AI 기능도 전부 내 컴퓨터 안에서 돌아가요.

이름 Limn(림)은 "그리다, 생생하게 묘사하다"라는 뜻의 영어 단어에서 가져왔습니다.

<br>

## 할 수 있는 것

**작업 화면**
도구 막대, 옵션 막대, 패널의 위치와 단축키가 포토샵과 같습니다. 패널과 도구 막대는 끌어서 원하는 곳으로 옮길 수 있어요.

**레이어**
레이어 마스크, 조정 레이어, 스마트 오브젝트, 혼합 모드, 레이어 스타일, 문자 레이어와 모양 레이어를 지원합니다.

**보정과 리터칭**
Camera Raw 필터, 레벨과 곡선 같은 조정, 스팟 복구 브러시, 복제 도장, 픽셀 유동화를 쓸 수 있어요.
내용 인식 비율로 피사체 모양은 그대로 둔 채 사진 비율을 바꿀 수 있고, 회전 보기 도구(R)로 화면만 돌려 놓고 작업할 수 있습니다.

**AI 기능**
오브젝트 선택, 내용 인식 채우기, AI 노이즈 감소가 있고 모두 인터넷 연결 없이 내 컴퓨터에서 처리됩니다.

**파일**
PSD 열기와 저장, 카메라 RAW 파일 열기, 16비트 편집을 지원합니다.

<br>

## 만들면서 고민했던 것들

**조정 레이어를 켜고 끌 때마다 버벅이던 문제**
처음엔 흑백이나 반전 같은 조정 레이어가 있으면 레이어 하나 켜고 끄는 데 0.1~0.3초씩 멈췄어요.
화면을 그릴 때마다 모든 픽셀을 처음부터 다시 계산하고 있었기 때문이었습니다.
결과를 기억해 두고, 화면에 보이는 부분만 계산하고, 간단한 조정은 그래픽 카드에 맡기도록 바꿨더니 대부분 0.015초 안팎으로 줄었어요.

**16비트 편집**
브라우저 캔버스는 8비트까지만 다룹니다. 그래서 레이어마다 16비트 원본을 따로 들고 있다가
보정은 16비트로 계산하고, 화면에 보여 줄 때만 8비트로 바꾸는 방식으로 만들었어요. 실행 취소를 해도 16비트 데이터가 그대로 돌아옵니다.

**내용 인식 비율**
사진에서 경계나 무늬가 가장 적은 픽셀 줄을 찾아 하나씩 빼거나 복제하는 방식(Seam Carving)입니다.
원본 크기에서 그대로 하면 너무 느려서, 작게 줄인 사본에서 순서를 구한 다음 원본에 적용했어요.
900만 화소 사진도 1초 안에 끝납니다.

**실행 취소를 믿을 수 있게**
편집기에서 실행 취소가 틀어지면 정말 곤란하잖아요.
메뉴 238개와 모든 도구, 무작위 조작을 섞어서 돌리는 자동 테스트를 만들었고,
작업하고 되돌리고 다시 했을 때 픽셀이 똑같은지 비교하면서 나온 버그들을 하나씩 고쳤습니다.

<br>

## 시스템 요구 사항 (Windows)

| 항목 | 최소 사양 | 권장 사양 |
|---|---|---|
| 운영체제 | Windows 10 64비트 (버전 22H2) | Windows 11 64비트 |
| CPU | Intel Core i3 8세대 / AMD Ryzen 3 2000 시리즈 또는 동급 | Intel Core i5 10세대 / AMD Ryzen 5 3600 또는 동급 이상 |
| 메모리 | 8GB | 16GB 이상 |
| 그래픽 | Intel UHD Graphics 620 / AMD Radeon Vega 8 / NVIDIA GeForce GTX 950 또는 동급 | NVIDIA GeForce GTX 1050 Ti / AMD Radeon RX 570 / Intel Iris Xe 또는 동급 이상 |
| 저장 공간 | 4GB 이상 여유 공간 | 20GB 이상 여유 공간 |
| 해상도 | 1280 × 800 | 1920 × 1080 이상 |

지원하지 않는 환경
- Windows 32비트
- Windows on ARM
- macOS, Linux (현재 미지원)

참고
- 고화소 RAW나 16비트 편집, 레이어가 많은 작업은 메모리 32GB 이상을 권장합니다.
- 그래픽 드라이버는 최신으로 유지해 주세요. 그래픽 가속을 쓸 수 없으면 AI 기능이 CPU로 실행되어 시간이 더 걸립니다.

<br>

## 직접 실행해 보기

[Node.js](https://nodejs.org/) 20.9 이상이 필요합니다. Windows 앱으로 빌드하려면 [Rust](https://www.rust-lang.org/tools/install)도 설치해 주세요.

브라우저에서 실행하기
```bash
npm install
npm run models
npm run build
npm start
```
`npm start` 후에 http://localhost:8080 으로 들어가면 됩니다.

AI 모델 파일은 용량이 커서 저장소에 넣지 않았어요. `npm run models`를 한 번 실행하면 Hugging Face에서 받아 `models/` 폴더에 넣어 줍니다. 약 340MB예요.

Windows 앱 만들기
```bash
npm run build
npm run app
```
완성된 설치 파일은 `release/Limn.exe`에 생깁니다.

<br>

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

<br>

## 폴더 구성

```
src/js/core/      편집 엔진 (레이어 그리기, 선택 영역, 16비트, 실행 취소, 단축키, AI)
src/js/core/gui/  작업 화면, 도구 막대, 패널, 대화상자
src/js/tools/     도구 (도구 하나에 파일 하나)
src/js/modules/   메뉴 명령 (파일, 편집, 이미지, 레이어, 선택, 필터)
src/js/actions/   실행 취소가 되는 작업 단위
src/css/          화면 스타일
src-tauri/        Windows 앱 설정
tools/            실행, 빌드, 모델 받기 스크립트
```

<br>

## 아직 못 한 것

생성형 채우기, 퍼펫 뒤틀기, CMYK 모드는 아직 없어요.
그룹이 복잡하게 얽힌 문서에서 아주 가끔 실행 취소 결과가 어긋나는 경우가 있고,
색조/채도나 색상 균형 같은 일부 조정 레이어는 아직 CPU로 계산해서 큰 사진에서는 조금 느릴 수 있습니다.
하나씩 고쳐 나가려고 해요.

<br>

## 사용한 오픈 소스

Limn은 [miniPaint](https://github.com/viliusle/miniPaint)(MIT)를 바탕으로 만들었습니다.
그 밖에 아래 오픈 소스를 사용하고 있어요.

| 이름 | 쓰인 곳 | 라이선스 |
|---|---|---|
| [Tauri](https://tauri.app/) | Windows 앱 | MIT / Apache-2.0 |
| [ONNX Runtime Web](https://onnxruntime.ai/) | AI 모델 실행 | MIT |
| [Transformers.js](https://github.com/huggingface/transformers.js) | 오브젝트 선택 모델 실행 | Apache-2.0 |
| [ag-psd](https://github.com/Agamnentzar/ag-psd) | PSD 읽기와 저장 | MIT |
| [LibRaw](https://www.libraw.org/) | RAW 현상 | LGPL-2.1 / CDDL-1.0 |
| [SlimSAM](https://huggingface.co/Xenova/slimsam-77-uniform) | 오브젝트 선택, 피사체 선택 | Apache-2.0 |
| [LaMa](https://github.com/advimman/lama) | 내용 인식 채우기 | Apache-2.0 |
| [NAFNet](https://github.com/megvii-research/NAFNet) | AI 노이즈 감소 | MIT |

AI 모델의 라이선스는 원본 모델을 기준으로 적었습니다.

<br>

## 라이선스

MIT 라이선스를 따릅니다. 자세한 내용은 [MIT-LICENSE.txt](MIT-LICENSE.txt)에 있어요. miniPaint의 저작권 표시도 함께 들어 있습니다.

Photoshop은 Adobe의 상표이고, Limn은 Adobe와 관계없는 개인 프로젝트입니다.
