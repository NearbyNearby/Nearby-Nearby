variable "project" { type = string }
variable "environment" { type = string }
variable "aws_region" { type = string }
variable "aws_account_id" { type = string }

# Existing cluster + networking the dump task runs in.
variable "cluster_arn" { type = string }
variable "private_subnet_ids" { type = list(string) }
variable "ecs_security_group_id" { type = string }

# SSM SecureString ARN holding the full DATABASE_URL (main DB role).
variable "ssm_database_url_arn" { type = string }

# Dump container image. postgres:17-alpine ships pg_dump >= server (17.9) and
# an apk community repo, so aws-cli is installed at runtime (NAT egress exists).
variable "dump_image" {
  type    = string
  default = "postgres:17-alpine"
}

variable "backup_cpu" {
  type    = number
  default = 256
}

variable "backup_memory" {
  type    = number
  default = 512
}

variable "log_retention_days" {
  type    = number
  default = 30
}

# Daily dump time. 07:00 UTC = low-traffic window for a US-East audience.
variable "schedule_expression" {
  type    = string
  default = "cron(0 7 * * ? *)"
}

# Transition current + noncurrent object versions to Glacier after this many days.
variable "glacier_transition_days" {
  type    = number
  default = 90
}
