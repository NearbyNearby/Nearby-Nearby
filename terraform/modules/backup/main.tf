# =============================================================================
# Nightly logical DB backup: EventBridge Scheduler -> ECS RunTask -> pg_dump -> S3
# =============================================================================
# A small Fargate task runs pg_dump nightly and streams a gzipped SQL dump to a
# private, versioned S3 bucket. Versions age into Glacier after 90 days. The
# dataset is tiny (~31 POIs) so a full logical dump is trivial and portable.

# --- Versioned, private, encrypted backup bucket ---
resource "aws_s3_bucket" "backups" {
  bucket = "${var.project}-${var.environment}-db-backups"
  tags   = { Name = "${var.project}-${var.environment}-db-backups" }
}

resource "aws_s3_bucket_public_access_block" "backups" {
  bucket                  = aws_s3_bucket.backups.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "backups" {
  bucket = aws_s3_bucket.backups.id
  versioning_configuration { status = "Enabled" }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "backups" {
  bucket = aws_s3_bucket.backups.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
    bucket_key_enabled = true
  }
}

# Current + noncurrent versions transition to Glacier after glacier_transition_days.
resource "aws_s3_bucket_lifecycle_configuration" "backups" {
  bucket = aws_s3_bucket.backups.id

  # Versioning must exist before a lifecycle rule can reference noncurrent versions.
  depends_on = [aws_s3_bucket_versioning.backups]

  rule {
    id     = "glacier-after-${var.glacier_transition_days}d"
    status = "Enabled"

    filter {}

    transition {
      days          = var.glacier_transition_days
      storage_class = "GLACIER"
    }

    noncurrent_version_transition {
      noncurrent_days = var.glacier_transition_days
      storage_class   = "GLACIER"
    }
  }
}

# --- CloudWatch log group for the dump task ---
resource "aws_cloudwatch_log_group" "backup" {
  name              = "/ecs/${var.project}-${var.environment}/backup"
  retention_in_days = var.log_retention_days

  tags = { Name = "${var.project}-${var.environment}-backup-logs" }
}

# --- Task execution role (pull image, write logs, read the DB URL secret) ---
resource "aws_iam_role" "backup_execution" {
  name = "${var.project}-${var.environment}-backup-execution"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "backup_execution_base" {
  role       = aws_iam_role.backup_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_policy" "backup_execution_ssm" {
  name = "${var.project}-${var.environment}-backup-ssm-read"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["ssm:GetParameters", "ssm:GetParameter"]
      Resource = var.ssm_database_url_arn
    }]
  })
}

resource "aws_iam_role_policy_attachment" "backup_execution_ssm" {
  role       = aws_iam_role.backup_execution.name
  policy_arn = aws_iam_policy.backup_execution_ssm.arn
}

# --- Task role (write dumps to the backup bucket ONLY) ---
resource "aws_iam_role" "backup_task" {
  name = "${var.project}-${var.environment}-backup-task"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
    }]
  })
}

resource "aws_iam_policy" "backup_task_s3" {
  name = "${var.project}-${var.environment}-backup-s3-write"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["s3:PutObject", "s3:AbortMultipartUpload"]
        Resource = "${aws_s3_bucket.backups.arn}/*"
      },
      {
        Effect   = "Allow"
        Action   = ["s3:ListBucket"]
        Resource = aws_s3_bucket.backups.arn
      },
    ]
  })
}

resource "aws_iam_role_policy_attachment" "backup_task_s3" {
  role       = aws_iam_role.backup_task.name
  policy_arn = aws_iam_policy.backup_task_s3.arn
}

# --- Dump task definition ---
# pg_dump | gzip | aws s3 cp (streamed via stdin, no local disk). pipefail makes
# a failed dump fail the pipeline so a truncated upload never looks successful.
resource "aws_ecs_task_definition" "backup" {
  family                   = "${var.project}-${var.environment}-backup"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = var.backup_cpu
  memory                   = var.backup_memory
  execution_role_arn       = aws_iam_role.backup_execution.arn
  task_role_arn            = aws_iam_role.backup_task.arn

  container_definitions = jsonencode([
    {
      name      = "pg-dump"
      image     = var.dump_image
      essential = true

      environment = [
        { name = "BACKUP_BUCKET", value = aws_s3_bucket.backups.bucket },
        { name = "AWS_REGION", value = var.aws_region },
      ]

      secrets = [
        {
          name      = "DATABASE_URL"
          valueFrom = var.ssm_database_url_arn
        },
      ]

      command = [
        "sh", "-c",
        join(" ", [
          "set -euo pipefail;",
          "apk add --no-cache aws-cli >/dev/null;",
          "TS=$(date -u +%Y%m%dT%H%M%SZ);",
          "KEY=db/${var.project}-$TS.sql.gz;",
          "echo \"Dumping to s3://$BACKUP_BUCKET/$KEY\";",
          "pg_dump \"$DATABASE_URL\" | gzip -9 | aws s3 cp - \"s3://$BACKUP_BUCKET/$KEY\";",
          "echo \"Backup complete: $KEY\"",
        ])
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.backup.name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "backup"
        }
      }
    }
  ])
}

# --- EventBridge Scheduler role (allowed to RunTask + pass the two task roles) ---
resource "aws_iam_role" "scheduler" {
  name = "${var.project}-${var.environment}-backup-scheduler"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "scheduler.amazonaws.com" }
    }]
  })
}

resource "aws_iam_policy" "scheduler" {
  name = "${var.project}-${var.environment}-backup-scheduler"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["ecs:RunTask"]
        Resource = "${aws_ecs_task_definition.backup.arn_without_revision}:*"
        Condition = {
          ArnLike = { "ecs:cluster" = var.cluster_arn }
        }
      },
      {
        Effect = "Allow"
        Action = ["iam:PassRole"]
        Resource = [
          aws_iam_role.backup_execution.arn,
          aws_iam_role.backup_task.arn,
        ]
        Condition = {
          StringEquals = { "iam:PassedToService" = "ecs-tasks.amazonaws.com" }
        }
      },
    ]
  })
}

resource "aws_iam_role_policy_attachment" "scheduler" {
  role       = aws_iam_role.scheduler.name
  policy_arn = aws_iam_policy.scheduler.arn
}

# --- Daily schedule -> ECS RunTask ---
resource "aws_scheduler_schedule" "backup" {
  name       = "${var.project}-${var.environment}-nightly-db-backup"
  group_name = "default"

  flexible_time_window { mode = "OFF" }

  schedule_expression          = var.schedule_expression
  schedule_expression_timezone = "UTC"

  target {
    arn      = var.cluster_arn
    role_arn = aws_iam_role.scheduler.arn

    ecs_parameters {
      task_definition_arn = aws_ecs_task_definition.backup.arn
      task_count          = 1
      launch_type         = "FARGATE"

      network_configuration {
        subnets          = var.private_subnet_ids
        security_groups  = [var.ecs_security_group_id]
        assign_public_ip = false
      }
    }

    retry_policy {
      maximum_retry_attempts = 1
    }
  }
}
