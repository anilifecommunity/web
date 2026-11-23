DROP INDEX account_provider_subject_idx;
CREATE UNIQUE INDEX account_provider_subject_idx
  ON "account" ("providerId", "accountId");
