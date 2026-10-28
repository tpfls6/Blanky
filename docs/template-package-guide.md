# 커스텀 템플릿 패키지 가이드

Blanky는 `.blankytpl`(또는 `.json`) 파일로 페이지·기록 템플릿을 가져옵니다. 이 문서는 저장소의 검증·설치·렌더링 코드를 기준으로 한 규격입니다. 필드 이름이나 블록 종류를 추측하지 말고, 아래 타입과 예제를 그대로 쓰세요.

## 지금 사용할 수 있는 곳

| 위치 | `.blankytpl` 가져오기 |
| --- | --- |
| 배포 앱 | 아직 없습니다. 이 기능을 배포하지 않았습니다. |
| GitHub `main` | 아직 없습니다. 문서·엔진이 이 PR 브랜치에만 있습니다. |
| 브랜치 `feat/blankytpl-package` | 로컬에서 `npm run dev`로 실행하면 커스텀 화면에서 가져올 수 있습니다. |

예제 파일은 병합 전에 [브랜치 raw](https://github.com/tpfls6/Blanky/raw/feat/blankytpl-package/examples/workout-record.blankytpl)에서 받으세요.

- 예제 파일: [`examples/workout-record.blankytpl`](../examples/workout-record.blankytpl)
- 검증기: `src/template/package/TemplateValidator.ts`
- 페이지 블록: `src/features/builder/schema.ts`
- 기록(컬렉션) 블록: `src/features/records/schema.ts`

## 한 줄로 만드는 방법

1. [`examples/workout-record.blankytpl`](../examples/workout-record.blankytpl)을 다운로드하거나 복사합니다.
2. JSON에서 `id`, `name`, `snapshot.blocks`, `snapshot.collections`만 고칩니다.
3. 확장자를 `.blankytpl`로 저장합니다. 내용은 일반 JSON입니다.
4. 앱에서 **커스텀** 화면 → **`.blankytpl` 파일 가져오기**로 파일을 올립니다.
5. 미리보기를 확인한 뒤 **템플릿 추가** → **페이지 만들기** 또는 **기록 만들기**를 누릅니다.

`blocks: []`와 `collections: []`만 있으면 가져오기는 성공합니다. 미리보기에는 “표시할 내용이 없는 템플릿입니다”가 나오고, **템플릿 추가**는 그대로 할 수 있습니다. 페이지에 보일 블록과 기록에 입력할 필드를 각각 넣어야 본문이 보입니다.

## 패키지 전체 규격

지원하는 파일은 두 가지입니다.

| 형식 | 확장자 | 내용 |
| --- | --- | --- |
| JSON 한 파일 | `.blankytpl`, `.json` | 매니페스트 필드와 `snapshot`을 한 객체에 둡니다. |
| ZIP | `.blankytpl` | `manifest.json` + `template.json`(또는 `entry.template`) + `assets/`, `preview/` 이미지만 허용합니다. |

JSON 한 파일이면 충분합니다. ZIP은 미리보기 이미지가 필요할 때만 씁니다. 패키지 최대 크기는 20MB, JSON은 256KB입니다.

### 최상위 필드

`kind`가 `blanky.template-package`이면 아래 필드를 읽습니다. `manifest` 객체를 따로 싸도 되고, 최상위에 그대로 둬도 됩니다.

| 필드 | 필수 | 규칙 |
| --- | --- | --- |
| `formatVersion` | 예 | 숫자 `1`만 허용합니다. |
| `kind` | 권장 | `blanky.template-package`. 다른 값이면 거절합니다. 생략하면 JSON 패키지로 처리합니다. |
| `id` | 예 | `^[a-zA-Z0-9][a-zA-Z0-9_-]*$`, 최대 100자. 예: `workout-record`. |
| `name` | 예 | 비어 있으면 안 됩니다. 최대 80자. |
| `version` | 예 | semver `1.0.0` 또는 `1.0.0-beta`. |
| `pageType` | 아니오 | `page` \| `record` \| `diary` \| `reading` \| `memo`. 없거나 잘못된 값은 `page`입니다. |
| `author` | 아니오 | 최대 100자. 없으면 빈 문자열. |
| `description` | 아니오 | 최대 2000자. |
| `icon` | 아니오 | Lucide 아이콘 이름. 기본값 `StickyNote`. `Dumbbell`, `BookOpen`, `Film`처럼 `src/constants/icons.ts`에 있는 이름을 쓰세요. |
| `snapshot` | `record`/`page`는 예 | 페이지 본문과 컬렉션. `diary`/`reading`/`memo`만 생략할 수 있습니다. |
| `fieldLabels` | 시스템 페이지만 | `diary`/`reading`/`memo`의 화면 라벨 덮어쓰기. |
| `entry` | ZIP만 | `{ "template": "template.json" }`. JSON 한 파일에서는 무시해도 됩니다. |
| `assets`, `preview`, `files` | ZIP/이미지 | 이미지 MIME만 허용합니다. 경로는 `assets/` 또는 `preview/` 아래여야 합니다. |

`id`에 한글, 공백, `../`를 넣으면 검증에 실패합니다.

### `pageType`이 하는 일

| `pageType` | 가져오기 후 동작 |
| --- | --- |
| `record` 또는 `page` | `snapshot`이 필요합니다. **페이지 만들기**는 스냅샷을 복제해 사용자 페이지를 만듭니다. 컬렉션이 있으면 **기록 만들기**도 생깁니다. |
| `diary`, `reading`, `memo` | 스냅샷 없이 라벨만 바꿔 시스템 페이지를 만듭니다. 아래 기록 블록 JSON은 쓰지 않습니다. |

`record`와 `page`의 차이는 거의 없습니다. 스냅샷에 컬렉션이 있으면 둘 다 기록 테이블을 렌더링합니다.

## 두 종류의 블록

템플릿에는 서로 다른 블록 엔진이 두 개 있습니다. 한쪽에 넣은 타입은 다른쪽에서 버려집니다.

```text
snapshot.blocks          → 페이지 캔버스 (BuilderBlock)
snapshot.collections[].blocks → 기록 입력 폼 (Record Block)
```

페이지 본문을 `snapshot.blocks`에 두고, 입력 칸은 `snapshot.collections`에 둡니다. 컬렉션을 화면에 붙이려면 페이지 블록에 `type: "collection"`을 넣고 `props.collectionId`를 컬렉션 `id`와 같게 맞춥니다.

## `snapshot`

검증기는 `title`(또는 `name`)과 `blocks`, `collections`를 페이지로 읽습니다. `id`가 없으면 `snapshot`으로 채웁니다.

| 필드 | 필수 | 기본값 | 제한 |
| --- | --- | --- | --- |
| `version` | 아니오 | 저장 시 `1` | 숫자 |
| `title` | 사실상 예 | `name` 또는 `템플릿` | 페이지 제목 |
| `icon` | 아니오 | 매니페스트 `icon` 또는 `StickyNote` | |
| `description` | 아니오 | `""` | |
| `blocks` | 아니오 | `[]` | 페이지 블록. 중첩 포함 최대 80개 |
| `collections` | 아니오 | `[]` | 최대 12개 |
| `samples` | 아니오 | `[]` | 미리보기용 예제 행. 최대 20개 |
| `guide` | 아니오 | `""` | 최대 4000자 |
| JSON 크기 | — | — | 스냅샷 JSON 최대 200KB |

빈 `blocks`는 오류가 아닙니다. 미리보기와 생성 페이지에 본문이 안 나올 뿐입니다. 페이지 생성 시 블록이 하나도 없으면 빈 텍스트 블록 하나가 들어갑니다.

## 페이지 블록 (`snapshot.blocks`)

각 블록은 `id`(문자열)와 `type`이 있어야 합니다. `id`가 없거나 `type`이 목록에 없으면 **그 블록만 조용히 버려집니다.** 패키지 전체가 실패하지는 않습니다.

```json
{ "id": "heading-1", "type": "heading", "props": { "level": 1, "text": "운동 기록", "span": 3 } }
```

`children`은 `toggle`, `columns`, `column`만 유지합니다. 다른 타입에 넣으면 검증 후 사라집니다.

### 공통 `props`

| 속성 | 타입 | 설명 |
| --- | --- | --- |
| `text` | string | 제목, 본문, 링크 라벨 |
| `span` | `1` \| `2` \| `3` | 가로 폭. 컬렉션·제목은 보통 `3` |
| `background`, `color` | string | 배경·글자색 |
| `align` | `left` \| `center` \| `right` | |
| `padding` | `sm` \| `md` \| `lg` | |
| `border` | `true`만 인식 | `false`는 기본과 같습니다 |
| `hideContent` | `true`만 인식 | |

### 지원 타입과 예제

**텍스트**

```json
{ "id": "p1", "type": "text", "props": { "text": "오늘 한 운동을 남깁니다." } }
```

**제목** — `level`은 `1` \| `2` \| `3`. 없거나 다른 값이면 `2`.

```json
{ "id": "h1", "type": "heading", "props": { "level": 1, "text": "운동 기록" } }
```

**글머리 / 번호 / 할 일 / 인용**

```json
{ "id": "b1", "type": "bullet", "props": { "text": "워밍업" } }
{ "id": "n1", "type": "numbered", "props": { "text": "스쿼트" } }
{ "id": "k1", "type": "check", "props": { "text": "스트레칭", "checked": false } }
{ "id": "q1", "type": "quote", "props": { "text": "기록이 습관을 만든다." } }
```

**구분선**

```json
{ "id": "d1", "type": "divider", "props": {} }
```

**이미지 / 링크 / 북마크 / 버튼** — `url`은 `http://` 또는 `https://`만 남습니다. 그 외 값은 빈 문자열로 바뀝니다.

```json
{ "id": "img1", "type": "image", "props": { "url": "https://example.com/cover.png", "alt": "커버" } }
{ "id": "link1", "type": "link", "props": { "text": "Blanky", "url": "https://example.com" } }
{ "id": "bm1", "type": "bookmark", "props": { "text": "문서", "url": "https://example.com" } }
{ "id": "btn1", "type": "button", "props": { "text": "열기", "url": "https://example.com" } }
```

읽기 모드에서 `url`이 비면 이미지·링크는 화면에 아무것도 그리지 않습니다.

**콜아웃 / 토글**

```json
{ "id": "c1", "type": "callout", "props": { "text": "운동 전 스트레칭", "icon": "Lightbulb" } }
{
  "id": "t1",
  "type": "toggle",
  "props": { "text": "더보기" },
  "children": [
    { "id": "t1-a", "type": "text", "props": { "text": "숨긴 설명" } }
  ]
}
```

**단** — `columns` 안에만 `column`을 둡니다. `width`는 1–100, 기본 50.

```json
{
  "id": "cols",
  "type": "columns",
  "props": {},
  "children": [
    {
      "id": "col-a",
      "type": "column",
      "props": { "width": 50 },
      "children": [{ "id": "col-a-text", "type": "text", "props": { "text": "왼쪽" } }]
    },
    {
      "id": "col-b",
      "type": "column",
      "props": { "width": 50 },
      "children": [{ "id": "col-b-text", "type": "text", "props": { "text": "오른쪽" } }]
    }
  ]
}
```

**컬렉션(기록 표)** — `collectionId`는 `snapshot.collections[].id`와 같아야 합니다. 다르면 페이지에 “컬렉션을 찾을 수 없음”이 나옵니다.

```json
{
  "id": "table-1",
  "type": "collection",
  "props": {
    "collectionId": "col-workout",
    "view": "table",
    "text": "운동 기록",
    "span": 3
  }
}
```

`view`: `table` \| `card` \| `gallery` \| `calendar` \| `kanban` \| `chart`. 기본값 `table`.

**위젯** — 앱의 일정·메모 등을 페이지에 붙입니다. 기록 필드가 아닙니다.

```json
{ "id": "w-cal", "type": "widget-calendar", "props": {} }
```

허용 타입: `widget-calendar`, `widget-tasks`, `widget-memos`, `widget-diary`, `widget-reading`, `widget-activity`, `widget-today`, `widget-planner`.

없는 타입 예: `script`, `javascript`, `video`, `embed`. 이런 값은 버려집니다.

## 컬렉션 (`snapshot.collections`)

컬렉션 하나가 기록 유형 하나입니다. **기록 만들기**는 첫 번째 컬렉션만 사용합니다.

| 필드 | 필수 | 기본값 |
| --- | --- | --- |
| `id` | 예 | 없으면 컬렉션 전체가 버려집니다. |
| `name` | 예 | 공백이면 버려집니다. |
| `icon` | 아니오 | `StickyNote` |
| `color` | 아니오 | `#3A62B0` |
| `description` | 아니오 | `""` |
| `blocks` | 아니오 | 제목 필드만 자동 추가 |
| `schemaVersion` / `version` | 아니오 | `1` |

컬렉션 필드(기록 블록)는 최대 40개입니다. `id`가 없으면 생성합니다. 입력 칸(`title`, `number` 등)에 `fieldKey`가 없으면 `id`를 씁니다.

제목 블록(`type: "title"`)이 없으면 검증기가 하나 붙입니다. 제목은 지우거나 토글 안에 넣을 수 없습니다.

### 기록 블록 타입

입력 칸과 장식 블록이 섞여 있습니다. 입력 칸만 `fieldKey`를 갖습니다.

**입력 칸:** `title`, `textField`, `longText`, `number`, `date`, `time`, `dateTime`, `checkbox`, `select`, `multiSelect`, `url`, `image`, `rating`, `progress`, `tags`

**장식:** `text`, `heading`, `divider`, `callout`, `quote`, `toggle`, `spacer`, `checklist`

토글 중첩은 한 단계만 됩니다. 토글 안에 토글·제목을 넣으면 그 자식은 버려집니다.

### 기록 블록 예제

**제목 / 짧은 텍스트 / 긴 텍스트**

```json
{
  "id": "field-title",
  "type": "title",
  "fieldKey": "exercise",
  "props": { "label": "운동 종목", "placeholder": "스쿼트", "required": true }
}
{
  "id": "field-note",
  "type": "textField",
  "fieldKey": "place",
  "props": { "label": "장소", "placeholder": "헬스장", "width": "full" }
}
{
  "id": "field-memo",
  "type": "longText",
  "fieldKey": "memo",
  "props": { "label": "메모", "placeholder": "컨디션이나 특이사항" }
}
```

**숫자 / 날짜 / 시간**

```json
{
  "id": "field-weight",
  "type": "number",
  "fieldKey": "weight",
  "props": { "label": "중량", "unit": "kg", "min": 0, "max": 500 }
}
{ "id": "field-date", "type": "date", "fieldKey": "date", "props": { "label": "날짜" } }
{ "id": "field-time", "type": "time", "fieldKey": "time", "props": { "label": "시작 시간" } }
```

`rating`은 1–5, `progress`는 0–100입니다. `checkbox`의 `defaultValue`는 `true`/`false`입니다.

**선택**

```json
{
  "id": "field-kind",
  "type": "select",
  "fieldKey": "kind",
  "props": {
    "label": "종류",
    "options": [
      { "id": "weights", "label": "웨이트", "color": "#3C8664" },
      { "id": "cardio", "label": "유산소", "color": "#3A62B0" }
    ]
  }
}
```

`options[].label`이 없으면 그 항목은 버려집니다. `id`나 `color`가 없으면 라벨·기본 색으로 채웁니다.

**URL / 이미지** — 기본값이 `javascript:` 같은 주소면 검증기가 `defaultValue`를 지웁니다. 실제 값은 `http://` 또는 `https://`만 통과합니다.

```json
{
  "id": "field-url",
  "type": "url",
  "fieldKey": "link",
  "props": { "label": "참고 링크", "placeholder": "https://" }
}
```

페이지 블록의 `text`/`heading`과 기록 블록의 `text`/`heading`은 이름이 같아도 다른 엔진입니다. 기록 폼 필드를 `snapshot.blocks`에 넣으면 페이지에서 사라집니다.

### `samples`

미리보기 표에 넣을 예제 행입니다. `collectionId`는 컬렉션 `id`와 같아야 하고, `values`의 키는 `fieldKey`와 같아야 합니다.

```json
{
  "collectionId": "col-workout",
  "title": "스쿼트",
  "values": {
    "exercise": "스쿼트",
    "sets": 4,
    "reps": 8,
    "weight": 60,
    "memo": "마지막 세트는 조금 힘들었음"
  }
}
```

커스텀 화면에서 **페이지 만들기**를 누르면 예제 행은 복사하지 않습니다. 스토어 설치 경로만 샘플을 실제 기록으로 넣습니다. 미리보기에는 그대로 보입니다.

## ID와 참조

- 페이지 블록 `id`는 파일 안에서 고유한 문자열이면 됩니다. 설치 시 새 UUID로 바뀝니다.
- 컬렉션 `id`는 페이지의 `collection.props.collectionId`와 같아야 합니다. 설치 시 둘 다 같은 새 UUID로 다시 연결됩니다.
- 기록 필드 `fieldKey`는 그 컬렉션 안에서 고유해야 합니다. 설치 시 새 키로 바뀌고, `samples.values`도 같이 옮깁니다. 없는 키는 샘플에서 빠집니다.
- 이미 만든 기록의 `typeId`는 설치본 컬렉션 `id`가 아니라, 생성 시점에 새로 만든 UUID입니다.

## 가져오기부터 저장까지

실제 코드 경로입니다.

1. **파일 선택** — `src/pages/Custom/PackageControls.tsx`의 `TemplateImport`. 확장자가 `.blankytpl` 또는 `.json`이 아니면 거절합니다.
2. **디코드** — `TemplateLoader.importTemplatePackages`. ZIP이면 `manifest.json`과 템플릿 JSON을 읽고, 아니면 JSON 전체를 파싱합니다.
3. **검증** — `validatePackage` → `validateManifest` + `readSnapshot`/`snapshotFromUnknown`. 페이지 블록은 `coerceBlock`, 컬렉션은 `coerceRecordType`.
4. **미리보기** — `pageType`이 일기/독서/메모면 시스템 미리보기, 아니면 `PageBuilder`가 `snapshot.blocks`를 그립니다. 컬렉션 블록은 `CollectionBlock`이 `snapshot.collections`를 찾아 표를 그립니다.
5. **설치** — `putTemplatePackage`가 IndexedDB `blanky-template-packages`에 검증된 패키지를 저장합니다. 사용자 페이지·기록과는 별도 저장소입니다.
6. **페이지 만들기** — `forkSnapshot`이 컬렉션·필드·옵션 ID를 새로 뽑고, `adoptInstalledPage`가 라이브러리에 페이지와 기록 유형을 넣습니다. 커스텀 가져오기에서는 샘플 기록을 넣지 않습니다 (`records: []`).
7. **기록 만들기** — 첫 컬렉션 블록을 `cloneBlock`한 뒤 `addRecordType`으로 기록 유형만 만듭니다. 페이지는 생기지 않습니다.
8. **렌더·저장** — 페이지는 `PageBuilder`/`CollectionView`, 기록 화면은 `RecordPage` + `CustomRecordRenderer`. 저장은 `addRecord`/`updateRecord`가 라이브러리와(설정된 경우) Supabase에 미러합니다.
9. **새로고침** — 기록은 라이브러리 상태와 미러 저장소에 남습니다. 템플릿 패키지를 지워도 이미 만든 기록 `id`는 그대로입니다.

같은 `id`가 이미 있으면 **교체** 또는 **별도 저장**만 할 수 있습니다. 버전 비교는 semver입니다.

## 본문이 안 보이는 조건

가져오기는 성공하는데 화면이 빈 경우는 오류가 아니라 아래 중 하나입니다.

| 원인 | 결과 |
| --- | --- |
| `blocks`와 `collections`가 모두 비어 있음 | 가져오기는 성공. 미리보기에 “표시할 내용이 없는 템플릿입니다”. **템플릿 추가**는 가능. |
| `snapshot.blocks`만 `[]` | 페이지 본문 없음. 컬렉션이 있으면 **기록 만들기**는 가능. |
| 페이지 블록에 `id` 없음 | 그 블록 삭제. |
| 페이지에 기록 필드 타입(`title`, `number` …)을 넣음 | 페이지 엔진이 몰라서 삭제. |
| `collections`가 비어 있음 | **기록 만들기** 버튼이 없음. 입력 폼도 없음. |
| 컬렉션에 `id`/`name` 없음 | 컬렉션 삭제. |
| `collectionId`가 컬렉션 `id`와 다름 | “컬렉션을 찾을 수 없음”. |
| 읽기 모드 제목/본문 `text`가 공백 | 텍스트 블록을 그리지 않음. |
| `url`이 비었거나 잘못된 이미지·링크 | 빈 칸. |
| `diary`인데 스냅샷만 기대한 경우 | 시스템 일기 화면만 열림. 스냅샷 블록은 안 씀. |

## 잘못된 블록 처리

파일 가져오기 검증기는 가능한 한 잘라서 통과시킵니다.

- 미지원 `type` → 그 블록만 삭제.
- 토글 과중첩, 제목을 토글 안에 넣음 → 그 자식만 삭제.
- 잘못된 URL 기본값 → 값만 삭제.
- HTML/`<script>`로 시작하는 파일, 경로 탈출, `.js` 자산, 용량 초과 → 패키지 전체 거절.

스토어에 올릴 때는 더 엄합니다(`src/features/marketplace/sanitize.ts`). HTTPS가 아닌 링크, 이메일·전화번호로 보이는 문자열은 공유를 막습니다. 로컬 `.blankytpl` 가져오기에는 이 검사가 없습니다.

## 템플릿과 기록의 수명

설치본(IndexedDB)과 사용자가 만든 페이지/기록(라이브러리)은 처음부터 복제본입니다.

| 동작 | 이미 만든 페이지/기록 |
| --- | --- |
| 템플릿 삭제 | 영향 없음. 기록 `id`와 값이 남습니다. |
| 같은 `id`로 교체 | 다음에 만드는 페이지만 새 스냅샷을 씁니다. 기존 기록 스키마는 그대로입니다. |
| 버전만 올린 파일 | 설치본 `version`만 바뀝니다. 기존 기록의 `templateVersion`은 생성 당시 값입니다. |
| 기록 화면에서 필드 수정 | 그 기록 유형의 `version`이 올라갑니다. 예전 기록은 “이전 버전에서 작성됨” 안내가 나고, 값은 `fieldKey`가 맞는 칸만 채워집니다. 새 필드는 빈 값, 사라진 키는 화면에 안 나옵니다. |

원본 템플릿을 바꿔도 이미 적은 운동 기록이 따라 바뀌지 않게 하려는 구조입니다.

## 권장 앱 구조

지금 코드가 이미 이 역할로 나뉘어 있습니다. 새로 엔진을 만들지 말고 여기를 재사용하세요.

```text
.blankytpl
  → TemplateLoader (파일/ZIP)
  → TemplateValidator (규격)
  → localPackages (설치본 IndexedDB)
  → forkSnapshot (ID 재발급)
  → Library (사용자 페이지·기록)
  → PageBuilder / CollectionView / Record Renderer
```

| 역할 | 현재 위치 | 상태 |
| --- | --- | --- |
| 패키지 규격 | `src/template/package/schema.ts` | 구현됨. `formatVersion: 1` |
| 검증기 | `TemplateValidator.ts` | 구현됨. 빈 본문은 경고하지 않음 |
| 설치본 저장소 | `src/services/templates/localPackages.ts` | 구현됨. 사용자 기록과 분리 |
| 페이지 생성기 | `forkSnapshot` + `adoptInstalledPage` / `addRecordType` | 구현됨. 커스텀 가져오기는 샘플 기록을 넣지 않음 |
| 블록 렌더러 | `PageBuilder`, `Renderer`, `CollectionView` | 구현됨. 두 엔진 재사용 |
| 외부 규격 문서·공식 예제 | 이 문서, `examples/` | 이번에 추가 |
| 빈 본문 경고, 여러 컬렉션 UI, 세트 반복 행 | — | 없음. 지금은 JSON으로 표현할 수 없음 |
| 설치본 교체 시 기존 기록 마이그레이션 | — | 없음. 의도적으로 분리 |

새 구조를 제안할 때도 이 파일 형식(`formatVersion: 1`, `kind: blanky.template-package`)과 두 블록 엔진을 유지하면 기존 패키지와 호환됩니다. 페이지 블록과 기록 블록을 한 스키마로 합치면 현재 검증기·렌더러와 맞지 않습니다.

## 예제 파일 고치기

[`examples/workout-record.blankytpl`](../examples/workout-record.blankytpl)은 운동 종목(`title`)·날짜(`date`)·세트/횟수/중량(`number`)·메모(`longText`)입니다.

바꿀 때:

1. `id`를 영문/숫자/하이픈으로 바꿉니다. 이미 설치한 템플릿과 같으면 교체 화면이 뜹니다.
2. `name`, `snapshot.title`, 페이지 `heading` 텍스트를 같이 바꿉니다.
3. 필드를 추가하려면 `collections[0].blocks`에 기록 블록을 넣고, 필요하면 `samples[0].values`에 같은 `fieldKey`를 넣습니다.
4. 페이지 표 제목만 바꾸려면 `snapshot.blocks`의 `heading`/`text`만 고칩니다.
5. 저장한 뒤 앱에서 다시 가져옵니다.

운동 앱처럼 **세트마다 행을 추가**하는 UI는 현재 엔진에 없습니다. 한 기록 = 한 종목이고, 세트·횟수·중량은 숫자 칸입니다. 종목 종류를 고르려면 `select`를 추가하면 됩니다.

날짜 필드는 요청 항목은 아니지만, 기록 목록에 날짜가 필요해서 예제에 넣었습니다. 빼도 검증은 통과합니다.

## 오류 메시지

| 메시지 | 원인 |
| --- | --- |
| 이 템플릿은 현재 Blanky 버전에서 지원하지 않는 형식입니다 | `formatVersion`이 `1`이 아님 |
| 이 파일은 Blanky 템플릿이 아닙니다 | `kind`가 다른 값 |
| 템플릿 ID, 이름 또는 버전이 올바르지 않습니다 | `id`/`name`/`version` 형식 |
| 템플릿 본문이 없습니다 | `record`/`page`인데 `snapshot` 없음 |
| 템플릿 구조가 올바르지 않습니다 | 스냅샷을 페이지로 읽지 못함 |
| 잘못된 JSON 파일입니다 | JSON 파싱 실패 |
| HTML 또는 스크립트 파일은 사용할 수 없습니다 | 파일이 `<`로 시작 |
| 블록이 너무 많습니다 / 필드가 너무 많습니다 / 템플릿이 너무 큽니다 | 제한 초과 |
| .blankytpl 파일만 가져올 수 있습니다 | 확장자 (앱 번역 문구) |

로컬에서 검증하려면:

```bash
npm run test:template-packages
```

이 테스트는 `examples/workout-record.blankytpl`을 실제 검증기로 읽습니다.

## GitHub에서 수정·기여하기

저장소에 별도의 기여 가이드 파일은 없습니다. 문서와 예제는 아래처럼 올리면 됩니다.

1. 저장소를 포크하거나 `main`에서 브랜치를 만듭니다.
2. 가이드는 `docs/template-package-guide.md`, 예제는 `examples/*.blankytpl`에 둡니다.
3. 예제를 바꿨으면 `npm run test:template-packages`가 통과하는지 확인합니다. 새 예제를 추가하면 `tests/templatePackage.test.ts`에 파일 경로를 한 줄 더 넣으세요.
4. 블록 종류는 이 문서와 `src/features/builder/schema.ts`, `src/features/records/schema.ts`와 같아야 합니다. 없는 타입을 예제에 넣지 마세요.
5. Pull Request를 엽니다. 제목에 문서/예제인지 밝히고, 검증 명령 결과를 적습니다.

앱 코드(검증기·렌더러)를 바꿀 때는 기존 `.blankytpl`이 깨지지 않는지 `tests/templatePackage.test.ts`부터 실행하세요.
