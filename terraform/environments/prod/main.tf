terraform {
  required_version = ">= 1.5"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.0" }
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = var.project
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}

locals {
  ecr_base = "${var.aws_account_id}.dkr.ecr.${var.aws_region}.amazonaws.com"
}

# --- Networking ---
module "networking" {
  source      = "../../modules/networking"
  project     = var.project
  environment = var.environment
}

# --- ECR Repositories ---
module "ecr" {
  source = "../../modules/ecr"
}

# --- S3 IAM Policy for existing bucket ---
resource "aws_iam_policy" "s3_access" {
  name        = "${var.project}-${var.environment}-s3-access"
  description = "Allow ECS tasks to read/write existing S3 images bucket"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:PutObject",
          "s3:GetObject",
          "s3:DeleteObject",
          "s3:ListBucket"
        ]
        Resource = [
          "arn:aws:s3:::${var.s3_bucket_name}",
          "arn:aws:s3:::${var.s3_bucket_name}/*"
        ]
      }
    ]
  })
}

# --- Secrets (SSM Parameter Store) ---
module "secrets" {
  source = "../../modules/secrets"

  project     = var.project
  environment = var.environment

  database_url       = var.database_url
  forms_database_url = var.forms_database_url
  secret_key         = var.secret_key
  sentry_dsn         = var.sentry_dsn
  what3words_api_key = var.what3words_api_key
}

# --- Monitoring (CloudWatch) ---
module "monitoring" {
  source      = "../../modules/monitoring"
  project     = var.project
  environment = var.environment
}

# --- ALB ---
module "alb" {
  source = "../../modules/alb"

  project               = var.project
  environment           = var.environment
  vpc_id                = module.networking.vpc_id
  public_subnet_ids     = module.networking.public_subnet_ids
  alb_security_group_id = module.networking.alb_security_group_id

  # Origin TLS (Task 0.6). false = stage 1 (ACM cert + validation records only);
  # true = stage 2 (443 listener live, port 80 redirects). See docs/infrastructure/origin-tls.md.
  enable_https_listener = var.enable_https_listener
}

# --- ECS ---
module "ecs" {
  source = "../../modules/ecs"

  project        = var.project
  environment    = var.environment
  aws_region     = var.aws_region
  aws_account_id = var.aws_account_id

  # Networking
  private_subnet_ids    = module.networking.private_subnet_ids
  ecs_security_group_id = module.networking.ecs_security_group_id

  # ALB target groups
  app_target_group_arn   = module.alb.app_target_group_arn
  admin_target_group_arn = module.alb.admin_target_group_arn

  # Container images (use ECR repo URLs directly)
  app_image            = "${local.ecr_base}/nearbynearby/nearby-app:latest"
  admin_backend_image  = "${local.ecr_base}/nearbynearby/nearby-admin-backend:latest"
  admin_frontend_image = "${local.ecr_base}/nearbynearby/nearby-admin-frontend:latest"

  # Embedding server: ECR mirror of ghcr.io/ggml-org/llama.cpp:server, serving the
  # ungated unsloth EmbeddingGemma Q8_0 GGUF via its OpenAI-compatible endpoint.
  # (TEI was the original plan but its CPU/Candle backend crashes on EmbeddingGemma's
  # Gemma3 dense layers — Intel MKL SGEMM error — so we run llama.cpp instead.)
  embedding_image = "${local.ecr_base}/nearbynearby/embedding:${var.embedding_image_tag}"

  # Existing S3 & CloudFront (not managed by Terraform)
  s3_bucket_name       = var.s3_bucket_name
  cloudfront_domain    = var.cloudfront_domain
  s3_access_policy_arn = aws_iam_policy.s3_access.arn

  # SSM Parameter ARNs
  ssm_database_url_arn       = module.secrets.database_url_arn
  ssm_forms_database_url_arn = module.secrets.forms_database_url_arn
  ssm_secret_key_arn         = module.secrets.secret_key_arn
  ssm_sentry_dsn_arn         = module.secrets.sentry_dsn_arn
  ssm_what3words_api_key_arn = module.secrets.what3words_api_key_arn

  # CloudWatch
  app_log_group_name       = module.monitoring.app_log_group_name
  admin_log_group_name     = module.monitoring.admin_log_group_name
  embedding_log_group_name = module.monitoring.embedding_log_group_name

  # Internal embedding service (Service Connect). The namespace is an HTTP
  # (not private-DNS) namespace, so SC only makes the short client_alias dns_name
  # ("embedding") resolvable via its proxy — the FQDN does NOT resolve. /v1 base
  # for the OpenAI-compatible llama.cpp endpoint (client appends /embeddings).
  embedding_service_url     = "http://embedding:80/v1"
  service_connect_namespace = var.service_connect_namespace

  # GitHub Actions OIDC (provider already exists in this account)
  create_github_oidc       = false
  github_oidc_provider_arn = "arn:aws:iam::487615743990:oidc-provider/token.actions.githubusercontent.com"
  ecr_repository_arns      = values(module.ecr.repository_arns)
}

# --- Nightly logical DB backup (pg_dump -> versioned S3, Glacier lifecycle) ---
module "backup" {
  source = "../../modules/backup"

  project        = var.project
  environment    = var.environment
  aws_region     = var.aws_region
  aws_account_id = var.aws_account_id

  cluster_arn           = module.ecs.cluster_arn
  private_subnet_ids    = module.networking.private_subnet_ids
  ecs_security_group_id = module.networking.ecs_security_group_id

  ssm_database_url_arn = module.secrets.database_url_arn
}

# --- VPC Peering (ECS VPC ↔ Default VPC where RDS lives) ---
resource "aws_vpc_peering_connection" "ecs_to_default" {
  vpc_id      = module.networking.vpc_id
  peer_vpc_id = var.default_vpc_id
  auto_accept = true

  accepter {
    allow_remote_vpc_dns_resolution = true
  }

  requester {
    allow_remote_vpc_dns_resolution = true
  }

  tags = { Name = "${var.project}-${var.environment}-ecs-to-default" }
}

# Route from ECS private subnets → default VPC (172.31.0.0/16)
resource "aws_route" "ecs_to_default" {
  route_table_id            = module.networking.private_route_table_id
  destination_cidr_block    = var.default_vpc_cidr
  vpc_peering_connection_id = aws_vpc_peering_connection.ecs_to_default.id
}

# Route from default VPC main route table → ECS VPC (10.0.0.0/16)
resource "aws_route" "default_to_ecs" {
  route_table_id            = var.default_vpc_route_table_id
  destination_cidr_block    = "10.0.0.0/16"
  vpc_peering_connection_id = aws_vpc_peering_connection.ecs_to_default.id
}

# Route from default VPC RDS subnet route table → ECS VPC (10.0.0.0/16)
resource "aws_route" "rds_subnet_to_ecs" {
  route_table_id            = var.rds_subnet_route_table_id
  destination_cidr_block    = "10.0.0.0/16"
  vpc_peering_connection_id = aws_vpc_peering_connection.ecs_to_default.id
}

# Allow ECS tasks to reach RDS on port 5432 via existing RDS security group
resource "aws_security_group_rule" "rds_from_ecs" {
  type              = "ingress"
  from_port         = 5432
  to_port           = 5432
  protocol          = "tcp"
  cidr_blocks       = ["10.0.0.0/16"]
  security_group_id = var.rds_security_group_id
  description       = "PostgreSQL from ECS VPC via peering"
}
