variable "project" { type = string }
variable "environment" { type = string }
variable "aws_region" { type = string }
variable "aws_account_id" { type = string }

# Networking
variable "private_subnet_ids" { type = list(string) }
variable "ecs_security_group_id" { type = string }

# ALB target groups
variable "app_target_group_arn" { type = string }
variable "admin_target_group_arn" { type = string }

# Container images
variable "app_image" { type = string }
variable "admin_backend_image" { type = string }
variable "admin_frontend_image" { type = string }
variable "embedding_image" { type = string }

# App sizing
variable "app_cpu" {
  type    = number
  default = 1024 # 1 vCPU
}

variable "app_memory" {
  type    = number
  default = 3072 # 3 GB
}

variable "app_desired_count" {
  type    = number
  default = 1
}

variable "app_min_count" {
  type    = number
  default = 1
}

variable "app_max_count" {
  type    = number
  default = 3
}

# Admin sizing
variable "admin_cpu" {
  type    = number
  default = 512 # 0.5 vCPU
}

variable "admin_memory" {
  type    = number
  default = 1024 # 1 GB
}

variable "admin_desired_count" {
  type    = number
  default = 1
}

variable "admin_min_count" {
  type    = number
  default = 1
}

variable "admin_max_count" {
  type    = number
  default = 2
}

# Embedding (Hugging Face TEI) sizing
variable "embedding_cpu" {
  type    = number
  default = 1024 # 1 vCPU
}

variable "embedding_memory" {
  type    = number
  default = 3072 # 3 GB
}

variable "embedding_desired_count" {
  type    = number
  default = 1
}

variable "embedding_model_id" {
  type        = string
  default     = "michaelfeil/embeddinggemma-300m"
  description = "TEI --model-id to serve (ungated mirror, no HF token required)"
}

# S3 & CloudFront
variable "s3_bucket_name" { type = string }
variable "cloudfront_domain" { type = string }
variable "s3_access_policy_arn" { type = string }

# SSM Parameter ARNs
variable "ssm_database_url_arn" { type = string }
variable "ssm_forms_database_url_arn" { type = string }
variable "ssm_secret_key_arn" { type = string }
variable "ssm_sentry_dsn_arn" { type = string }
variable "ssm_what3words_api_key_arn" { type = string }

# CloudWatch
variable "app_log_group_name" { type = string }
variable "admin_log_group_name" { type = string }
variable "embedding_log_group_name" { type = string }

# Internal service discovery (Service Connect)
variable "service_connect_namespace" {
  type        = string
  default     = "nearbynearby.internal"
  description = "Cloud Map HTTP namespace used by ECS Service Connect"
}

variable "embedding_service_url" {
  type        = string
  default     = "http://embedding.nearbynearby.internal:80"
  description = "Internal Service Connect URL of the embedding (TEI) service, injected into app/admin containers"
}

# Domain config
variable "app_allowed_origins" {
  type    = string
  default = "https://nearbynearby.com,https://www.nearbynearby.com"
}

variable "admin_allowed_origins" {
  type    = string
  default = "https://admin.nearbynearby.com"
}

variable "admin_domain" {
  type    = string
  default = "admin.nearbynearby.com"
}

# GitHub Actions
variable "github_repo" {
  type    = string
  default = "NearbyNearby/Nearby-Nearby"
}

variable "create_github_oidc" {
  type    = bool
  default = true
}

variable "github_oidc_provider_arn" {
  type    = string
  default = ""
}

variable "ecr_repository_arns" {
  type = list(string)
}
