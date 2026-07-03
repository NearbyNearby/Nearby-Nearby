# Origin TLS (Cloudflare -> ALB), Task 0.6

Encrypts the leg between Cloudflare and the ALB. Before this, Cloudflare talked
plain HTTP to the ALB on port 80 (`Full` or `Flexible` SSL mode), so the origin
hop was unencrypted. After this, the ALB terminates TLS on 443 with an ACM
certificate, port 80 is a 301 redirect to HTTPS, and Cloudflare is set to
`Full (strict)`.

## What Terraform manages

In `terraform/modules/alb`:
- `aws_acm_certificate.origin`: `nearbynearby.com` + SAN `*.nearbynearby.com`
  (the wildcard covers `admin.` and `www.`), DNS validation, us-east-1.
- `aws_acm_certificate_validation.origin` (stage 2 only): polls ACM until the
  cert is `ISSUED`. It does NOT create the DNS records (those live in Cloudflare
  and are added by hand), so it has no `validation_record_fqdns`.
- `aws_lb_listener.https` (stage 2 only): port 443, `ssl_policy =
  ELBSecurityPolicy-TLS13-1-2-2021-06` (TLS 1.2/1.3), the ACM cert, default
  forward to the app target group.
- `aws_lb_listener_rule.admin_https` (stage 2 only): host
  `admin.nearbynearby.com` -> admin target group (mirrors the port-80 rule).
- `aws_lb_listener.http` (port 80): forwards in stage 1; becomes a 301 redirect
  to HTTPS in stage 2 (preserving host/path/query). In-place update.
- `aws_lb_listener_rule.admin`: forwards the admin host in stage 1; also becomes
  a 301 redirect in stage 2, so port 80 never serves the admin app in plaintext.
  In-place update.

The ALB security group already allows 443 from anywhere (in the networking
module), so no security-group change is needed.

## Why two stages

DNS validation records must exist in Cloudflare before ACM will issue the cert,
and there is no Cloudflare provider/token in this repo, so the CNAMEs are added
by hand. A single `terraform apply` that both created the cert and blocked on
`aws_acm_certificate_validation` would hang until those records existed, then
time out. Splitting into two stages keeps each apply fast and non-blocking.

The rollout is gated by the `enable_https_listener` variable (default `false`):

- Stage 1 (`false`): create the ACM cert and emit its validation records. Port
  80 keeps forwarding, so there is zero user impact. Plan: `1 to add, 0 change,
  0 destroy`.
- Stage 2 (`true`, after the cert is `ISSUED`): create the 443 listener + admin
  rule and flip port 80 to a redirect. Plan: `4 to add, 2 to change, 0 destroy`
  (the 2 in-place changes are the port-80 default action and the admin rule, both
  forward -> 301 redirect). No destroys.

## Apply sequence

All commands run from `terraform/environments/prod` with the `nn-prod` profile and
the TF_VAR SSM recipe from `CLAUDE.md`. State has no lock table, so `-lock=false`.

```bash
cd terraform/environments/prod
export AWS_PROFILE=nn-prod AWS_REGION=us-east-1
export TF_VAR_database_url="$(aws ssm get-parameter --name /nearbynearby/prod/database-url --with-decryption --query Parameter.Value --output text)"
export TF_VAR_forms_database_url="$(aws ssm get-parameter --name /nearbynearby/prod/forms-database-url --with-decryption --query Parameter.Value --output text)"
export TF_VAR_secret_key="$(aws ssm get-parameter --name /nearbynearby/prod/secret-key --with-decryption --query Parameter.Value --output text)"
terraform init -input=false
```

### Stage 1: create the cert, read the validation records

```bash
terraform plan  -lock=false                 # expect: 1 to add (the ACM cert), 0 change, 0 destroy
terraform apply -lock=false                 # creates the cert in PENDING_VALIDATION
terraform output origin_certificate_validation_records
```

The output is a map keyed by domain. ACM usually dedupes the apex and wildcard to
a single CNAME, so there may be one entry. Each entry has `name`, `type` (CNAME),
`value`.

### Cloudflare: add the validation CNAME(s)

In the Cloudflare dashboard for `nearbynearby.com`, DNS -> Records, for every
distinct `{name -> value}` from the output:
- Type: `CNAME`
- Name: the `name` (Cloudflare will strip the trailing `.nearbynearby.com.`; paste
  the full value, it normalizes it)
- Target: the `value`
- Proxy status: **DNS only** (grey cloud). Validation CNAMEs must not be proxied.

Wait for ACM to report `ISSUED` (usually a few minutes):

