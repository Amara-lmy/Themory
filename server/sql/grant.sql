-- ============================================================
-- 修复写权限：SQL 编辑器手工创建的表需要手动授权给访问角色
-- 现象：写入时报 DATABASE_42501 permission denied for table xxx
-- 用法：CloudBase 控制台 → SQL 型数据库 → SQL 编辑器 → 粘贴全部 → 执行
-- 说明：授权给内置 PUBLIC（所有角色），不依赖具体角色名，
--       开发阶段从宽授权；用户隔离由后端按 userId 强制过滤保证
-- ============================================================

-- 1. 已有表：允许所有角色使用 schema 并读写表/序列
grant usage on schema public to public;
grant select, insert, update, delete on all tables in schema public to public;
grant usage, select on all sequences in schema public to public;

-- 2. 以后在本 schema 新建的表/序列，自动获得相同权限
alter default privileges in schema public
  grant select, insert, update, delete on tables to public;
alter default privileges in schema public
  grant usage, select on sequences to public;
