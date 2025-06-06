# Oracle Cloud Infrastructure (OCI) Server Setup with Doh

## 1. Initial OCI Account Setup

### Prerequisites:
- Valid credit card (no charges for free tier)
- Authenticator app installed on your device
- SSH RSA key pair generated on your local machine
- Domain name with access to DNS settings

### Account Creation:
1. Visit https://signup.cloud.oracle.com/
2. Complete registration process
3. Set up two-factor authentication with your authenticator app

## 2. VM Instance Configuration

### Create and Configure VM:
1. Navigate to Compute > Instances > Create Instance
2. Configure instance settings:
   ```
   Image: Ubuntu (latest non-minimal)
   Shape: VM.Standard.A1.Flex (or preferred configuration)
   Network: Default VCN
   Subnet: Default subnet
   ```
3. Upload your SSH public key (`.pub` file)

### Reserve Static IP:
1. Navigate to Networking > IP Management > Reserved Public IPs
2. Click "Reserve Public IP"
   ```
   Name: [your-domain]-ip
   Compartment: [your-compartment]
   ```

### Assign Reserved IP:
1. Go to Compute > Instances > [Your Instance] > Attached VNICs > Primary VNIC
2. Edit IPv4 address:
   ```
   Step 1: Change to "No Public IP"
   Step 2: Immediately edit again
   Step 3: Select "Reserved Public IP"
   Step 4: Choose your reserved IP
   ```

## 3. Network Security Configuration

### Configure Security Rules:
Configure both Network Security Group AND Security List:
```
Ingress Rules:
- Port 80 (HTTP)
- Port 443 (HTTPS)
Source CIDR: 0.0.0.0/0
```

### Domain Configuration:
Add DNS records at your domain registrar:
```
A Record:
  Host: @ or domain
  Value: [Your Reserved IP]

CNAME Record (optional):
  Host: www
  Value: [Your Domain]
```

## 4. Server Initial Setup

### First Login and Directory Setup:
```bash
# Connect to server
ssh ubuntu@[Your-IP]

# Update system
sudo apt update
sudo apt upgrade

# Create and configure directories
sudo mkdir /var/www
sudo chmod -R 775 /var/www
sudo chown -R ubuntu:ubuntu /var/www

sudo mkdir /etc/letsencrypt
sudo chmod -R 775 /etc/letsencrypt
sudo chown -R ubuntu:ubuntu /etc/letsencrypt

# Don installer requires unzip, and ubuntu no longer ships it
sudo apt install unzip

# Reload shell environment
source ~/.bashrc
```

### Install the DohRuntime and Bun:
```bash
# Install DohRuntime
curl -fsSL https://deploydoh.com/install | bash

# Reload shell environment to use Doh commands
source ~/.bashrc

doh install bun

# Reload shell environment to use Bun commands
source ~/.bashrc
```

## 5. Doh Installation and Configuration

### Set up Project Directory:
```bash
cd /var/www
mkdir [example.com]
cd [example.com]

# Init a Doh webserver
doh init webserver

# Install global dependencies
bun install -g pm2 greenlock-cli

# Reload shell environment
source ~/.bashrc
```

### Configure SSL and Server Settings:
```bash
cd /var/www/[example.com]

# Install Greenlock CLI Doh Module
doh install greenlockcli

# Update Doh again
doh update
```

### Configure pod.yaml:
Add the following to your pod.yaml:
```yaml
letsencrypt:
  email: [youremail@example.com]
  subdomains:
    - www
express_config:
  port: 80
  ssl_port: 443
  hostname: [example.com]
```

## 6. Network and Security Configuration

### Configure Ports and Permissions:
```bash
# Configure firewall
sudo iptables -A INPUT -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -A INPUT -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save

# Set environment permissions
sudo setcap 'cap_net_bind_service=+ep' $(which node)
sudo setcap 'cap_net_bind_service=+ep' $(which bun)
sudo setcap 'cap_net_bind_service=+ep' $(which doh)

# Reload shell environment
source ~/.bashrc
```

### SSL Certificate Setup:
```bash
# Update Doh configuration
doh update

# Force SSL certificate generation
doh force-greenlock
```

## 7. Final Setup and Process Management

### Test Server:
```bash
# Start Doh server
doh run
```

### Configure PM2:
```bash
# Set up PM2 process management
doh pm2

# Follow PM2 startup configuration instructions
# This typically involves running the suggested pm2 startup command
```

## Troubleshooting Tips

1. **Certificate Issues:**
   - Verify domain DNS propagation
   - Check port 80/443 accessibility
   - Review Greenlock logs

2. **Permission Problems:**
   - Verify directory ownership
   - Check Node.js port binding permissions
   - Review PM2 logs

3. **Network Issues:**
   - Confirm security group rules
   - Verify IP assignment
   - Test port accessibility