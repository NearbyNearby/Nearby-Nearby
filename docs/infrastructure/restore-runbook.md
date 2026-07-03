# Disaster Recovery: Restore Runbook

Owner: Manav. Scope: production Postgres `nearby-admin-db` (RDS, us-east-1, account 487615743990).

"An untested backup is not a backup." This runbook is exercised by a periodic restore drill (see the "Last drill" section at the bottom).

## Facts you need

- Prod instance identifier: `nearby-admin-db` (db.t4g.micro, Postgres 17.9, single-AZ, storage-encrypted).
- Prod endpoint host: `nearby-admin-db.ce3mwk2ymjh4.us-east-1.rds.amazonaws.com`, port 5432, database `nearbynearby`.
- Subnet group: `rds-ec2-db-subnet-group-1`. VPC security groups: `sg-020f8bdd726abed8a`, `sg-002bdaa4dce991190`.
- Credentials live only in SSM: `/nearbynearby/prod/database-url` (a full `postgresql://user:pass@host:5432/nearbynearby` URL). Never print it; extract fields programmatically.
- Two backup sources exist:
  1. RDS automated snapshots (retention set in Task 0.1). Fastest path to a full instance.
  2. Nightly logical `pg_dump` in versioned S3 bucket `nearbynearby-prod-db-backups` (Task 0.3, provisioned separately). Survives account-level RDS loss; restore into any Postgres.

### Hard rules

- Every AWS command uses `--profile nn-prod --region us-east-1`. The default profile is a different account.
- The production instance `nearby-admin-db` is READ-ONLY. Never restore ON TOP of it. Restores always create a NEW instance.
- The only instance a drill may delete is the one it created, `nearby-admin-db-restore-drill-<date>`. Never run `delete-db-instance` against any other identifier.

---

## A. Restore the latest automated snapshot to a temp instance

1. Find the newest automated snapshot:

```bash
aws rds describe-db-snapshots --db-instance-identifier nearby-admin-db \
  --snapshot-type automated \
  --query 'reverse(sort_by(DBSnapshots,&SnapshotCreateTime))[0].{Id:DBSnapshotIdentifier,Created:SnapshotCreateTime,Status:Status}' \
  --profile nn-prod --region us-east-1
```

2. Confirm the source instance config so the restore matches (subnet group, SGs, class, engine):

```bash
aws rds describe-db-instances --db-instance-identifier nearby-admin-db \
  --query 'DBInstances[0].{Class:DBInstanceClass,Engine:EngineVersion,SubnetGroup:DBSubnetGroup.DBSubnetGroupName,SGs:VpcSecurityGroups[].VpcSecurityGroupId}' \
  --profile nn-prod --region us-east-1
```

3. Restore into a NEW temp instance (private, single-AZ, no deletion protection, tagged). The temp instance inherits the prod SGs so the running ECS admin task can reach it. Restoring an encrypted snapshot produces an encrypted instance on the same KMS key automatically:

```bash
DRILL_ID=nearby-admin-db-restore-drill-$(date -u +%Y%m%d)
aws rds restore-db-instance-from-db-snapshot \
  --db-instance-identifier "$DRILL_ID" \
  --db-snapshot-identifier "<latest-automated-snapshot-id>" \
  --db-instance-class db.t4g.micro \
  --db-subnet-group-name rds-ec2-db-subnet-group-1 \
  --vpc-security-group-ids sg-020f8bdd726abed8a sg-002bdaa4dce991190 \
  --no-publicly-accessible --no-multi-az --no-deletion-protection \
  --tags Key=purpose,Value=restore-drill \
  --profile nn-prod --region us-east-1
```

4. Wait until it is `available` (10-25 min). The `wait` command times out after ~20 min; re-run or poll:

```bash
aws rds wait db-instance-available --db-instance-identifier "$DRILL_ID" \
  --profile nn-prod --region us-east-1
# or poll:
aws rds describe-db-instances --db-instance-identifier "$DRILL_ID" \
  --query 'DBInstances[0].DBInstanceStatus' --output text \
  --profile nn-prod --region us-east-1
```

5. Get the temp endpoint:

```bash
aws rds describe-db-instances --db-instance-identifier "$DRILL_ID" \
  --query 'DBInstances[0].Endpoint.Address' --output text \
  --profile nn-prod --region us-east-1
```

---

## B. Verify the restored data (row counts + alembic head)

The temp instance is private (no public access), so verify from inside the VPC. The prod ECS admin service does NOT have execute-command enabled, and enabling it forces a prod redeploy, so use a one-off ECS `run-task` on the admin task definition with a command override. The verification script pulls credentials from the injected `DATABASE_URL` secret (which points at the PROD host) but connects ONLY to the temp endpoint passed in `DRILL_HOST`, and refuses any host without `restore-drill` in it.

