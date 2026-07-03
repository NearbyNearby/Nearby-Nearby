resource "aws_lb" "main" {
  name               = "${var.project}-${var.environment}"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [var.alb_security_group_id]
  subnets            = var.public_subnet_ids

  tags = { Name = "${var.project}-${var.environment}-alb" }
}

# --- ACM certificate for encrypted Cloudflare -> ALB origin traffic ---
# Apex + wildcard SAN (the wildcard covers admin.* and www.*). DNS-validated:
# the validation CNAMEs are emitted as outputs and added MANUALLY in Cloudflare
# (no Cloudflare provider/token in this repo). The cert is created unconditionally
# in stage 1 so its validation records are known; the HTTPS listener that uses it
# is gated on enable_https_listener (stage 2). See docs/infrastructure/origin-tls.md.
resource "aws_acm_certificate" "origin" {
  domain_name               = var.root_domain
  subject_alternative_names = ["*.${var.root_domain}"]
  validation_method         = "DNS"

  lifecycle {
    create_before_destroy = true
  }

  tags = { Name = "${var.project}-${var.environment}-origin-cert" }
}

# Blocks stage 2 until ACM reports the cert ISSUED. We do NOT create the DNS
# records here (they live in Cloudflare, added by hand), so no validation_record_fqdns:
# this resource simply polls ACM. Gated on the flag so stage 1 and a normal plan
# never wait on it. By stage 2 the cert is already ISSUED, so it returns immediately.
resource "aws_acm_certificate_validation" "origin" {
  count           = var.enable_https_listener ? 1 : 0
  certificate_arn = aws_acm_certificate.origin.arn

  timeouts {
    create = "20m"
  }
}

# --- Target Groups ---
resource "aws_lb_target_group" "app" {
  name        = "${var.project}-${var.environment}-app"
  port        = 8000
  protocol    = "HTTP"
  vpc_id      = var.vpc_id
  target_type = "ip"

  health_check {
    enabled             = true
    path                = "/api/health"
    port                = "traffic-port"
    protocol            = "HTTP"
    healthy_threshold   = 2
    unhealthy_threshold = 5
    timeout             = 10
    interval            = 30
    matcher             = "200"
  }

  deregistration_delay = 30

  tags = { Name = "${var.project}-${var.environment}-app-tg" }
}

resource "aws_lb_target_group" "admin" {
  name        = "${var.project}-${var.environment}-admin"
  port        = 5173
  protocol    = "HTTP"
  vpc_id      = var.vpc_id
  target_type = "ip"

  health_check {
    enabled             = true
    path                = "/"
    port                = "traffic-port"
    protocol            = "HTTP"
    healthy_threshold   = 2
    unhealthy_threshold = 3
    timeout             = 5
    interval            = 30
    matcher             = "200"
  }

  deregistration_delay = 30

  tags = { Name = "${var.project}-${var.environment}-admin-tg" }
}

# --- HTTP (port 80) listener ---
# Stage 1 (enable_https_listener=false): forwards to app, as before (no downtime).
# Stage 2 (true): becomes a 301 redirect to HTTPS, preserving host/path/query, so
# both nearbynearby.com and admin.nearbynearby.com upgrade to 443. Exactly one
# default_action exists at a time (the two dynamic blocks are mutually exclusive).
resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.main.arn
  port              = 80
  protocol          = "HTTP"

  dynamic "default_action" {
    for_each = var.enable_https_listener ? [] : [1]
    content {
      type             = "forward"
      target_group_arn = aws_lb_target_group.app.arn
    }
  }

  dynamic "default_action" {
    for_each = var.enable_https_listener ? [1] : []
    content {
      type = "redirect"
      redirect {
        port        = "443"
        protocol    = "HTTPS"
        status_code = "HTTP_301"
      }
    }
  }
}

# Admin host routing on port 80.
# Stage 1: forwards admin host to the admin target group (current behavior).
# Stage 2: redirects to HTTPS too, so port 80 never serves the admin app in
# plaintext. Kept (rather than deleted) so stage 2 is an in-place update, not a
# destructive rule replacement.
resource "aws_lb_listener_rule" "admin" {
  listener_arn = aws_lb_listener.http.arn
  priority     = 100

  dynamic "action" {
    for_each = var.enable_https_listener ? [] : [1]
    content {
      type             = "forward"
      target_group_arn = aws_lb_target_group.admin.arn
    }
  }

  dynamic "action" {
    for_each = var.enable_https_listener ? [1] : []
    content {
      type = "redirect"
      redirect {
        port        = "443"
        protocol    = "HTTPS"
        status_code = "HTTP_301"
      }
    }
  }

  condition {
    host_header {
      values = [var.admin_domain]
    }
  }
}

# --- HTTPS (port 443) listener: encrypted origin, same host-based routing ---
# Created only in stage 2. Default forwards to app; the admin host rule below
# forwards admin.nearbynearby.com to the admin target group (mirrors port 80).
resource "aws_lb_listener" "https" {
  count             = var.enable_https_listener ? 1 : 0
  load_balancer_arn = aws_lb.main.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = var.ssl_policy
  certificate_arn   = aws_acm_certificate_validation.origin[0].certificate_arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.app.arn
  }
}

# Admin host routing rule on the HTTPS listener.
resource "aws_lb_listener_rule" "admin_https" {
  count        = var.enable_https_listener ? 1 : 0
  listener_arn = aws_lb_listener.https[0].arn
  priority     = 100

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.admin.arn
  }

  condition {
    host_header {
      values = [var.admin_domain]
    }
  }
}
