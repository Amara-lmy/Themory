-- ============================================================
-- 研忆 THEMORY · CloudBase PostgreSQL 初始化脚本
-- 用法：CloudBase 控制台 → SQL 型数据库 → SQL 编辑器 → 粘贴全部 → 执行
-- 说明：后端以服务端身份访问（绕过 RLS），user_id 隔离由后端代码强制保证
-- ============================================================

-- ====== 用户 ======
create table if not exists "users" (
  "id"           text primary key default gen_random_uuid()::text,
  "phone"        text unique,
  "wxOpenid"     text unique,
  "wxUnionid"    text,
  "nickname"     text not null default '研究者',
  "avatar"       text,
  "researchLevel" integer not null default 1,
  "points"       integer not null default 0,
  "createdAt"    timestamptz not null default now(),
  "updatedAt"    timestamptz not null default now(),
  "lastLoginAt"  timestamptz
);
create index if not exists "users_phone_idx" on "users" ("phone");

-- ====== 会话（Refresh Token）======
create table if not exists "sessions" (
  "id"           text primary key default gen_random_uuid()::text,
  "userId"       text not null references "users"("id") on delete cascade,
  "refreshToken" text not null unique,
  "expiresAt"    timestamptz not null,
  "createdAt"    timestamptz not null default now()
);
create index if not exists "sessions_userId_idx" on "sessions" ("userId");

-- ====== 论文 ======
create table if not exists "papers" (
  "id"           text primary key default gen_random_uuid()::text,
  "userId"       text not null references "users"("id") on delete cascade,
  "title"        text not null,
  "authors"      text not null default '',
  "venue"        text not null default '',
  "year"         text not null default '',
  "abstract"     text not null default '',
  "citation"     text not null default '',
  "doi"          text not null default '',
  "url"          text not null default '',
  "fileName"     text not null default '',
  "fileKey"      text not null default '',
  "fileType"     text not null default '',
  "fileSize"     integer not null default 0,
  "favorite"     boolean not null default false,
  "lastReadPage" integer not null default 1,
  "createdAt"    timestamptz not null default now(),
  "updatedAt"    timestamptz not null default now()
);
create index if not exists "papers_userId_idx" on "papers" ("userId");
create index if not exists "papers_userId_favorite_idx" on "papers" ("userId", "favorite");

-- ====== 论文自定义字段 ======
create table if not exists "custom_fields" (
  "id"        text primary key default gen_random_uuid()::text,
  "paperId"   text not null references "papers"("id") on delete cascade,
  "label"     text not null,
  "value"     text not null default '',
  "createdAt" timestamptz not null default now()
);
create index if not exists "custom_fields_paperId_idx" on "custom_fields" ("paperId");

-- ====== 分类 ======
create table if not exists "categories" (
  "id"        text primary key default gen_random_uuid()::text,
  "userId"    text not null references "users"("id") on delete cascade,
  "name"      text not null,
  "createdAt" timestamptz not null default now()
);
create unique index if not exists "categories_userId_name_key" on "categories" ("userId", "name");

create table if not exists "paper_categories" (
  "paperId"    text not null references "papers"("id") on delete cascade,
  "categoryId" text not null references "categories"("id") on delete cascade,
  primary key ("paperId", "categoryId")
);
create index if not exists "paper_categories_categoryId_idx" on "paper_categories" ("categoryId");

-- ====== 标签 ======
create table if not exists "tags" (
  "id"        text primary key default gen_random_uuid()::text,
  "userId"    text not null references "users"("id") on delete cascade,
  "name"      text not null,
  "createdAt" timestamptz not null default now()
);
create unique index if not exists "tags_userId_name_key" on "tags" ("userId", "name");

create table if not exists "paper_tags" (
  "paperId" text not null references "papers"("id") on delete cascade,
  "tagId"   text not null references "tags"("id") on delete cascade,
  primary key ("paperId", "tagId")
);
create index if not exists "paper_tags_tagId_idx" on "paper_tags" ("tagId");

-- ====== 笔记（每篇论文最多 1 结构化 + 1 自由）======
create table if not exists "notes" (
  "id"        text primary key default gen_random_uuid()::text,
  "userId"    text not null references "users"("id") on delete cascade,
  "paperId"   text not null references "papers"("id") on delete cascade,
  "type"      text not null check ("type" in ('structured', 'free')),
  "content"   text not null default '',
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);
create unique index if not exists "notes_paperId_type_key" on "notes" ("paperId", "type");
create index if not exists "notes_userId_idx" on "notes" ("userId");

-- ====== 积分记录 ======
create table if not exists "point_logs" (
  "id"        text primary key default gen_random_uuid()::text,
  "userId"    text not null references "users"("id") on delete cascade,
  "action"    text not null,
  "targetId"  text not null default '',
  "delta"     integer not null,
  "createdAt" timestamptz not null default now()
);
create unique index if not exists "point_logs_userId_action_targetId_key" on "point_logs" ("userId", "action", "targetId");
