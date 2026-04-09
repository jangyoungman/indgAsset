# 자산관리 MCP 서버 설계

## 개요

Claude Code에서 자산관리 시스템을 직접 조작할 수 있는 MCP(Model Context Protocol) 서버.
사용자가 자연어로 요청하면 Claude가 MCP 도구를 호출하여 자산 CRUD 작업을 수행한다.

## 아키텍처

```
Claude Code → MCP Server (stdio) → SSH Tunnel → EC2 MySQL (asset_management)
```

- **런타임**: Node.js
- **프로토콜**: MCP (stdio transport)
- **DB 접속**: SSH 터널 경유 (`localhost:33060 → EC2:3306`)
- **위치**: `/home/neon/project/indgAsset/mcp-server/`

## DB 접속

EC2 보안그룹이 외부 MySQL 접속을 차단하므로 SSH 터널을 사용한다.

- MCP 서버 시작 시 `ssh -L 33060:localhost:3306` 터널 자동 생성
- mysql2/promise로 `localhost:33060` 연결
- SSH 키: `/home/neon/project/indgAsset/aws-key.pem`
- EC2: `ubuntu@3.130.223.104`
- DB: `indg` / `asset_management`

## MCP 도구

### list_assets — 자산 목록 조회

- **파라미터**:
  - `status` (optional): available, in_use, maintenance, disposed
  - `category` (optional): 카테고리명 (노트북, 모니터 등)
  - `search` (optional): 자산명/코드/시리얼번호 검색
  - `include_deleted` (optional, default: false): deleted 상태 포함 여부
  - `page` (optional, default: 1): 페이지 번호
  - `limit` (optional, default: 20): 페이지당 건수
- **동작**: SELECT 쿼리, `status != 'deleted'` 기본 필터 적용
- **반환**: 자산 목록 + 페이지네이션 정보

### get_asset — 자산 상세 조회

- **파라미터**:
  - `id` (optional): 자산 ID
  - `asset_code` (optional): 자산 코드 (예: AST-2026-001)
  - 둘 중 하나 필수
- **동작**: 자산 정보 + 카테고리명 JOIN 조회
- **반환**: 자산 상세 정보 전체 필드

### create_asset — 자산 등록

- **파라미터**:
  - `name` (required): 자산명
  - `category` (required): 카테고리명
  - `serial_number` (optional): 시리얼번호
  - `mac_address` (optional): MAC 주소
  - `manufacturer` (optional): 제조사
  - `model` (optional): 모델명
  - `purchase_date` (optional): 구매일 (YYYY-MM-DD)
  - `purchase_cost` (optional): 구매가격
  - `warranty_expiry` (optional): 보증만료일 (YYYY-MM-DD)
  - `location` (optional): 위치
  - `status` (optional, default: available): 초기 상태
  - `notes` (optional): 비고
- **동작**:
  1. category명으로 category_id 조회
  2. 자산코드 자동생성 (AST-{구매연도}-{순번})
  3. INSERT INTO assets
  4. asset_logs에 'created' 기록
- **반환**: 생성된 자산 ID, 자산코드

### update_asset — 자산 정보 수정

- **파라미터**:
  - `id` 또는 `asset_code` (필수): 대상 자산 식별
  - 나머지 필드는 create_asset과 동일 (모두 optional, 전달된 필드만 수정)
- **동작**:
  1. 대상 자산 존재 확인
  2. UPDATE assets SET ... WHERE id = ?
  3. asset_logs에 'updated' 기록 (변경 전/후 값 포함)
- **반환**: 수정된 자산 정보

### change_status — 상태 변경

- **파라미터**:
  - `id` 또는 `asset_code` (필수): 대상 자산 식별
  - `status` (required): 변경할 상태 (available, in_use, maintenance, disposed)
  - `reason` (optional): 상태 변경 사유
- **동작**:
  1. 현재 상태 확인
  2. UPDATE assets SET status = ?
  3. asset_logs에 상태 변경 기록
- **반환**: 변경 전/후 상태

### delete_asset — 소프트 삭제

- **파라미터**:
  - `id` 또는 `asset_code` (필수): 대상 자산 식별
  - `reason` (optional): 삭제 사유
- **동작**:
  1. 현재 상태가 'disposed'인지 확인 (아니면 거부)
  2. UPDATE assets SET status = 'deleted'
  3. asset_logs에 'deleted' 기록 (자산 정보 스냅샷 포함)
- **반환**: 삭제된 자산 정보

### get_asset_logs — 자산 이력 조회

- **파라미터**:
  - `id` 또는 `asset_code` (필수): 대상 자산 식별
- **동작**: asset_logs 테이블 조회 (최신순)
- **반환**: 이력 목록 (action, details, created_at)

## 소프트 삭제

### DB 변경

```sql
ALTER TABLE assets MODIFY COLUMN status
  ENUM('available','in_use','maintenance','disposed','deleted') DEFAULT 'available';
```

### 규칙

- `delete_asset`은 `disposed` 상태인 자산만 `deleted`로 변경 가능
- `list_assets`는 기본적으로 `deleted` 제외, `include_deleted: true`로 포함 가능
- 기존 웹 UI는 `deleted` 상태를 인식하지 않으므로 자동으로 필터링됨
- `asset_logs`와 `asset_assignments` 데이터는 보존됨

## 로깅

- 모든 쓰기 작업에서 `asset_logs`에 기록
- `user_id = 0` (MCP 시스템 계정)
- `details` JSON에 `"source": "mcp"` 포함하여 MCP 경유 작업 구분

```json
{
  "source": "mcp",
  "action_detail": "상태 변경",
  "before": "available",
  "after": "in_use",
  "reason": "사용자 요청"
}
```

## 설정

### 환경변수 (.env)

```
SSH_KEY_PATH=/home/neon/project/indgAsset/aws-key.pem
SSH_HOST=3.130.223.104
SSH_USER=ubuntu
SSH_TUNNEL_PORT=33060
DB_HOST=localhost
DB_PORT=3306
DB_USER=indg
DB_PASSWORD=dlshekdla2016!
DB_NAME=asset_management
MCP_USER_ID=0
```

### Claude Code 등록

`~/.claude/settings.json`에 MCP 서버 등록:

```json
{
  "mcpServers": {
    "asset-management": {
      "command": "node",
      "args": ["/home/neon/project/indgAsset/mcp-server/index.js"],
      "env": {}
    }
  }
}
```

## 파일 구조

```
mcp-server/
  index.js          # MCP 서버 진입점, 도구 등록
  db.js             # SSH 터널 + MySQL 연결 관리
  tools/
    list-assets.js
    get-asset.js
    create-asset.js
    update-asset.js
    change-status.js
    delete-asset.js
    get-asset-logs.js
  package.json
  .env
```
