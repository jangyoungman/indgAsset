-- =============================================
-- 자산관리 시스템 데이터베이스 스키마
-- Tech: MySQL / MariaDB
-- =============================================

CREATE DATABASE IF NOT EXISTS asset_management
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

USE asset_management;

-- ----- 1. 부서 테이블 -----
CREATE TABLE departments (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(100)  NOT NULL,
  code        VARCHAR(20)   NOT NULL UNIQUE,
  created_at  TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ----- 2. 사용자 테이블 -----
-- role: 'admin' | 'manager' | 'user'
CREATE TABLE users (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  email         VARCHAR(255)  NOT NULL UNIQUE,
  password_hash VARCHAR(255)  NOT NULL,
  name          VARCHAR(100)  NOT NULL,
  role          ENUM('admin','manager','user') NOT NULL DEFAULT 'user',
  department_id INT           NULL,
  phone         VARCHAR(20)   NULL,
  is_active     BOOLEAN       DEFAULT TRUE,
  login_fail_count INT        DEFAULT 0,
  locked_at     TIMESTAMP     NULL,
  must_change_password BOOLEAN DEFAULT FALSE,
  created_at    TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ----- 3. 자산 카테고리 테이블 -----
CREATE TABLE asset_categories (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(100)  NOT NULL,
  description TEXT          NULL,
  parent_id   INT           NULL,
  created_at  TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (parent_id) REFERENCES asset_categories(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ----- 4. 자산 테이블 -----
-- status: 'available' | 'in_use' | 'maintenance' | 'disposed'
CREATE TABLE assets (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  asset_code      VARCHAR(50)   NOT NULL UNIQUE,       -- 자산 고유 코드 (예: IT-2024-001)
  name            VARCHAR(200)  NOT NULL,
  category_id     INT           NULL,
  description     TEXT          NULL,
  serial_number   VARCHAR(100)  NULL,
  manufacturer    VARCHAR(100)  NULL,
  model           VARCHAR(100)  NULL,
  purchase_date   DATE          NULL,
  purchase_cost   DECIMAL(15,2) NULL,
  warranty_expiry DATE          NULL,
  location        VARCHAR(200)  NULL,
  status          ENUM('available','in_use','maintenance','disposed') DEFAULT 'available',
  department_id   INT           NULL,
  assigned_to     INT           NULL,                   -- 현재 사용자
  image_url       VARCHAR(500)  NULL,
  notes           TEXT          NULL,
  created_at      TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (category_id)   REFERENCES asset_categories(id) ON DELETE SET NULL,
  FOREIGN KEY (department_id) REFERENCES departments(id)      ON DELETE SET NULL,
  FOREIGN KEY (assigned_to)   REFERENCES users(id)            ON DELETE SET NULL
) ENGINE=InnoDB;

-- ----- 5. 자산 대여/반납 기록 -----
-- status: 'requested' | 'approved' | 'rejected' | 'checked_out' | 'returned'
CREATE TABLE asset_assignments (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  asset_id        INT           NOT NULL,
  user_id         INT           NOT NULL,               -- 요청자
  approved_by     INT           NULL,                   -- 승인자 (관리자 or 부서장)
  status          ENUM('requested','approved','rejected','checked_out','returned') DEFAULT 'requested',
  request_date    TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
  approved_date   TIMESTAMP     NULL,
  checkout_date   TIMESTAMP     NULL,
  expected_return DATE          NULL,
  actual_return   TIMESTAMP     NULL,
  request_note    TEXT          NULL,
  return_note     TEXT          NULL,
  FOREIGN KEY (asset_id)    REFERENCES assets(id)  ON DELETE CASCADE,
  FOREIGN KEY (user_id)     REFERENCES users(id)   ON DELETE CASCADE,
  FOREIGN KEY (approved_by) REFERENCES users(id)   ON DELETE SET NULL
) ENGINE=InnoDB;

-- ----- 6. 승인 워크플로우 -----
-- action: 'asset_request' | 'asset_return' | 'asset_dispose' | 'asset_maintenance'
-- status: 'pending' | 'approved' | 'rejected'
CREATE TABLE approval_workflows (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  action_type     ENUM('asset_request','asset_return','asset_dispose','asset_maintenance') NOT NULL,
  reference_id    INT           NOT NULL,               -- 연관 레코드 ID (assignment_id 등)
  requester_id    INT           NOT NULL,
  approver_id     INT           NULL,
  status          ENUM('pending','approved','rejected') DEFAULT 'pending',
  request_note    TEXT          NULL,
  response_note   TEXT          NULL,
  created_at      TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
  resolved_at     TIMESTAMP     NULL,
  FOREIGN KEY (requester_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (approver_id)  REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ----- 7. 알림 테이블 -----
CREATE TABLE notifications (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  user_id     INT           NOT NULL,
  title       VARCHAR(200)  NOT NULL,
  message     TEXT          NOT NULL,
  link        VARCHAR(500)  NULL,
  is_read     BOOLEAN       DEFAULT FALSE,
  created_at  TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ----- 8. 자산 이력 로그 -----
CREATE TABLE asset_logs (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  asset_id    INT           NOT NULL,
  user_id     INT           NULL,
  action      VARCHAR(50)   NOT NULL,       -- 'created','updated','assigned','returned','disposed' 등
  details     JSON          NULL,           -- 변경 상세 (이전값/이후값)
  created_at  TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id)  REFERENCES users(id)  ON DELETE SET NULL
) ENGINE=InnoDB;

-- ----- 인덱스 -----
CREATE INDEX idx_assets_status       ON assets(status);
CREATE INDEX idx_assets_department   ON assets(department_id);
CREATE INDEX idx_assets_category     ON assets(category_id);
CREATE INDEX idx_assignments_status  ON asset_assignments(status);
CREATE INDEX idx_workflows_status    ON approval_workflows(status);
CREATE INDEX idx_notifications_user  ON notifications(user_id, is_read);
CREATE INDEX idx_logs_asset          ON asset_logs(asset_id);

-- ----- 샘플 데이터 -----
INSERT INTO departments (name, code) VALUES
  ('IT팀', 'IT'),
  ('경영지원팀', 'MGMT'),
  ('개발팀', 'DEV'),
  ('마케팅팀', 'MKT');

-- 기본 관리자 계정 (비밀번호: admin123 → bcrypt hash)
INSERT INTO users (email, password_hash, name, role, department_id) VALUES
  ('admin@company.com', '$2b$10$placeholder_hash_replace_me', '시스템관리자', 'admin', 1);

INSERT INTO asset_categories (name, description) VALUES
  ('노트북', 'IT 노트북/랩탑'),
  ('모니터', '디스플레이 모니터'),
  ('사무가구', '책상, 의자 등'),
  ('소프트웨어', '소프트웨어 라이선스'),
  ('차량', '업무용 차량'),
  ('사무기기', '프린터, 복합기 등');
