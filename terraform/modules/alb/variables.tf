variable "project" { type = string }
variable "environment" { type = string }
variable "vpc_id" { type = string }
variable "public_subnet_ids" { type = list(string) }
variable "alb_security_group_id" { type = string }

variable "admin_domain" {
  type    = string
  default = "admin.nearbynearby.com"
}

variable "root_domain" {
  type        = string
  default     = "nearbynearby.com"
  description = "Apex domain for the ACM certificate. The cert also carries the *.<root_domain> wildcard SAN, which covers admin and www."
}

variable "ssl_policy" {
  type        = string
  default     = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  description = "TLS security policy for the HTTPS listener (TLS 1.2/1.3, modern ciphers)."
}

variable "enable_https_listener" {
  type        = bool
  default     = false
  description = <<-EOT
    Two-stage rollout gate for origin TLS.
    false (stage 1): create the ACM cert + emit its DNS validation records; port 80 keeps forwarding (no downtime).
    true  (stage 2, after the cert is ISSUED): create the 443 HTTPS listener + admin host rule, and flip port 80 to a 301 redirect to HTTPS.
    See docs/infrastructure/origin-tls.md.
  EOT
}
