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
      renewal_threshold_days: 'IsNumber'
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
  }
});
Doh.CLI('greenlockcli', {
  'force-greenlock': {
    file: '^/greenlockcli.cli.js',
    help: 'Force a renewal of the Let\'s Encrypt certificates',
  }
});
Doh.Module('greenlockcli', [
  // Updated the dependency import to include execSync.
  'import { exec, execSync } from "child_process"',
  'express_router',
  'fs',
  'path'
], async function (exec, execSync, fs, path) {
  const config = Doh.pod.letsencrypt;
  // make sure we have the domains array populated with the hostname
  Doh.meld_arrays(config.domains, [Doh.pod.express_config?.hostname]);
  // the webroot is the root of the pod
  config.webroot = DohPath('/');

  class GreenlockManager {
    constructor() {
      this.lastRun = null;
      this.checkInterval = config.checkInterval;
      // New flag to prevent overlapping renewals.
      this.isRenewing = false;
    }

    async initialize() {
      // Start the renewal check loop
      await this.checkRenewal();
      console.log(Doh.colorize('REMEMBER: Greenlock CLI requires `npm install -g greenlock-cli`', 'yellow'));
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

    buildGreenlockCommand() {
      const domains = this.getAllDomains();
      if (!domains.length) {
        throw new Error('No domains configured for SSL certificates');
      }
      const keyfile = config.keyfile || Doh.pod.express_config?.ssl_info?.keyfile || Doh.pod.express_config?.ssl_info?.key;
      const certfile = config.certfile || Doh.pod.express_config?.ssl_info?.certfile || Doh.pod.express_config?.ssl_info?.cert;

      // ensure we have the directories for the key and cert
      console.log(Doh.colorize(`Ensuring directories for key: ${keyfile}`, 'yellow'));
      if (keyfile) {
        fs.mkdirSync(path.dirname(keyfile), { recursive: true });
      }
      if (certfile) {
        fs.mkdirSync(path.dirname(certfile), { recursive: true });
      }

      let baseCommand = [
        'greenlock certonly --webroot',
        '--acme-version draft-11',
        config.staging ?
          '--acme-url https://acme-staging-v02.api.letsencrypt.org/directory' :
          '--acme-url https://acme-v02.api.letsencrypt.org/directory',
        `--agree-tos --email ${config.email}`,
        `--domains ${domains.join(',')}`,
        '--community-member',
        '--duplicate true',
        `--root "${config.webroot}"`,
      ].join(' ');
      if (keyfile) {
        baseCommand += ` --privkey-path "${keyfile}"`;
      }
      if (certfile) {
        baseCommand += ` --fullchain-path "${certfile}"`;
      }
      return baseCommand;
    }

    async renewCertificates() {
      try {
        const command = this.buildGreenlockCommand();
        console.log(Doh.colorize(`Executing greenlock command: ${command}`, 'green'));

        // Replace exec with a Promise-based approach
        await new Promise((resolve, reject) => {
          exec(command, (error, stdout, stderr) => {
            if (error) {
              console.error(Doh.colorize(`Error executing Greenlock: ${error.message}`, 'red'));
              if (stderr) console.error(Doh.colorize(`Stderr: ${stderr}`, 'red'));
              reject(error);
              return;
            }

            if (stderr) {
              console.log(Doh.colorize(`Greenlock STDERR (may contain warnings): ${stderr}`, 'yellow'));
            }

            console.log(Doh.colorize(`Greenlock STDOUT: ${stdout}`, 'green'));
            resolve();
          });
        });

        console.log(Doh.colorize('Certificate renewal completed', 'green'));

        this.lastRun = new Date();

        // await a short delay
        // await new Promise(resolve => setTimeout(resolve, 5000));
        await setTimeout(()=>{}, 10000);

        const certfile = config.certfile || Doh.pod.express_config?.ssl_info?.certfile || Doh.pod.express_config?.ssl_info?.cert;
        const certExists = fs.existsSync(certfile);
        console.log(Doh.colorize(`Checking for Certificate: ${certExists}`, 'yellow'));
        // if we have a cert, exit cleanly
        if (certExists) {
          if (this.shouldRun()) {
            console.log(Doh.colorize('Certificate renewal reports success and found the cert, but still needs to be renewed', 'red'));
          } else {
            console.log(Doh.colorize('Certificate renewal success.', 'green'));
          }
        } else {
          console.error(Doh.colorize('Certificate renewal failed to find the new certificate', 'red'));
        }
      } catch (error) {
        console.error(Doh.colorize(`Error renewing certificates: ${error.message}`, 'red'));
        if (error.stdout) console.error(Doh.colorize(`Stdout: ${error.stdout}`, 'yellow'));
        if (error.stderr) console.error(Doh.colorize(`Stderr: ${error.stderr}`, 'red'));
        return false;
      }
    }

    async checkRenewal() {
      if (this.isRenewing) {
        console.log(Doh.colorize('Renewal already in progress. Skipping check.', 'yellow'));
        return;
      }
      if (this.shouldRun()) {
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

    shouldRun() {
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

      // Determine the certificate file from configuration
      const certfile = config.certfile || Doh.pod.express_config?.ssl_info?.certfile || Doh.pod.express_config?.ssl_info?.cert;
      console.log(Doh.colorize(`Checking for Certificate: ${certfile}`, 'yellow'));
      if (Doh.pod.letsencrypt?.force_renewal) {
        console.log(Doh.colorize('Force renewal flag is set. Renewing certificate...', 'red'));
        return true;
      }
      if ((certfile && fs.existsSync(certfile))) {
        try {
          // Retrieve the certificate expiry using OpenSSL
          const output = execSync(`openssl x509 -enddate -noout -in "${certfile}"`).toString().trim();
          console.log(Doh.colorize(`Certificate expiry: ${output}`, 'yellow'));
          const match = output.match(/notAfter=(.*)/);
          if (match) {
            const certExpiry = new Date(match[1]);
            if (now >= certExpiry) {
              console.log(Doh.colorize('Certificate has already expired. Renewal needed immediately.', 'red'));
              return true;
            }
            const timeToExpiry = certExpiry - now;
            const thresholdDays = config.renewal_threshold_days || 30;
            const thresholdMs = thresholdDays * 24 * 60 * 60 * 1000;
            if (timeToExpiry > thresholdMs) {
              console.log(Doh.colorize('Certificate is still valid for more than threshold days. No renewal needed.', 'green'));
              return false;
            }
            // If within threshold, only renew in the designated time window.
            return inWindow;
          } else {
            console.error(Doh.colorize(`Unable to parse certificate expiry date. Tried: ${`openssl x509 -enddate -noout -in "${certfile}"`}, output: ${output}, match: ${match}`, 'red'));
            return true;
          }
        } catch (e) {
          console.error(Doh.colorize(`Error retrieving certificate expiry: ${e.message}. Forcing renewal.`, 'red'));
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