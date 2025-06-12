![Greenlock](^/lock.png?size=small)

Doh's Greenlock integration helps you manage SSL certificates for your applications using Let's Encrypt. It automatically handles certificate issuance, validation, and renewal so you don't have to worry about manual certificate management.

This guide covers:
* Setting up Greenlock in your Doh application
* Configuring domains and subdomains for certificates
* Understanding automatic certificate renewal
* Working with the Express server integration
* Troubleshooting common certificate issues

## Overview

> MASSIVE NOTE: At the moment, greenlock **ONLY** works with **Node.js**. You may continue to use DohRuntime and/or Bun for all install and operation tasks that DO NOT involve greenlock.

The Greenlock integration offers:

- Automated certificate issuance for domains and subdomains
- Scheduled certificate renewal
- Support for multiple domains and subdomains
- Configurable renewal thresholds and timing
- Staging option for testing without rate limits
- Command-line options for manual renewal

## Configuration

Configure Greenlock in your `pod.yaml` file under the `letsencrypt` section:

```yaml
letsencrypt:
  # Required email for Let's Encrypt notifications
  email: "admin@example.com"
  
  # Use staging environment for testing (no rate limits but certificates aren't trusted)
  staging: false
  
  # Primary domains to secure
  domains:
    - "example.com"
  
  # Subdomains to secure (will be applied to each primary domain)
  subdomains:
    - "www"
    - "api"
  
  # External domains (complete domains that are separate from your main domains)
  external_domains:
    - "other-site.com"
  
  # Random time between 2-4 AM by default
  renewal_hour: 3
  renewal_minute: 15
  
  # How often to check if renewal is needed (in milliseconds)
  checkInterval: 3600000  # 1 hour
  
  # Number of days before expiration to attempt renewal
  renewal_threshold_days: 30
```

## Integration with Express Server

The Express server automatically detects and uses SSL certificates managed by Greenlock. When SSL is enabled:

1. The server first checks for certificates specified in the `ssl_info` configuration
2. If not explicitly configured, it looks for Let's Encrypt certificates at the standard path:
   - `/etc/letsencrypt/live/[hostname]/privkey.pem`
   - `/etc/letsencrypt/live/[hostname]/fullchain.pem`

This means once Greenlock successfully issues certificates, your server will use them automatically:

```yaml
express_config:
  hostname: "example.com"
  port: 80
  ssl_port: 443
  # SSL info can be omitted if using standard Let's Encrypt paths
  # or you can explicitly set paths:
  ssl_info:
    keyfile: "/etc/letsencrypt/live/example.com/privkey.pem"
    certfile: "/etc/letsencrypt/live/example.com/fullchain.pem"
```

## Certificate Renewal

Certificates are automatically renewed based on these conditions:

1. The certificate will expire within the configured threshold (default 30 days)
2. The current time is within the scheduled renewal window
3. No renewal has occurred today

The renewal process follows HTTP-01 validation, requiring your server to be publicly accessible on port 80 during the renewal process. (express_server natively attempts to do this, if your firewall and other network is setup for it.)

## Manual Certificate Renewal

To force a certificate renewal regardless of expiration date:

```bash
node doh force-greenlock
```

This is useful when:
- You've added new domains or subdomains
- You're switching from staging to production
- Your certificates have become invalid for any reason

## Requirements

To use Greenlock integration:

1. Install the Greenlock CLI globally:
   ```bash
   npm install -g greenlock-cli
   ```

2. Ensure your server is accessible from the internet on both HTTP (port 80) and HTTPS (port 443) (Meaning to check firewalls and routes, Doh will serve any required content or files for the vaildation process)
3. Configure a valid email address for expiration notifications and recovery

## Domain Validation

Let's Encrypt validates domain ownership using the HTTP-01 challenge method:

1. Let's Encrypt provides a token
2. Greenlock places this token at a specific URL on your server
3. Let's Encrypt verifies this token is accessible
4. Certificate is issued upon successful validation

This requires that:
- Your server is publicly accessible on HTTP port 80 (use the doh methods of pod settings and/or forcing to automatically run the required servers)
- No proxy or firewall is blocking the `/.well-known/acme-challenge/` path or port 80/443

## Troubleshooting

Common issues and solutions:

### Certificate Renewal Failures

- Check your server is publicly accessible on port 80/443 (not blocked in firewall)
- Ensure `/.well-known/acme-challenge/` path is not blocked
- Verify DNS records point to your server
- Check disk permissions for certificate storage location

### Rate Limiting Issues

- Use `staging: true` during testing to avoid hitting rate limits
- Rate limits apply per domain and per IP address
- Let's Encrypt has a limit of 5 certificates per domain per week

### Certificate Not Found

If your server reports it cannot find the certificate files:

1. Check that renewal was successful in the logs
2. Verify the correct paths are configured in `ssl_info`
3. Ensure the process has read permissions for the certificate files
4. Try forcing a renewal with `doh run force-greenlock`

## Best Practices

- Start with `staging: true` during initial setup and testing
- Use a valid email address that you monitor for certificate expiration notices
- Set the renewal threshold to at least 30 days to allow plenty of time for renewal attempts
- Store certificates in a persistent location that survives container restarts
- Centralize certificate management if running multiple services or containers

## Security Considerations

- Keep your host secure to prevent unauthorized certificate issuance
- Certificates are public information, but private keys should be protected
- Let's Encrypt certificates are valid for 90 days to limit damage from key compromise
- Use the `renewal_threshold_days` parameter to control how aggressively renewals are attempted 