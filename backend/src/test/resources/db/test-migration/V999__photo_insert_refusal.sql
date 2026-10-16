-- Test-only, and never part of a production database: this file lives in src/test/resources/db/test-migration
-- and is applied only by the tests that add that folder to `spring.flyway.locations`. It exists so the
-- compensation of an upload can be exercised against a real refusal instead of a mock: a constraint no row
-- can satisfy makes every insert into `photo` fail, which is what PostgreSQL does to the archive anyway when
-- one of the baseline's own checks rejects a row.
--
-- `not valid` keeps the constraint from scanning rows that are already there — there are none, but a
-- migration that has to be fast and total should not depend on that.
alter table photo add constraint ck_photo_test_insert_refusal check (false) not valid;
