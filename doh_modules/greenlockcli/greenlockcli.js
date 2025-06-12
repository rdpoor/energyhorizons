Doh.Pod('greenlockcli', {
  letsencrypt: {
    moc: {
      email: 'IsString',
      staging: 'IsBoolean',
      domains: 'IsArray',
      subdomains: 'IsArray',
      external_domains: 'IsArray',
      renewal_hour: 'IsNumber',
      renewal_minute: 'IsNumber',
      checkInterval: 'IsNumber',
      renewal_threshold_days: 'IsNumber',
      debug: 'IsBoolean'
    },
    // Default configuration
    email: '',
    staging: false,
    domains: [],
    subdomains: [],
    external_domains: [],
    // Default to a random time between 2-4 AM
    renewal_hour: 2 + Math.floor(Math.random() * 2),
    renewal_minute: Math.floor(Math.random() * 60),
    checkInterval: 60 * 60 * 1000,
    // New: Renewal threshold in days (default 30)
    renewal_threshold_days: 30,
    // Optionally, you can also configure certfile/keyfile if needed

    // Force a renewal of the Let's Encrypt certificates
    // be very careful with this, it will force a renewal of the certificates every time the pod starts
    force_renewal: false,
    allow_renewal: true,
    debug: false
  }
});
Doh.CLI('greenlockcli', {
  'force-greenlock': {
    file: '^/greenlockcli.cli.js',
    help: 'Force a renewal of the Let\'s Encrypt certificates',
  }
});
Doh.Install('greenlockcli', {
  'npm:acme-client': ''
});
Doh.Module('greenlockcli', [
  'import acme from "acme-client"',
  'import http from "http"',
  'import net from "net"',
  'fs',
  'path'
], async function (acme, http, net, fs, path) {
  const config = Doh.pod.letsencrypt;
  // make sure we have the domains array populated with the hostname
  Doh.meld_arrays(config.domains, [Doh.pod.express_config?.hostname]);
  // the webroot is the root of the pod
  config.webroot = DohPath('/');
  
  const secretHTTP = http;

  class GreenlockManager {
    constructor() {
      this.lastRun = null;
      this.checkInterval = config.checkInterval;
      // New flag to prevent overlapping renewals.
      this.isRenewing = false;
      // ACME client will be initialized in initialize()
      this.acmeClient = null;
      this.accountKey = null;
      // Temporary server for challenge handling
      this.tempServer = null;
    }

    async isPortOpen(port, host = 'localhost') {
      return new Promise((resolve) => {
        const connection = net.connect({ port, host }, () => {
          connection.end();
          resolve(true);
        });
        
        connection.on('error', () => {
          resolve(false);
        });
        
        // Timeout after 2 seconds
        setTimeout(() => {
          connection.destroy();
          resolve(false);
        }, 2000);
      });
    }

    async startTemporaryServer() {
      return new Promise((resolve, reject) => {
        // Create a simple HTTP server to serve .well-known challenges
        this.tempServer = secretHTTP.createServer((req, res) => {
          if (req.url && req.url.startsWith('/.well-known/acme-challenge/')) {
            const challengeFile = path.join(config.webroot, req.url);
            
            if (fs.existsSync(challengeFile)) {
              const content = fs.readFileSync(challengeFile, 'utf8');
              res.writeHead(200, { 'Content-Type': 'text/plain' });
              res.end(content);
              console.log(Doh.colorize(`Served challenge: ${req.url}`, 'green'));
            } else {
              res.writeHead(404, { 'Content-Type': 'text/plain' });
              res.end('Challenge not found');
              console.log(Doh.colorize(`Challenge not found: ${req.url}`, 'yellow'));
            }
          } else {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Not found');
          }
        });

        this.tempServer.listen(80, (err) => {
          if (err) {
            console.error(Doh.colorize(`Failed to start temporary server on port 80: ${err.message}`, 'red'));
            console.error(Doh.colorize(`Note: Port 80 must be available for Let's Encrypt HTTP-01 challenges`, 'yellow'));
            console.error(Doh.colorize(`Make sure your proxy/firewall routes port 80 to your express server (port ${Doh.pod.express_config?.port || 3000}) when it's running`, 'yellow'));
            reject(err);
          } else {
            console.log(Doh.colorize('Started temporary HTTP server on port 80 for ACME challenges', 'green'));
            console.log(Doh.colorize('This server will handle /.well-known/acme-challenge/ requests until certificate renewal completes', 'green'));
            resolve();
          }
        });
      });
    }

    async stopTemporaryServer() {
      if (this.tempServer) {
        return new Promise((resolve) => {
          this.tempServer.close(() => {
            console.log(Doh.colorize('Stopped temporary HTTP server', 'green'));
            this.tempServer = null;
            resolve();
          });
        });
      }
    }

    async initializeAcmeClient() {
      try {
        // Generate or load account key
        const accountKeyPath = DohPath('/.doh/static/acme-account-key.pem');
        
        if (fs.existsSync(accountKeyPath)) {
          // Load existing account key
          this.accountKey = fs.readFileSync(accountKeyPath, 'utf8');
          console.log(Doh.colorize('Loaded existing ACME account key', 'green'));
        } else {
          // Generate new account key
          console.log(Doh.colorize('Generating new ACME account key...', 'yellow'));
          this.accountKey = await acme.crypto.createPrivateRsaKey();
          
          // Save account key
          fs.mkdirSync(path.dirname(accountKeyPath), { recursive: true });
          fs.writeFileSync(accountKeyPath, this.accountKey);
          fs.chmodSync(accountKeyPath, 0o600); // Restrict permissions
          console.log(Doh.colorize('Generated and saved new ACME account key', 'green'));
        }

        // Initialize ACME client
        const directoryUrl = config.staging 
          ? acme.directory.letsencrypt.staging 
          : acme.directory.letsencrypt.production;

        // Very visible staging indicator
        if (config.staging) {
          console.log(Doh.colorize('🚨 ==========================================', 'yellow'));
          console.log(Doh.colorize('🚨 WARNING: USING LET\'S ENCRYPT STAGING!', 'yellow'));
          console.log(Doh.colorize('🚨 Certificates will NOT be trusted by browsers', 'yellow'));
          console.log(Doh.colorize('🚨 ==========================================', 'yellow'));
        } else {
          console.log(Doh.colorize('🔒 Using Let\'s Encrypt PRODUCTION server', 'green'));
          console.log(Doh.colorize('🔒 Certificates will be trusted by browsers', 'green'));
        }

        this.acmeClient = new acme.Client({
          directoryUrl,
          accountKey: this.accountKey,
        });

        // Create account if it doesn't exist
        try {
          await this.acmeClient.createAccount({
            termsOfServiceAgreed: true,
            contact: [`mailto:${config.email}`],
          });
          console.log(Doh.colorize('ACME account created or verified successfully', 'green'));
        } catch (error) {
          if (error.message && error.message.includes('Account already exists')) {
            console.log(Doh.colorize('ACME account already exists, continuing...', 'green'));
          } else {
            throw error;
          }
        }

        return true;
      } catch (error) {
        console.error(Doh.colorize(`Failed to initialize ACME client: ${error.message}`, 'red'));
        return false;
      }
    }

    async initialize() {
      // Initialize ACME client first
      const acmeInitialized = await this.initializeAcmeClient();
      if (!acmeInitialized) {
        console.error(Doh.colorize('Failed to initialize ACME client, certificate management disabled', 'red'));
        return;
      }

      // Start the renewal check loop
      await this.checkRenewal();
      
      if (config.staging) {
        console.log(Doh.colorize('🚨 ACME STAGING client initialized - certificates will NOT be browser-trusted!', 'yellow'));
      } else {
        console.log(Doh.colorize('🔒 ACME PRODUCTION client initialized - no external dependencies required!', 'green'));
      }
      // Convert ms to a human readable duration
      const duration = (ms) => {
        const years = Math.floor(ms / (1000 * 60 * 60 * 24 * 365));
        const months = Math.floor((ms % (1000 * 60 * 60 * 24 * 365)) / (1000 * 60 * 60 * 24 * 30));
        const weeks = Math.floor((ms % (1000 * 60 * 60 * 24 * 30)) / (1000 * 60 * 60 * 24 * 7));
        const days = Math.floor((ms % (1000 * 60 * 60 * 24 * 7)) / (1000 * 60 * 60 * 24));
        const hours = Math.floor((ms % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((ms % (1000 * 60)) / 1000);
        const parts = [];
        if (years) parts.push(`${years}y`);
        if (months) parts.push(`${months}m`);
        if (weeks) parts.push(`${weeks}w`);
        if (days) parts.push(`${days}d`);
        if (hours) parts.push(`${hours}h`);
        if (minutes) parts.push(`${minutes}m`);
        if (seconds) parts.push(`${seconds}s`);
        return parts.join(' ') || '0s';
      };
      console.log(Doh.colorize(`Greenlock CLI renewal check interval: ${duration(this.checkInterval)}`, 'green'));
      setInterval(async () => await this.checkRenewal(), this.checkInterval);
    }

    getAllDomains() {
      const mainDomains = IsArray(config.domains) ? config.domains : [];
      const subdomains = IsArray(config.subdomains) ? config.subdomains : [];
      const externalDomains = IsArray(config.external_domains) ? config.external_domains : [];

      // Create full domain list
      const allDomains = new Set();

      mainDomains.forEach(domain => {
        allDomains.add(domain);
        // Add subdomains for each main domain
        subdomains.forEach(sub => allDomains.add(`${sub}.${domain}`));
      });

      // Add external domains
      externalDomains.forEach(domain => allDomains.add(domain));

      return Array.from(allDomains);
    }

    async prepareCertificateRequest() {
      const domains = this.getAllDomains();
      if (!domains.length) {
        throw new Error('No domains configured for SSL certificates');
      }
      
      // Use standard Let's Encrypt paths by default to match express server expectations
      const hostname = Doh.pod.express_config?.hostname || domains[0];
      const defaultKeyfile = `/etc/letsencrypt/live/${hostname}/privkey.pem`;
      const defaultCertfile = `/etc/letsencrypt/live/${hostname}/fullchain.pem`;
      
      const keyfile = config.keyfile || Doh.pod.express_config?.ssl_info?.keyfile || Doh.pod.express_config?.ssl_info?.key || defaultKeyfile;
      const certfile = config.certfile || Doh.pod.express_config?.ssl_info?.certfile || Doh.pod.express_config?.ssl_info?.cert || defaultCertfile;

      // ensure we have the directories for the key and cert
      console.log(Doh.colorize(`Ensuring directories for key: ${keyfile}`, 'yellow'));
      if (keyfile) {
        fs.mkdirSync(path.dirname(keyfile), { recursive: true });
      }
      if (certfile) {
        fs.mkdirSync(path.dirname(certfile), { recursive: true });
      }

      // Generate or load certificate private key
      let certificateKey;
      let keyExists = keyfile && fs.existsSync(keyfile) && fs.statSync(keyfile).size > 0;
      
      if (keyExists) {
        certificateKey = fs.readFileSync(keyfile, 'utf8');
        if (config.debug) console.log(Doh.colorize('Using existing certificate private key', 'green'));
      } else {
        console.log(Doh.colorize('Generating new certificate private key...', 'yellow'));
        certificateKey = await acme.crypto.createPrivateRsaKey();
        
        if (config.debug) {
          // Verify private key format
          const keyString = typeof certificateKey === 'string' ? certificateKey : certificateKey.toString();
          console.log(Doh.colorize(`Private key length: ${keyString.length} characters`, 'green'));
          console.log(Doh.colorize(`Private key starts with: ${keyString.substring(0, 50)}...`, 'green'));
          
          if (!keyString.startsWith('-----BEGIN RSA PRIVATE KEY-----') && 
              !keyString.startsWith('-----BEGIN PRIVATE KEY-----')) {
            console.log(Doh.colorize('Warning: Private key may not be in PEM format', 'yellow'));
          } else {
            console.log(Doh.colorize('Private key is in proper PEM format', 'green'));
          }
        }
        
        if (keyfile) {
          const keyToSave = typeof certificateKey === 'string' ? certificateKey : certificateKey.toString();
          fs.writeFileSync(keyfile, keyToSave);
          fs.chmodSync(keyfile, 0o600);
          if (config.debug) console.log(Doh.colorize(`Saved new certificate private key to: ${keyfile}`, 'green'));
        }
      }
      
      if (config.debug) {
        // Verify the private key we're about to use
        const keyStr = typeof certificateKey === 'string' ? certificateKey : certificateKey.toString();
        console.log(Doh.colorize(`Using private key with fingerprint: ${keyStr.substring(27, 70)}...`, 'yellow'));
        
        // Detailed private key analysis
        const keyType = keyStr.includes('-----BEGIN RSA PRIVATE KEY-----') ? 'RSA PRIVATE KEY' : 
                       keyStr.includes('-----BEGIN PRIVATE KEY-----') ? 'PRIVATE KEY' : 'UNKNOWN';
        console.log(Doh.colorize(`Private key format: ${keyType}`, 'cyan'));
        
        // Check for any non-standard characters or formatting issues
        const hasWindowsLineEndings = keyStr.includes('\r\n');
        const hasUnixLineEndings = keyStr.includes('\n') && !keyStr.includes('\r\n');
        console.log(Doh.colorize(`Key line endings: ${hasWindowsLineEndings ? 'Windows (\\r\\n)' : hasUnixLineEndings ? 'Unix (\\n)' : 'Unknown'}`, 'cyan'));
      }

      // Generate CSR
      console.log(Doh.colorize(`Generating CSR for domains: ${domains.join(', ')}`, 'yellow'));
      const keyForCsr = typeof certificateKey === 'string' ? certificateKey : certificateKey.toString();
      
      const [generatedKey, csr] = await acme.crypto.createCsr({
        key: keyForCsr,
        altNames: domains,
      });
      
      // Handle the known issue where createCsr ignores the provided key
      if (generatedKey && generatedKey !== keyForCsr) {
        if (config.debug) {
          console.log(Doh.colorize(`⚠️  createCsr generated its own key (known issue)`, 'yellow'));
          console.log(Doh.colorize(`   Using the key that matches the CSR`, 'yellow'));
        }
        
        // Use the returned key instead since that's what the CSR was made with
        const generatedKeyStr = typeof generatedKey === 'string' ? generatedKey : generatedKey.toString();
        certificateKey = generatedKeyStr;
        
        // Re-save the correct key to the file to overwrite the wrong one
      if (keyfile) {
          fs.writeFileSync(keyfile, certificateKey);
          fs.chmodSync(keyfile, 0o600);
          if (config.debug) console.log(Doh.colorize(`   Updated private key file to match CSR`, 'green'));
        }
      }
      
      if (config.debug) {
        // Verify CSR was created with the correct private key
        console.log(Doh.colorize(`CSR generated successfully`, 'green'));
        console.log(Doh.colorize(`CSR type: ${typeof csr}`, 'green'));
        
        // Handle CSR whether it's a string or Buffer
        const csrString = typeof csr === 'string' ? csr : csr.toString();
        console.log(Doh.colorize(`CSR length: ${csrString.length} characters`, 'green'));
        console.log(Doh.colorize(`CSR starts with: ${csrString.substring(0, 50)}...`, 'green'));
      }

      return {
        domains,
        certificateKey, // Use the final certificateKey (either original or corrected by createCsr)
        csr,
        keyfile,
        certfile
      };
    }

    async handleWebrootChallenge(authz, challenge, keyAuthorization) {
      try {
        // Create the challenge file path
        const challengePath = path.join(config.webroot, '.well-known', 'acme-challenge', challenge.token);
        
        // Ensure the directory exists
        fs.mkdirSync(path.dirname(challengePath), { recursive: true });
        
        // Write the key authorization to the challenge file
        fs.writeFileSync(challengePath, keyAuthorization);
        
        if (config.debug) {
          console.log(Doh.colorize(`Created challenge file: ${challengePath}`, 'green'));
          console.log(Doh.colorize(`Challenge URL: http://${authz.identifier.value}/.well-known/acme-challenge/${challenge.token}`, 'yellow'));
        }
        
        return true;
      } catch (error) {
        console.error(Doh.colorize(`Failed to create challenge file: ${error.message}`, 'red'));
        throw error;
      }
    }

    async removeWebrootChallenge(authz, challenge, keyAuthorization) {
      try {
        const challengePath = path.join(config.webroot, '.well-known', 'acme-challenge', challenge.token);
        
        if (fs.existsSync(challengePath)) {
          fs.unlinkSync(challengePath);
          if (config.debug) console.log(Doh.colorize(`Removed challenge file: ${challengePath}`, 'green'));
        }
        
        // Try to remove empty directories (optional cleanup)
        try {
          const challengeDir = path.dirname(challengePath);
          const wellKnownDir = path.dirname(challengeDir);
          
          if (fs.existsSync(challengeDir) && fs.readdirSync(challengeDir).length === 0) {
            fs.rmdirSync(challengeDir);
          }
          if (fs.existsSync(wellKnownDir) && fs.readdirSync(wellKnownDir).length === 0) {
            fs.rmdirSync(wellKnownDir);
          }
        } catch (cleanupError) {
          // Ignore cleanup errors
        }
        
        return true;
      } catch (error) {
        console.error(Doh.colorize(`Failed to remove challenge file: ${error.message}`, 'red'));
        // Don't throw here, as cleanup failures shouldn't break the process
        return false;
            }
    }

    async waitForOrderReady(order, maxAttempts = 30, delayMs = 2000) {
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          // Get the current order status
          const currentOrder = await this.acmeClient.getOrder(order);
          
          if (config.debug) console.log(Doh.colorize(`Order status: ${currentOrder.status} (attempt ${attempt}/${maxAttempts})`, 'yellow'));
          
          if (currentOrder.status === 'valid') {
            return currentOrder;
          }
          
          if (currentOrder.status === 'invalid') {
            throw new Error(`Order failed: ${currentOrder.status}`);
          }
          
          // If still pending or processing, wait before next attempt
          if (attempt < maxAttempts) {
            if (config.debug) console.log(Doh.colorize(`Waiting ${delayMs}ms before next check...`, 'yellow'));
            await new Promise(resolve => setTimeout(resolve, delayMs));
          }
        } catch (error) {
          if (attempt === maxAttempts) {
            throw new Error(`Order polling failed: ${error.message}`);
          }
          if (config.debug) console.log(Doh.colorize(`Order check failed (attempt ${attempt}), retrying: ${error.message}`, 'yellow'));
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      }
      
      throw new Error(`Order did not become ready within ${maxAttempts} attempts`);
    }

    async renewCertificates() {
      let needsTemporaryServer = false;
      
      try {
        if (!this.acmeClient) {
          throw new Error('ACME client not initialized');
        }

        console.log(Doh.colorize('Starting ACME certificate renewal process...', 'green'));
        
        // Staging environment warning during renewal
        if (config.staging) {
          console.log(Doh.colorize('⚠️  STAGING MODE: Generated certificates will not be browser-trusted', 'yellow'));
        }

        // Check if the configured express server port is running (main server)
        // Developers typically configure their proxy/firewall to route port 80 → express_config.port
        // If express server is running, we assume the proxy setup will route ACME challenges correctly
        const expressPort = Doh.pod.express_config?.port || 3000;
        const mainServerRunning = await this.isPortOpen(expressPort);
        console.log(Doh.colorize(`Express server (port ${expressPort}) status: ${mainServerRunning ? 'RUNNING (will handle challenges via webroot)' : 'NOT RUNNING (need temporary server)'}`, mainServerRunning ? 'green' : 'yellow'));

        // If main server is not running, start temporary server on port 80
        if (!mainServerRunning) {
          needsTemporaryServer = true;
          await this.startTemporaryServer();
        }

        // If we're doing a forced renewal, clean slate - remove existing files first
        if (Doh.pod.letsencrypt?.force_renewal) {
          const hostname = Doh.pod.express_config?.hostname || 'localhost';
          const defaultKeyfile = `/etc/letsencrypt/live/${hostname}/privkey.pem`;
          const defaultCertfile = `/etc/letsencrypt/live/${hostname}/fullchain.pem`;
          
          const keyfile = config.keyfile || Doh.pod.express_config?.ssl_info?.keyfile || Doh.pod.express_config?.ssl_info?.key || defaultKeyfile;
          const certfile = config.certfile || Doh.pod.express_config?.ssl_info?.certfile || Doh.pod.express_config?.ssl_info?.cert || defaultCertfile;
          
          if (fs.existsSync(certfile)) {
            console.log(Doh.colorize('Forced renewal: removing existing certificate', 'yellow'));
            fs.unlinkSync(certfile);
          }
          if (fs.existsSync(keyfile)) {
            console.log(Doh.colorize('Forced renewal: removing existing private key', 'yellow'));
            fs.unlinkSync(keyfile);
          }
          console.log(Doh.colorize('Forced renewal: starting with clean slate', 'yellow'));
        }

        // Prepare certificate request (will generate fresh key if needed)
        const certRequest = await this.prepareCertificateRequest();
        console.log(Doh.colorize(`Requesting certificate for domains: ${certRequest.domains.join(', ')}`, 'yellow'));
        
        if (config.debug) {
          // Debug: Show what private key we're going to use for the certificate
          const debugKey = typeof certRequest.certificateKey === 'string' ? certRequest.certificateKey : certRequest.certificateKey.toString();
          console.log(Doh.colorize(`🔑 DEBUG: Private key for certificate: ${debugKey.substring(27, 67)}...`, 'cyan'));
        }

        // Create certificate order
        const order = await this.acmeClient.createOrder({
          identifiers: certRequest.domains.map(domain => ({ type: 'dns', value: domain })),
        });

        console.log(Doh.colorize('Created ACME order, processing authorizations...', 'yellow'));

        // Process each authorization
        const authorizations = await this.acmeClient.getAuthorizations(order);
        
        for (const authz of authorizations) {
          console.log(Doh.colorize(`Processing authorization for: ${authz.identifier.value}`, 'yellow'));
          
          // Find http-01 challenge
          const httpChallenge = authz.challenges.find(challenge => challenge.type === 'http-01');
          if (!httpChallenge) {
            throw new Error(`No http-01 challenge found for ${authz.identifier.value}`);
          }

          // Generate key authorization
          const keyAuthorization = await this.acmeClient.getChallengeKeyAuthorization(httpChallenge);
          
          // Create challenge file
          await this.handleWebrootChallenge(authz, httpChallenge, keyAuthorization);
          
          // Verify challenge is accessible (optional internal verification)
          if (config.debug) {
            try {
              await this.acmeClient.verifyChallenge(authz, httpChallenge);
              console.log(Doh.colorize(`Challenge verified for: ${authz.identifier.value}`, 'green'));
            } catch (verifyError) {
              console.log(Doh.colorize(`Challenge verification failed (may still work): ${verifyError.message}`, 'yellow'));
            }
          }

          // Complete challenge
          await this.acmeClient.completeChallenge(httpChallenge);
          console.log(Doh.colorize(`Challenge completed for: ${authz.identifier.value}`, 'green'));

          // Wait for authorization to become valid
          if (config.debug) console.log(Doh.colorize(`Waiting for authorization validation...`, 'yellow'));
          const validatedAuthz = await this.acmeClient.waitForValidStatus(authz);
          console.log(Doh.colorize(`Authorization validated for: ${authz.identifier.value}`, 'green'));

          // Clean up challenge file
          await this.removeWebrootChallenge(authz, httpChallenge, keyAuthorization);
        }

        // Finalize order with CSR
        console.log(Doh.colorize('Finalizing certificate order...', 'yellow'));
        await this.acmeClient.finalizeOrder(order, certRequest.csr);

        // Wait for order to be ready
        console.log(Doh.colorize('Waiting for order to be ready...', 'yellow'));
        let finalOrder = order;
        try {
          finalOrder = await this.waitForOrderReady(order);
        } catch (error) {
          if (config.debug) console.log(Doh.colorize(`Order polling failed, trying simple wait: ${error.message}`, 'yellow'));
          // Fallback to simple wait if polling fails
          await new Promise(resolve => setTimeout(resolve, 5000));
          // Try to get the updated order after the wait
          try {
            finalOrder = await this.acmeClient.getOrder(order);
          } catch (getOrderError) {
            if (config.debug) console.log(Doh.colorize(`Could not get updated order: ${getOrderError.message}`, 'yellow'));
          }
        }

        // Get certificate
        console.log(Doh.colorize('Downloading certificate...', 'yellow'));
        const certificate = await this.acmeClient.getCertificate(finalOrder);
        console.log(Doh.colorize('Certificate issued successfully!', 'green'));
        
        if (config.debug) {
          // Log certificate info for debugging
          console.log(Doh.colorize(`Certificate length: ${certificate.length} characters`, 'green'));
          console.log(Doh.colorize(`Certificate starts with: ${certificate.substring(0, 50)}...`, 'green'));
          
          // Verify it's in PEM format (should start with -----BEGIN CERTIFICATE-----)
          if (!certificate.startsWith('-----BEGIN CERTIFICATE-----')) {
            console.log(Doh.colorize('Warning: Certificate may not be in PEM format', 'yellow'));
          } else {
            console.log(Doh.colorize('Certificate is in proper PEM format', 'green'));
          }
          
          // Count number of certificates in the chain
          const certCount = (certificate.match(/-----BEGIN CERTIFICATE-----/g) || []).length;
          console.log(Doh.colorize(`Certificate chain contains ${certCount} certificate(s)`, 'green'));
          
          // Detailed certificate analysis for debugging production vs staging differences
          const certificates = certificate.split('-----END CERTIFICATE-----').filter(cert => cert.trim());
          console.log(Doh.colorize(`Certificate chain breakdown:`, 'cyan'));
          certificates.forEach((cert, index) => {
            const cleanCert = cert.replace('-----BEGIN CERTIFICATE-----', '').trim();
            if (cleanCert) {
              console.log(Doh.colorize(`  Cert ${index + 1}: ${cleanCert.substring(0, 40)}... (${cleanCert.length} chars)`, 'cyan'));
            }
          });
        }
        
        // Check if this is a staging vs production certificate
        const isStaging = certificate.includes('Fake LE') || certificate.includes('(STAGING)') || config.staging;
        if (config.debug) console.log(Doh.colorize(`Certificate type: ${isStaging ? 'STAGING (test)' : 'PRODUCTION (real)'}`, isStaging ? 'yellow' : 'green'));

        // Write certificate to file
        if (certRequest.certfile) {
          fs.writeFileSync(certRequest.certfile, certificate);
          fs.chmodSync(certRequest.certfile, 0o644);
          console.log(Doh.colorize(`Certificate saved to: ${certRequest.certfile}`, 'green'));
          
          // Verify the certificate matches the private key
          try {
            const savedCert = fs.readFileSync(certRequest.certfile, 'utf8');
            const savedKey = fs.readFileSync(certRequest.keyfile, 'utf8');
            
            // Basic verification that both files exist and have the right headers
            const certValid = savedCert.includes('-----BEGIN CERTIFICATE-----');
            const keyValid = savedKey.includes('-----BEGIN RSA PRIVATE KEY-----') || savedKey.includes('-----BEGIN PRIVATE KEY-----');
            
            if (certValid && keyValid) {
              console.log(Doh.colorize('✅ Certificate and private key files saved successfully', 'green'));
              
              // Verify certificate and private key match
              try {
                const leafCert = savedCert.split('-----END CERTIFICATE-----')[0] + '-----END CERTIFICATE-----';
                const certInfo = await acme.crypto.readCertificateInfo(leafCert);
                
                if (config.debug) {
                  console.log(Doh.colorize(`✅ Certificate validation successful`, 'green'));
                  console.log(Doh.colorize(`   Subject: ${certInfo.domains?.[0] || 'Unknown'}`, 'green'));
                  console.log(Doh.colorize(`   Valid from: ${certInfo.notBefore?.toISOString()}`, 'green'));
                  console.log(Doh.colorize(`   Valid until: ${certInfo.notAfter?.toISOString()}`, 'green'));
                }
                
                // Cryptographic verification
                const crypto = require('crypto');
                const testMessage = 'test-message-for-verification';
                
                const sign = crypto.createSign('SHA256');
                sign.update(testMessage);
                const signature = sign.sign(savedKey);
                
                const cert = crypto.createPublicKey(leafCert);
                const verify = crypto.createVerify('SHA256');
                verify.update(testMessage);
                const isValid = verify.verify(cert, signature);
                
                if (isValid) {
                  console.log(Doh.colorize(`✅ Certificate and private key match - SSL ready`, 'green'));
                } else {
                  console.log(Doh.colorize(`❌ Certificate/key mismatch - SSL may fail`, 'red'));
                  if (config.debug) {
                    const keyObj = crypto.createPrivateKey(savedKey);
                    const keyPubKey = crypto.createPublicKey(keyObj);
                    const certPubKey = crypto.createPublicKey(leafCert);
                    
                    const keyPubDer = keyPubKey.export({ type: 'spki', format: 'der' });
                    const certPubDer = certPubKey.export({ type: 'spki', format: 'der' });
                    
                    console.log(Doh.colorize(`   Debug: Public keys ${keyPubDer.equals(certPubDer) ? 'match' : 'differ'}`, 'yellow'));
                  }
                }
                
              } catch (certValidationError) {
                console.log(Doh.colorize(`⚠️  Certificate validation failed: ${certValidationError.message}`, 'yellow'));
              }
          } else {
              console.log(Doh.colorize('⚠️  Warning: Certificate or key file may be corrupted', 'yellow'));
            }
          } catch (verifyError) {
            console.log(Doh.colorize(`Warning: Could not verify saved files: ${verifyError.message}`, 'yellow'));
          }
        }

        if (config.staging) {
          console.log(Doh.colorize('🚨 STAGING Certificate renewal completed!', 'yellow'));
          console.log(Doh.colorize('🚨 Remember: These certificates are NOT browser-trusted!', 'yellow'));
        } else {
          console.log(Doh.colorize('🔒 PRODUCTION Certificate renewal completed successfully!', 'green'));
        }
        this.lastRun = new Date();

        // Verify the certificate was written correctly
        const certExists = fs.existsSync(certRequest.certfile);
        if (config.debug) console.log(Doh.colorize(`Certificate file exists: ${certExists}`, certExists ? 'green' : 'red'));
        
        if (!certExists) {
          console.error(Doh.colorize('Certificate renewal failed - certificate file not found', 'red'));
          return false;
        }

        return true;
      } catch (error) {
        console.error(Doh.colorize(`Error during certificate renewal: ${error.message}`, 'red'));
        if (error.stack) {
          console.error(Doh.colorize(`Stack trace: ${error.stack}`, 'red'));
        }
        return false;
      } finally {
        // Clean up temporary server if we started one
        if (needsTemporaryServer) {
          await this.stopTemporaryServer();
        }
      }
    }

    async checkRenewal() {
      if (this.isRenewing) {
        console.log(Doh.colorize('Renewal already in progress. Skipping check.', 'yellow'));
        return;
      }
      if (await this.shouldRun()) {
        if (!Doh.pod.letsencrypt?.allow_renewal) {
          console.log(Doh.colorize('Renewal not allowed. Bailing out.', 'yellow'));
          return;
        }
        this.isRenewing = true;
        console.log(Doh.colorize('Renewal condition met. Starting certificate renewal.', 'green'));
        try {
          await this.renewCertificates();
        } finally {
          this.isRenewing = false;
        }
      } else {
        console.log(Doh.colorize(`Certificate renewal skipped.`, 'yellow'));
      }
    }

    async shouldRun() {
      const now = new Date();
      // If we've already run today, skip
      if (this.lastRun &&
          now.getFullYear() === this.lastRun.getFullYear() &&
          now.getMonth() === this.lastRun.getMonth() &&
          now.getDate() === this.lastRun.getDate()) {
        // console.log(Doh.colorize('Last renewal was today. Skipping renewal.', 'yellow'));
        return false;
      }
      // Calculate the renewal window (a 5‑minute window starting at the target time)
      const targetTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), config.renewal_hour, config.renewal_minute, 0);
      const windowEnd = new Date(targetTime.getTime() + 5 * 60 * 1000);
      const inWindow = now >= targetTime && now < windowEnd;

      // Determine the certificate file from configuration - use same logic as prepareCertificateRequest
      const hostname = Doh.pod.express_config?.hostname || 'localhost';
      const defaultCertfile = `/etc/letsencrypt/live/${hostname}/fullchain.pem`;
      const certfile = config.certfile || Doh.pod.express_config?.ssl_info?.certfile || Doh.pod.express_config?.ssl_info?.cert || defaultCertfile;
      if (config.debug) console.log(Doh.colorize(`Checking for Certificate: ${certfile}`, 'yellow'));
      if (Doh.pod.letsencrypt?.force_renewal) {
        console.log(Doh.colorize('Force renewal flag is set. Renewing certificate...', 'red'));
        return true;
      }
      if ((certfile && fs.existsSync(certfile))) {
        try {
          // Read and parse certificate using native crypto
          const certPem = fs.readFileSync(certfile, 'utf8');
          const certInfo = await acme.crypto.readCertificateInfo(certPem);
          
          if (config.debug) console.log(Doh.colorize(`Certificate expires: ${certInfo.notAfter.toISOString()}`, 'yellow'));
          
          if (now >= certInfo.notAfter) {
              console.log(Doh.colorize('Certificate has already expired. Renewal needed immediately.', 'red'));
              return true;
            }
          
          const timeToExpiry = certInfo.notAfter - now;
            const thresholdDays = config.renewal_threshold_days || 30;
            const thresholdMs = thresholdDays * 24 * 60 * 60 * 1000;
          
            if (timeToExpiry > thresholdMs) {
              console.log(Doh.colorize('Certificate is still valid for more than threshold days. No renewal needed.', 'green'));
              return false;
            }
          
            // If within threshold, only renew in the designated time window.
          if (config.debug) console.log(Doh.colorize(`Certificate expires in ${Math.ceil(timeToExpiry / (24 * 60 * 60 * 1000))} days, checking renewal window...`, 'yellow'));
            return inWindow;
        } catch (e) {
          console.error(Doh.colorize(`Error reading certificate expiry: ${e.message}. Forcing renewal.`, 'red'));
          return true;
        }
      } else {
        // No certificate found—if within the window, then attempt renewal.
        return Doh.pod.letsencrypt?.force_renewal || inWindow;
      }
    }
  }

  // Create and export the manager instance
  Doh.Globals.GreenlockManager = GreenlockManager;
  Doh.Globals.greenlockcli = new GreenlockManager();
  
  if (Doh.pod.express_config?.ssl_port || Doh.pod.letsencrypt?.force_renewal) {
    await Doh.Globals.greenlockcli.initialize();
  }
});