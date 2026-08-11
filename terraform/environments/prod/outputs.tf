output "alb_dns_name" {
  value       = module.alb.dns_name
  description = "ALB DNS name — point Cloudflare CNAME records here"
}

output "ecr_repository_urls" {
  value       = module.ecr.repository_urls
  description = "ECR repository URLs for Docker image pushes"
}

output "ecs_cluster_name" {
  value       = module.ecs.cluster_name
  description = "ECS cluster name"
}

output "app_service_name" {
  value       = module.ecs.app_service_name
  description = "ECS service name for nearby-app"
}

output "admin_service_name" {
  value       = module.ecs.admin_service_name
  description = "ECS service name for nearby-admin"
}

output "embedding_service_name" {
  value       = module.ecs.embedding_service_name
  description = "ECS service name for the internal embedding (TEI) service"
}

output "github_actions_role_arn" {
  value       = module.ecs.github_actions_role_arn
  description = "IAM role ARN for GitHub Actions — set as AWS_ROLE_TO_ASSUME secret"
}

output "db_backup_bucket_name" {
  value       = module.backup.bucket_name
  description = "S3 bucket holding nightly pg_dump backups"
}

output "db_backup_task_family" {
  value       = module.backup.task_definition_family
  description = "ECS task definition family for the nightly/on-demand DB dump"
}

# Origin TLS (Task 0.6): paste these CNAMEs into Cloudflare (DNS-only) to validate the ACM cert.
output "origin_certificate_validation_records" {
  value       = module.alb.origin_certificate_validation_records
  description = "CNAME records to add in Cloudflare DNS (DNS-only) to validate the ACM origin certificate"
}

output "origin_certificate_arn" {
  value       = module.alb.origin_certificate_arn
  description = "ARN of the ACM certificate used by the ALB HTTPS listener"
}
