# Database Backups

## Overview

The production Postgres database (`nearby-admin-db`, shared by both apps) is the
business asset. The apps are replaceable views over it. Backups exist at three
layers, from most automatic to most durable:

1. **RDS automated snapshots** (35-day retention, deletion protection on) — see
   Task 0.1. Fast to restore, but die with the AWS account.
2. **Nightly logical `pg_dump`** to a versioned S3 bucket (this document).
   Portable SQL, restorable into any Postgres, versioned + Glacier-archived.
3. **Monthly off-account export** of the latest dump to storage outside AWS
   (this document). The only copy that survives loss of the whole AWS account.

Restore procedures live in `docs/infrastructure/restore-runbook.md`.

## What runs nightly

Terraform module `terraform/modules/backup/` provisions an EventBridge Scheduler
rule that runs a one-off ECS Fargate task every day at **07:00 UTC**:

```
EventBridge Scheduler (cron, 07:00 UTC)
        -> ecs:RunTask on cluster nearbynearby-prod
        -> Fargate task (postgres:17-alpine, 256 CPU / 512 MB, private subnets)
        -> pg_dump "$DATABASE_URL" | gzip -9 | aws s3 cp - s3://<bucket>/db/<name>-<ts>.sql.gz
```

- **Image / client**: `postgres:17-alpine`. Its `pg_dump` is >= the server
  version (17.9), which `pg_dump` requires. `aws-cli` is installed at task start
  via `apk add --no-cache aws-cli` (the private subnets have NAT egress). The
  dump is streamed straight to S3 over stdin, so no local disk is used and
  `set -o pipefail` makes a failed `pg_dump` fail the whole task instead of
  uploading a truncated file.
- **Credentials**: `DATABASE_URL` is injected as an ECS task-definition secret
  from SSM parameter `/nearbynearby/prod/database-url` (never baked into the
  image or logged). The task runs in the existing ECS security group, which
  already reaches RDS over VPC peering.
- **Networking**: private subnets, `assign_public_ip = false`, egress via the
  existing NAT gateway.
- **Where dumps land**: `s3://nearbynearby-prod-db-backups/db/nearbynearby-<UTCtimestamp>.sql.gz`
  (key example: `db/nearbynearby-20260703T070000Z.sql.gz`).
- **Logs**: CloudWatch log group `/ecs/nearbynearby-prod/backup` (30-day
  retention). Each run logs the target key and a completion line.

## The backup bucket

`nearbynearby-prod-db-backups`:

- **Private**: all four S3 public-access-block flags are on; no bucket policy
  grants public read.
- **Encrypted**: default SSE-S3 (AES256), bucket keys enabled.
- **Versioned**: every write keeps prior versions, so an overwrite or a bad
  dump can never destroy an earlier good one.
- **Lifecycle**: both current and noncurrent versions transition to **GLACIER
  after 90 days**. Recent dumps stay in Standard for instant retrieval; only
  90-day-plus-old dumps get archived.

> Note on small objects: S3 lifecycle transitions apply a 128 KB minimum object
> size (`transition_default_minimum_object_size = all_storage_classes_128K`).
> If a gzipped dump is under 128 KB it stays in Standard rather than moving to
> Glacier. At this dataset size the storage cost is negligible and instant
> retrieval is arguably preferable for disaster recovery, so this is acceptable.

There is intentionally **no automatic deletion / expiration** rule: the dataset
is tiny and irreplaceable, so we keep every dump (archived cheaply in Glacier)
rather than risk pruning the wrong one.

## Deploying / changing the pipeline

The module is wired into `terraform/environments/prod` as `module "backup"`.
Apply with the standard prod recipe (see root `CLAUDE.md`), from
`terraform/environments/prod`, using the `nn-prod` profile and `-lock=false`.
Never run `terraform apply` without explicit approval.

Relevant Terraform outputs after apply:

- `db_backup_bucket_name`  -> the S3 bucket name
- `db_backup_task_family`  -> the ECS task-definition family (for manual runs)

## Running a dump on demand (verify the pipeline works)

You do not have to wait for 07:00 UTC. Trigger the same task by hand
(all commands use `--profile nn-prod --region us-east-1`):

```bash
export AWS_PROFILE=nn-prod AWS_REGION=us-east-1

# Resolve the ECS security group and private subnets by their Name tags
SG=$(aws ec2 describe-security-groups \
      --filters Name=tag:Name,Values='nearbynearby-prod-ecs-sg' \
      --query 'SecurityGroups[0].GroupId' --output text)
SUBNET_IDS=$(aws ec2 describe-subnets \
      --filters Name=tag:Name,Values='nearbynearby-prod-private-*' \
      --query 'Subnets[].SubnetId' --output text | tr '\t' ',')

aws ecs run-task \
  --cluster nearbynearby-prod \
  --launch-type FARGATE \
  --task-definition nearbynearby-prod-backup \
  --network-configuration "awsvpcConfiguration={subnets=[$SUBNET_IDS],securityGroups=[$SG],assignPublicIp=DISABLED}"

# Watch it
aws logs tail /ecs/nearbynearby-prod/backup --follow

# Confirm the object landed
aws s3 ls s3://nearbynearby-prod-db-backups/db/ --recursive | tail -5
```

A successful run ends with a `Backup complete: db/...` line in the logs and a
new `.sql.gz` object in the bucket.

## Monthly manual off-account export (required)

RDS snapshots and the S3 bucket both live inside the AWS account. If the account
itself is lost (billing, compromise, closure), they go with it. Once a month,
copy the latest dump to storage **outside** this AWS account. The dataset is
tiny, so this is a two-minute chore.

```bash
export AWS_PROFILE=nn-prod AWS_REGION=us-east-1

# 1. Find the newest dump key
LATEST=$(aws s3 ls s3://nearbynearby-prod-db-backups/db/ \
           | sort | tail -1 | awk '{print $4}')
echo "Latest dump: $LATEST"

# 2. Download it to a local machine (NOT an EC2 box in the same account)
aws s3 cp "s3://nearbynearby-prod-db-backups/db/$LATEST" "./$LATEST"

# 3. Verify it is a real, complete gzip before trusting it
gzip -t "$LATEST" && echo "gzip OK"
gunzip -c "$LATEST" | grep -c "CREATE TABLE"   # sanity: nonzero table count
```

Then store `./$LATEST` **off the AWS account**, for example:

- an **encrypted external / local drive** (e.g. a VeraCrypt volume or an
  encrypted APFS/LUKS disk), or
- a **different cloud account/provider** (a personal Google Drive, Backblaze
  B2, another org's bucket) — different provider or at least different billing
  root than the prod account.

Keep at least the **last 3 monthly exports**. Record the date and the
`CREATE TABLE` count you saw so a future restore can be sanity-checked against
it.

> Do not store the export next to the database credentials, and never commit a
> dump to git.

## Verifying a backup is restorable

An untested backup is not a backup. To confirm a dump restores and has the
expected data, load it into a throwaway local Postgres and count rows. The full
step-by-step (RDS-snapshot restore drill and logical-dump restore) lives in
`docs/infrastructure/restore-runbook.md`. Quick logical-dump check:

```bash
# Spin a scratch Postgres, load the dump, count POIs
docker run -d --name restore-check -e POSTGRES_PASSWORD=x -p 5599:5432 postgis/postgis:17-3.5
gunzip -c ./nearbynearby-<ts>.sql.gz | docker exec -i restore-check psql -U postgres
docker exec -i restore-check psql -U postgres -c "SELECT count(*) FROM points_of_interest;"
docker rm -f restore-check
```

The count should match production's published-POI count.
