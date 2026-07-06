output "bucket_name" {
  value       = aws_s3_bucket.backups.bucket
  description = "S3 bucket holding nightly pg_dump backups"
}

output "bucket_arn" {
  value = aws_s3_bucket.backups.arn
}

output "task_definition_family" {
  value       = aws_ecs_task_definition.backup.family
  description = "ECS task definition family for the on-demand/scheduled dump task"
}

output "schedule_name" {
  value = aws_scheduler_schedule.backup.name
}

output "log_group_name" {
  value = aws_cloudwatch_log_group.backup.name
}
