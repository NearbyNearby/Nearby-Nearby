output "dns_name" {
  value = aws_lb.main.dns_name
}

output "zone_id" {
  value = aws_lb.main.zone_id
}

output "arn" {
  value = aws_lb.main.arn
}

output "app_target_group_arn" {
  value = aws_lb_target_group.app.arn
}

output "admin_target_group_arn" {
  value = aws_lb_target_group.admin.arn
}

output "origin_certificate_arn" {
  value       = aws_acm_certificate.origin.arn
  description = "ARN of the ACM certificate for the ALB HTTPS listener."
}

# DNS validation records to add in Cloudflare (DNS-only / grey cloud) to validate
# the ACM cert. ACM usually dedupes the apex and wildcard to a single CNAME, so
# this map may contain one entry. Known after the cert is created (stage 1 apply).
output "origin_certificate_validation_records" {
  description = "CNAME records to add in Cloudflare DNS to validate the ACM certificate. Add every distinct {name -> value} below as a DNS-only CNAME."
  value = {
    for dvo in aws_acm_certificate.origin.domain_validation_options :
    dvo.domain_name => {
      name  = dvo.resource_record_name
      type  = dvo.resource_record_type
      value = dvo.resource_record_value
    }
  }
}