Verification Python (read-only session):

```python
import os, urllib.parse, psycopg2
p = urllib.parse.urlparse(os.environ["DATABASE_URL"])
host = os.environ["DRILL_HOST"]
assert "restore-drill" in host, "refuse: not the drill host"
conn = psycopg2.connect(host=host, port=p.port or 5432, user=p.username,
    password=p.password, dbname=p.path.lstrip("/"), connect_timeout=20)
conn.set_session(readonly=True, autocommit=True)
cur = conn.cursor()
cur.execute("SELECT count(*) FROM points_of_interest"); print("POI_COUNT=", cur.fetchone()[0])
cur.execute("SELECT count(*) FROM images"); print("IMAGES_COUNT=", cur.fetchone()[0])
cur.execute("SELECT name, poi_type, publication_status FROM points_of_interest ORDER BY name LIMIT 3")
[print("SAMPLE=", r) for r in cur.fetchall()]
cur.execute("SELECT version_num FROM alembic_version"); print("ALEMBIC=", cur.fetchone()[0])
print("DRILL_VERIFY_OK")
```

Launch it (subnets/SG copied from the admin service network config; the SG already reaches the RDS SGs):

```bash
TDEF=$(aws ecs describe-services --cluster nearbynearby-prod --services nearbynearby-prod-admin \
  --query 'services[0].taskDefinition' --output text --profile nn-prod --region us-east-1)
ENDPOINT=$(aws rds describe-db-instances --db-instance-identifier "$DRILL_ID" \
  --query 'DBInstances[0].Endpoint.Address' --output text --profile nn-prod --region us-east-1)
# Build overrides JSON (backend container command = the script above, plus DRILL_HOST env), then:
aws ecs run-task --cluster nearbynearby-prod --task-definition "$TDEF" --launch-type FARGATE \
  --network-configuration 'awsvpcConfiguration={subnets=[subnet-001987b7500613f9b,subnet-0a0236e90fdb9e34c],securityGroups=[sg-074cc1f7ac9109309],assignPublicIp=DISABLED}' \
  --overrides file://overrides.json \
  --profile nn-prod --region us-east-1
```

Read the output from CloudWatch (admin log group), grepping for the printed markers:

```bash
MSYS_NO_PATHCONV=1 aws logs tail '/ecs/nearbynearby-prod/admin' --since 10m \
  --filter-pattern 'DRILL' --profile nn-prod --region us-east-1
```

Expected: `POI_COUNT` in the same ballpark as the live site (cross-check with the public API, e.g. `curl -s "https://nearbynearby.com/api/pois/by-type/BUSINESS?include_past_events=true"` per type; 25 as of 2026-07-02), `IMAGES_COUNT` > 0, three sample POIs, and `ALEMBIC` equal to the current migration head (`n_sponsor_logo_001` at the time of writing). A mismatch means the snapshot is stale or corrupt: escalate before trusting it.

Alternative (if you have DB network access, e.g. a bastion/VPN): connect directly with `psql` to the temp endpoint and run the same four queries. Never point these at the prod host.

---

## C. Promote a restore to production (LAST RESORT)

Only when prod data is lost or corrupted and cannot be recovered in place. This makes the restored instance the live database. Take a manual snapshot of whatever remains of prod first, and announce a maintenance window.

Two ways to cut over:

- **Preferred: repoint the SSM param + redeploy.** The apps resolve the DB host from `/nearbynearby/prod/database-url`. Update that URL's host to the restored instance's endpoint, then force new ECS deployments so both services read the new secret:

```bash
# 1. Verify the restored instance (Section B) BEFORE cutover.
# 2. Rewrite only the host in the URL (fetch, swap host, put back). Do NOT echo the value.
aws ssm put-parameter --name /nearbynearby/prod/database-url --type SecureString \
  --overwrite --value "<postgresql url with restored-instance host>" \
  --profile nn-prod --region us-east-1
# 3. Roll both services so tasks pick up the new secret:
aws ecs update-service --cluster nearbynearby-prod --service nearbynearby-prod-app   --force-new-deployment --profile nn-prod --region us-east-1
aws ecs update-service --cluster nearbynearby-prod --service nearbynearby-prod-admin --force-new-deployment --profile nn-prod --region us-east-1
```

- **Alternative: rename to preserve the hostname.** RDS endpoint host = `<identifier>.<account-suffix>.us-east-1.rds.amazonaws.com`, so renaming the restored instance to `nearby-admin-db` reproduces the exact prod endpoint and needs no SSM change. You MUST first move the old instance out of the way (it holds the name):