```bash
aws acm describe-certificate --profile nn-prod --region us-east-1 \
  --certificate-arn "$(terraform output -raw origin_certificate_arn)" \
  --query 'Certificate.Status' --output text
# ISSUED
```

Do not proceed to stage 2 until this prints `ISSUED`.

### Stage 2: 443 listener + port-80 redirect

```bash
terraform plan  -lock=false -var enable_https_listener=true   # expect: 4 add, 2 change, 0 destroy
terraform apply -lock=false -var enable_https_listener=true
```

Persist the flag so future plans stay at stage 2: set `enable_https_listener =
true` in `terraform.tfvars` instead of passing `-var` each time.

At this point the ALB serves HTTPS on 443 and redirects 80 -> 443, but Cloudflare
is still connecting to the origin on 80 (its current SSL mode). Verify the origin
directly (below) BEFORE flipping Cloudflare, so a bad cert can not take the site
down.

### Cloudflare: flip SSL mode to Full (strict)

Only AFTER the 443 listener is live and verified: Cloudflare dashboard ->
SSL/TLS -> Overview -> set encryption mode to **Full (strict)**. Cloudflare now
connects to the ALB over HTTPS and validates the ACM cert. The apex/admin/www
records stay proxied (orange cloud) as they are today. Leave the "Always Use
HTTPS" edge setting as-is; the ALB's port-80 redirect is the origin-side backstop.

## Verification

Origin, before touching Cloudflare (the ALB has no public DNS name of its own for
these hostnames, so send the `Host` header; `-k` because the cert is valid for the
domains, not the ELB name):

```bash
ALB=nearbynearby-prod-1716569837.us-east-1.elb.amazonaws.com

# 443 terminates TLS and routes by host
curl -skI https://$ALB/            -H 'Host: nearbynearby.com'        | head -1   # HTTP/2 200
curl -skI https://$ALB/api/health  -H 'Host: nearbynearby.com'                    # 200 health JSON path
curl -skI https://$ALB/            -H 'Host: admin.nearbynearby.com'  | head -1   # 200 (admin frontend)

# 80 redirects to HTTPS for both hosts
curl -sI  http://$ALB/  -H 'Host: nearbynearby.com'       | grep -iE 'HTTP/|location'   # 301 -> https://nearbynearby.com/
curl -sI  http://$ALB/  -H 'Host: admin.nearbynearby.com' | grep -iE 'HTTP/|location'   # 301 -> https://admin.nearbynearby.com/

# Cert actually presented on 443 covers the domains
echo | openssl s_client -connect $ALB:443 -servername nearbynearby.com 2>/dev/null \
  | openssl x509 -noout -subject -ext subjectAltName
```

After flipping Cloudflare to Full (strict), through the edge:

```bash
curl -sI https://nearbynearby.com/        | head -1        # 200
curl -sI https://admin.nearbynearby.com/  | head -1        # 200
curl -sI http://nearbynearby.com/         | grep -i location   # redirect to https
```

Both sites should load in a browser with no certificate warnings.

## Rollback

The safest rollback is at the Cloudflare edge (instant, no apply): SSL/TLS ->
Overview -> set the mode back to **Full** (or **Flexible**). Cloudflare then talks
to the origin on port 80 again. Port 80 still exists on the ALB (it redirects to
443 in stage 2), so:

- `Full`: Cloudflare would follow the 80 -> 443 redirect; leave the ALB as-is.
- `Flexible`: Cloudflare talks HTTP to origin and does NOT follow the redirect,
  so revert the ALB too (below) to keep port 80 serving content.

To revert the ALB (removes the 443 listener and restores port 80 to forwarding):

```bash
terraform apply -lock=false -var enable_https_listener=false
```

This is `0 destroy` on the listeners (the two rules/listeners flip back in-place
or are removed cleanly); the ACM cert stays (harmless, unused). Do the Cloudflare
mode change FIRST, then the ALB revert, so the edge is never pointed at a 443
listener that no longer exists.

## Notes

- The stage-2 plan, if run before stage 1 is applied, shows the ACM cert as an
  add (4 add total) because the cert does not exist in state yet. Run in order and
  the stage-2 plan sees the cert unchanged.
- The ACM cert must live in us-east-1 (same region as the ALB). The prod provider
  is already us-east-1.
- Cloudflare API token: none is configured locally (no `CLOUDFLARE_API_TOKEN`,
  `~/.cloudflare`, or wrangler config), so the DNS records and the SSL-mode flip
  are manual dashboard steps. If a token is added later, a `cloudflare_record`
  resource could automate the validation CNAMEs, but the SSL-mode ordering rule
  above still stands.
