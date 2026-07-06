variable "project" {
  type    = string
  default = "nearbynearby"
}

variable "environment" {
  type    = string
  default = "prod"
}

variable "aws_region" {
  type    = string
  default = "us-east-1"
}

variable "aws_account_id" {
  type        = string
  description = "AWS account ID"
}

# Existing S3 + CloudFront (not managed by Terraform)
variable "s3_bucket_name" {
  type        = string
  description = "Existing S3 bucket name for images"
}

variable "cloudfront_domain" {
  type        = string
  description = "Existing CloudFront distribution domain"
}

# Secrets (passed to SSM Parameter Store)
variable "database_url" {
  type        = string
  sensitive   = true
  description = "Full PostgreSQL connection string for main role"
}

variable "forms_database_url" {
  type        = string
  sensitive   = true
  description = "PostgreSQL connection string for forms role"
}

variable "secret_key" {
  type        = string
  sensitive   = true
  description = "JWT signing secret key"
}

variable "sentry_dsn" {
  type        = string
  sensitive   = true
  default     = "disabled"
  description = "Sentry DSN for error tracking (set to actual DSN to enable)"
}

variable "what3words_api_key" {
  type        = string
  sensitive   = true
  default     = "placeholder-set-via-aws-cli"
  description = "what3words API key for admin coordinate-lookup endpoint (set via TF_VAR_what3words_api_key or SSM put-parameter)"
}

# Container images (defaults to placeholder, overridden after first push)
variable "app_image" {
  type        = string
  default     = ""
  description = "nearby-app ECR image URI (leave empty for initial plan)"
}

variable "admin_backend_image" {
  type        = string
  default     = ""
  description = "nearby-admin backend ECR image URI"
}

variable "admin_frontend_image" {
  type        = string
  default     = ""
  description = "nearby-admin frontend ECR image URI"
}

# Embedding (Hugging Face TEI) service
variable "embedding_image_tag" {
  type        = string
  default     = "cpu-1.8.1"
  description = "Tag of the nearbynearby/embedding ECR image (mirror of ghcr.io/huggingface/text-embeddings-inference:cpu-1.8.1)"
}

variable "service_connect_namespace" {
  type        = string
  default     = "nearbynearby.internal"
  description = "Cloud Map HTTP namespace for ECS Service Connect (internal service-to-service DNS)"
}

# VPC Peering (ECS VPC → default VPC where existing RDS lives)
variable "default_vpc_id" {
  type        = string
  description = "Default VPC ID where existing RDS is located"
}

variable "default_vpc_cidr" {
  type        = string
  default     = "172.31.0.0/16"
  description = "CIDR block of the default VPC"
}

variable "default_vpc_route_table_id" {
  type        = string
  description = "Main route table ID of the default VPC"
}

variable "rds_security_group_id" {
  type        = string
  description = "Security group ID of the existing RDS instance"
}

variable "rds_subnet_route_table_id" {
  type        = string
  description = "Route table ID used by the RDS subnets in the default VPC"
}

# Origin TLS rollout (Task 0.6). Two-stage: keep false to create the ACM cert and
# emit its Cloudflare DNS validation records; flip to true (after the cert is ISSUED)
# to add the ALB 443 listener and redirect port 80. See docs/infrastructure/origin-tls.md.
variable "enable_https_listener" {
  type        = bool
  default     = false
  description = "Stage 2 gate for origin TLS: create the ALB HTTPS (443) listener and redirect port 80. Requires the ACM cert to be ISSUED first."
}