```bash
# Old instance must not hold the name. Rename it aside (or delete if truly gone).
aws rds modify-db-instance --db-instance-identifier nearby-admin-db \
  --new-db-instance-identifier nearby-admin-db-broken --apply-immediately \
  --profile nn-prod --region us-east-1
# Then claim the canonical name for the restore:
aws rds modify-db-instance --db-instance-identifier "$DRILL_ID" \
  --new-db-instance-identifier nearby-admin-db --apply-immediately \
  --profile nn-prod --region us-east-1
```

Renames cause a short outage and the endpoint DNS takes a few minutes to settle. After cutover, re-enable deletion protection and confirm backup retention on the promoted instance (a drill restore is created with neither).

---

## D. Tear down a drill instance

Only ever the drill instance you created. `--skip-final-snapshot` (it is a throwaway), `--delete-automated-backups` (no orphaned backups):

```bash
aws rds delete-db-instance --db-instance-identifier nearby-admin-db-restore-drill-<date> \
  --skip-final-snapshot --delete-automated-backups \
  --profile nn-prod --region us-east-1
# Confirm it reaches "deleting":
aws rds describe-db-instances --db-instance-identifier nearby-admin-db-restore-drill-<date> \
  --query 'DBInstances[0].DBInstanceStatus' --output text --profile nn-prod --region us-east-1
```

---

## E. Restore from the nightly S3 pg_dump into a local Docker Postgres

Use when the RDS snapshot line is unavailable (account loss) or to inspect data off-cloud. Bucket: `nearbynearby-prod-db-backups` (versioned; Glacier lifecycle after 90d).

1. List and download the newest dump:

```bash
aws s3 ls s3://nearbynearby-prod-db-backups/ --recursive \
  --profile nn-prod --region us-east-1 | sort | tail -5
aws s3 cp s3://nearbynearby-prod-db-backups/<newest-key> ./nn-latest.dump \
  --profile nn-prod --region us-east-1
```

2. Start a local PostGIS container (the schema needs PostGIS; pgvector is optional and its absence is handled by the app):

```bash
docker run -d --name nn-restore -e POSTGRES_USER=nearby -e POSTGRES_PASSWORD=nearby \
  -e POSTGRES_DB=nearbynearby -p 5433:5432 postgis/postgis:17-3.4
```

3. Restore. If the dump is custom-format (`pg_dump -Fc`), use `pg_restore`; if plain SQL, pipe with `psql`:

```bash
# custom format:
docker cp ./nn-latest.dump nn-restore:/tmp/nn.dump
docker exec nn-restore pg_restore -U nearby -d nearbynearby --no-owner --clean --if-exists /tmp/nn.dump
# plain SQL:
# cat nn-latest.dump | docker exec -i nn-restore psql -U nearby -d nearbynearby
```

4. Verify row counts and alembic head:

```bash
docker exec nn-restore psql -U nearby -d nearbynearby -c \
  "SELECT (SELECT count(*) FROM points_of_interest) AS pois,
          (SELECT count(*) FROM images) AS images,
          (SELECT version_num FROM alembic_version) AS alembic;"
```

Expect `pois` near the live site's count (25 as of 2026-07-02) and `alembic` at the current head. Clean up: `docker rm -f nn-restore`.

---

## Last drill

- Date: 2026-07-02 (UTC).
- Snapshot restored: `rds:nearby-admin-db-2026-07-02-04-09` (created 2026-07-02T04:09:10Z, automated, encrypted).
- Temp instance: `nearby-admin-db-restore-drill-20260702` (db.t4g.micro, private, single-AZ).
- Restore duration: about 6.5 minutes (requested 20:00:56Z, available 20:07:20Z).
- Verification (via ECS run-task on the admin task def, read-only, temp endpoint only):
  - `points_of_interest`: 25
  - `images`: 137
  - sample POIs: Cactus Cowgirl Plant Shop (BUSINESS, published), Chatham County Courthouse (BUSINESS, published), Chatham County First Responders Memorial (PARK, published)
  - `alembic_version`: `n_sponsor_logo_001` (matches expected head)
- Teardown: `delete-db-instance --skip-final-snapshot --delete-automated-backups` confirmed status `deleting`. Prod instance verified `available` and untouched.
- Notes: ECS execute-command is disabled on the admin service, so verification used a one-off `run-task` with a command override (not `execute-command`). The one-off task's stoppedReason reads "Task failed to start" because the nginx sidecar (also `essential`) exits when the backend command finishes; the backend container exited 0 with full output in CloudWatch, so that reason is expected noise for this pattern. The 25 POI count was cross-checked against the live public API (25 published across BUSINESS/PARK/TRAIL/EVENT), so the snapshot matches current prod; the earlier "~31 POIs" figure was stale. No prod data was touched; the drill connected only to the temp instance.
