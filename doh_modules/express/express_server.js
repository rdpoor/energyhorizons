//MARK: Express Config
Doh.Module('express_config', ['fs', 'dataforge'], function (fs, DohPath) {
  // find, compose, and otherwise collect the configuration files
  if (Doh.pod.express_config) {
    // fix the ssl_info object before assigning it to the window
    if (Doh.pod.express_config.ssl_port || Doh.pod.letsencrypt?.force_renewal) {
      let ssl_info = Doh.pod.express_config.ssl_info || {};
      ssl_info.keyfile = ssl_info.keyfile || ssl_info.key;
      ssl_info.certfile = ssl_info.certfile || ssl_info.cert;
      if (!ssl_info.keyfile || !ssl_info.certfile) {
        if (Doh.pod.express_config.hostname) {
          ssl_info.keyfile = `/etc/letsencrypt/live/${Doh.pod.express_config.hostname}/privkey.pem`;
          ssl_info.certfile = `/etc/letsencrypt/live/${Doh.pod.express_config.hostname}/fullchain.pem`;
        } else {
          console.error(Doh.colorize('No hostname found in Doh.pod.express_config with ssl_port set and missing ssl_info.keyfile and ssl_info.certfile', 'red'));
        }
      }
      Doh.pod.express_config.ssl_info = ssl_info;
      try {
        ssl_info.key = fs.readFileSync(ssl_info.keyfile);
        ssl_info.cert = fs.readFileSync(ssl_info.certfile);
        console.log(Doh.colorize('SSL key/cert files read successfully', 'green'));
      } catch (e) {
        console.error(Doh.colorize(`Error reading SSL key/cert files: ${e.message}`, 'red'));
      }
    }
  }

  Doh.hostUrlString = function () {
    let remote_path;
    const isLocalhost = (Doh.pod?.express_config?.hostname === 'localhost');
    const isSecure = (Doh.pod?.express_config?.ssl_port || false);
    const port = isSecure ? Doh.pod?.express_config?.ssl_port : Doh.pod?.express_config?.port || 3000;
    const isNonStandardPort = isSecure ? (port !== 443) : (port !== 80);
    const portStringOrBlank = (isNonStandardPort && !Doh.pod?.express_config?.mask_remapped_ports) ? `:${port}` : '';
  
  
    if (isLocalhost || !Doh.pod?.express_config?.hostname) {
        remote_path = `http${isSecure ? 's' : '' }://localhost${portStringOrBlank}`;
    } else {
        remote_path = `http${isSecure ? 's' : '' }://${Doh.pod?.express_config?.hostname}${portStringOrBlank}`;
    }
    return remote_path;
  }

  let df = New('Dataforge');
  //const htmltemplate = df.forge(DohPath('^/html.template'), ['FromFile', { 'ToGlobal': 'htmlTemplate' }]);
  // Ensure we have the necessary base templates
  df.forge(Doh.hostUrlString(), [
    { ExportToGlobal: 'ClientLoadDohFrom' },

    { Import: `
    <div class="curtain">
        <div class="loader_spinner"></div>
    </div>`},
    { ExportToGlobal: 'doh_curtain_element' },

    { Import: `
        // Animate the blur effect from 50px to 0, then hide the curtain
        const curtain = document.querySelector('.curtain');
        curtain.style.backdropFilter = 'blur(0px)';
        curtain.style.webkitBackdropFilter = 'blur(0px)';
        curtain.style.transition = 'backdrop-filter 100ms, -webkit-backdrop-filter 100ms';

        // After animation completes, hide the curtain
        setTimeout(async () => {
            curtain.style.display = 'none';
        }, 100);
    `},
    { ExportToGlobal: 'doh_curtain_script' },
    { ExportToGlobal: 'doh_curtain_hider' },

    // import the path to html.template
    // import the file contents from the stored path
    { Import: DohPath('^/html.template') },
    { ExportToGlobal: 'html_template_path' },

    { ImportFromFile: DohPath('^/html.template') },
    // store the file contents in the global 'htmlTemplate' variable (can now be used as {{htmlTemplate}})
    { ExportToGlobal: 'htmlTemplate' },



    // import the path to doh_head.html.template
    // import the file contents from the stored path
    { Import: DohPath('^/doh_head.html.template') },
    { ExportToGlobal: 'doh_head_template_path' },

    { ImportFromFile: DohPath('^/doh_head.html.template') },
    // store the file contents in the global 'doh_head' variable (can now be used as {{doh_head}})
    { ExportToGlobal: 'doh_head' },



    // import the path to doh_body.html.template
    // import the file contents from the stored path
    { Import: DohPath('^/doh_body.html.template') },
    { ExportToGlobal: 'doh_body_template_path' },

    { ImportFromFile: DohPath('^/doh_body.html.template') },
    // store the file contents in the global 'doh_body' variable (can now be used as {{doh_body}})
    { ExportToGlobal: 'doh_body' },



    // import the path to loader.css
    // import the file contents from the stored path
    { ImportFromFile: DohPath('^/css/loader.css') },
    // store the file contents in the global 'loader_styles' variable (can now be used as {{loader_styles}})
    { ExportToGlobal: 'loader_styles' },
    { ExportToGlobal: 'doh_curtain_styles' },
    { Import: '<style type="text/css">{{doh_curtain_styles}}</style>' },
    { ExportToGlobal: 'doh_curtain_style_element' },

  ]);
});
Doh.Pod('express_config', {
  moc: { express_config: 'IsObject' },
  express_config: {
    doc: 'Express server configuration',
    moc: {
      enabled: 'IsBoolean',
      log_routes: 'IsBoolean',
      hostname: 'IsStringOrFalse',
      strict_hostnames: 'IsBoolean',
      allowed_hostnames: 'IsArray',
      port: 'IsIntOrFalse',
      mask_remapped_ports: 'IsBoolean',
      tunnel_ssl_port: 'IsIntOrFalse',
      ssl_port: 'IsIntOrFalse',
      try_secure: 'IsBoolean',
      ssl_info: 'IsObjectOrFalse',
      helmet: 'IsBoolean',
      rate_limit: 'IsObjectOrFalse',
      host_forwards: 'IsObject',
      ignore_paths: 'IsArray',
      tunnel_remote_url: 'IsStringOrFalse',
      use_content_security_policy_defaults: 'IsBoolean',
      only_use_defined_hosts: 'IsBoolean',
      cors_hosts: 'IsArray',
      image_size_presets: 'IsObjectOrFalse',
    },
    enabled: true,
    log_routes: false,
    hostname: '',
    strict_hostnames: false,
    // allowed_hostnames: [],
    port: 3000,
    mask_remapped_ports: false,
    tunnel_ssl_port: false,
    ssl_port: false,
    try_secure: true,
    ssl_info: false,
    helmet: false,
    content_security_policy: false,
    use_content_security_policy_defaults: true,
    only_use_defined_hosts: false,
    cors_hosts: [],
    rate_limit: false,
    host_forwards: {},
    ignore_paths: [
      '/dbs',
      '/dbs/*',
      '.doh',
      '.doh/',
      'dohballs',
      'dohball.json',
      '*.env',
      '/.env',
      '*.git/',
      '/.git/',
      '/host.pod.yaml',
      'package.json',
      'package-lock.json',
      '/pod.yaml',
      'pod.yaml',
      'secrets'
    ],
    tunnel_remote_url: false,
    image_size_presets: {
      icon: { width: 32, height: 32, fit: 'cover' },
      'small-thumb': { width: 64, height: 64, fit: 'cover' },
      'large-thumb': { width: 128, height: 128, fit: 'cover' },
      smaller: { width: 240, fit: 'inside' },
      small: { width: 320, fit: 'inside' },
      medium: { width: 640, fit: 'inside' },
      large: { width: 1024, fit: 'inside' },
    },
  }
});
Doh.Install('express_server', {
  "npm:helmet": "",
  "npm:multer": "",
  "npm:sharp": "",
});

//MARK: Express Server
Doh.Module('express_server', [
  'express',
  'http',
  'https',
  'compression',
  'socketio_server',
  'os',
  'fs',
  'path',
  'import helmet from "helmet"',
  'import multer from "multer"',
  'express_config',
  'import minimatch from "minimatch"',
  'dataforge',
  'import sharp from "sharp"',
], async function (app, helmet, server, io, _current_sockets, express, http, https, compression, Server, os, path, minimatch, multer, fs, sharp) {
  const { colorize, header_color, info_color, text_color, number_color, error_color, warn_color } = Doh.colorizer();

  Doh.Globals.app = app = express();

  // Helper function to extract and validate hosts from URLs
  function extractHost(url) {
    try {
      // if the url includes a ` > ` then it needs to have the ` > ` and whatever follows it removed
      if (url.includes(' > ')) {
        url = url.split(' > ')[0];
      }
      const parsedUrl = new URL(url);
      return parsedUrl.origin; // This will return the protocol + host (e.g., 'https://example.com')
    } catch (err) {
      console.warn(Doh.colorize(`Invalid URL skipped: ${url} with error: ${err.message}`, warn_color));
      return null; // Skip invalid URLs
    }
  }

  // Collect external hosts from package_manifest
  const externalHosts = new Set();
  for (const [packageName, packageData] of Object.entries(Doh.Packages)) {
    if (Array.isArray(packageData.load)) {
      packageData.load.forEach(loadDirective => {
        const urlMatch = loadDirective.match(/(http|https):\/\/[^'"]+/);
        if (urlMatch) {
          const host = extractHost(urlMatch[0]);
          if (host) {
            externalHosts.add(host);
          }
        }
      });
    }
  }

  // if we are trying to secure, 
  // AND we do NOT have remapped ports, 
  // AND we have a hostname, 
  // AND we have a ssl_port, 
  // then we can redirect to the secure protocol
  if(Doh.pod.express_config.try_secure) {
    app.use((req, res, next) => {
      if(req.secure) {
        next();
      } else if (!Doh.pod.express_config.mask_remapped_ports) {
        if (Doh.pod.express_config.ssl_port && Doh.pod.express_config.hostname) {
          res.redirect(`https://${req.hostname}${req.url}`);
        } else {
          next();
        }
      } else {
        next();
      }
    });
  }

  //MARK: Hostname
  // insert a middleware that will report any requests where the req.hostname is not the same as Doh.pod.express_config.hostname
  app.use((req, res, next) => {
    if (req.hostname !== 'localhost' &&
      Doh.pod.express_config.hostname &&
      req.hostname !== Doh.pod.express_config.hostname &&
      req.hostname !== 'www.' + Doh.pod.express_config.hostname &&
      (!Doh.pod.express_config.allowed_hostnames ||
        !Doh.pod.express_config.allowed_hostnames.some(hostname =>
          req.hostname === hostname || req.hostname === 'www.' + hostname
        ))
    ) {
      console.log(`Request hostname mismatch:`, Doh.colorize(`${req.hostname}`, warn_color), '!=', Doh.colorize(`${Doh.pod.express_config.hostname}`, info_color));
      if (Doh.pod.express_config.strict_hostnames) {
        console.log(`Strict hostnames are enabled. Dropping connection from:`, Doh.colorize(`${req.hostname}`, warn_color));
        req.socket.end();
        req.socket.unref();
        return;
      }
    }
    next();
  });

  //MARK: CORS
  // Combine external hosts with existing hosts
  let allHosts = new Set([
    'esm.sh',
    ...(Doh.pod.dohball_host || []),
    ...(Doh.pod.express_config.cors_hosts || []),
    ...(Object.values(Doh.pod.express_config.host_forwards || {})),
    ...(externalHosts || [])
  ]);
  if (Doh.pod.express_config.hostname) {
    allHosts.add(Doh.pod.express_config.hostname);
    allHosts.add('www.' + Doh.pod.express_config.hostname);
  }

  // clean allHosts so that none of them have the protocol prefix
  allHosts = new Set(Array.from(allHosts).map(host => {
    return host.replace(/^https:\/\//, '').replace(/^http:\/\//, '');
  }));

  let csp = Doh.pod.express_config?.content_security_policy || false;

  if (NotFalse(csp) && NotObject(csp)) {
    csp = {
      directives: {}
    };
  }

  if (csp && Doh.pod.express_config?.use_content_security_policy_defaults) {
    let selectedHosts = Array.from(allHosts);
    if (Doh.pod.express_config?.cors_hosts) {
      if (Doh.pod.express_config.only_use_defined_hosts) {
        selectedHosts = Array.from(Doh.pod.express_config.cors_hosts);
      } else {
        selectedHosts.push(...Array.from(Doh.pod.express_config.cors_hosts));
      }
    }
    // populate all the directives with the allHosts array
    // fill all supported directive types with the allHosts array
    const directiveTypes = ['defaultSrc', 'scriptSrc', 'scriptSrcElem', 'styleSrc', 'imgSrc', 'frameSrc', 'connectSrc', 'formAction', 'fontSrc', 'objectSrc', 'scriptSrcAttr'];
    for (const directiveType of directiveTypes) {
      // after all that, we still only update the directives that are not already set
      if (!csp.directives[directiveType]) {
        csp.directives[directiveType] = ["'self'", "'unsafe-inline'", "'unsafe-eval'", "blob:", "data:", ...selectedHosts];
      }
    }
    if (!csp.directives.frameAncestors) csp.directives.frameAncestors = ["'self'", "*"];
    if (!csp.directives.upgradeInsecureRequests) csp.directives.upgradeInsecureRequests = [""];
  }

  // Use Helmet for secure headers if enabled
  if (Doh.pod.express_config?.helmet && Doh.pod.express_config?.ssl_port) {
    app.use(helmet({
      contentSecurityPolicy: csp,
      frameguard: !!Doh.pod.express_config?.frameguard // Disable Helmet's default frame restrictions
    }));
  }

  // Configure CORS with combined hosts
  // const corsHosts = [
  //   'http://localhost',
  //   'https://localhost',
  //   ...allHosts
  // ];

  // Add hosts from Doh.pod.express_config.hostname and port
  let protocol = 'http', port = false, host = 'localhost';
  if (Doh.pod.express_config) {
    if (Doh.pod.express_config.hostname) {
      protocol = Doh.pod.express_config.ssl_info ? 'https' : 'http';
      port = Doh.pod.express_config.ssl_port || Doh.pod.express_config.port;
      host = `${protocol}://${Doh.pod.express_config.hostname}${port && port !== 443 ? `:${port}` : ''}`;
      // corsHosts.push(host);
    }
    if (Doh.pod.express_config?.port) {
      port = Doh.pod.express_config.port;
    }
  }

  //MARK: Headers
  // General middleware for headers and caching
  const cache_max_age = Doh.pod.express_config?.cache_max_age || 10;
  app.use(function (req, res, next) {
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Accept, X-Requested-With, Content-Type, Authorization, Origin, X-Forwarded-For, X-Forwarded-Proto, X-Forwarded-Host, X-Forwarded-Path, X-Tracking-ID, X-Parent-Tracking-ID, X-MCP-Session-Id"
    );
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', '*');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Cross-Origin-Embedder-Policy', 'cross-origin');
    res.setHeader('Cross-Origin-Opener-Policy', 'cross-origin');
    res.setHeader('X-Frame-Options', 'ALLOWALL');
    res.setHeader("Cache-Control", `public, max-age=${cache_max_age}, must-revalidate`);
    next();
  });

  app.use(compression());


  //MARK: Forbidden Paths
  // Default forbidden path checker
  Doh.express_server_forbidden_path = async (req, res, next) => {
    const forbiddenPaths = Doh.pod.express_config?.ignore_paths || [];
    const requestPath = req.originalUrl || req.url;
    // Extract the path part, ignoring query parameters
    const pathOnly = requestPath.split('?')[0]; 
    const normalizedRequestPath = Doh.toForwardSlash(path.normalize(pathOnly));

    // Check if the request path matches any forbidden pattern (either as a file or directory)
    const isForbidden = forbiddenPaths.some((pattern) => {
      let normalizedPattern = Doh.toForwardSlash(path.normalize(pattern));
      // Ensure patterns starting without '/' or '*' are treated as relative to root
      if (!normalizedPattern.startsWith('*') && !normalizedPattern.startsWith('/')) {
        normalizedPattern = '/' + normalizedPattern;
      }
      // Match using minimatch or check if path starts with the pattern (for directory blocking)
      const matchAsFileOrFolder = minimatch(normalizedRequestPath, normalizedPattern, { matchBase: true, dot: true }) ||
                                normalizedRequestPath.startsWith(`${normalizedPattern}/`) || // Check if it starts with the pattern followed by '/'
                                normalizedRequestPath === normalizedPattern; // Exact match for files/dirs without trailing slash
      return matchAsFileOrFolder;
    });

    if (isForbidden) {
      console.warn(Doh.colorize(`Forbidden path access attempt: ${normalizedRequestPath}`, 'yellow'));
      return res.status(403).send('Access Forbidden');
    }

    next(); // Path is allowed, proceed to the next middleware
  };

  // Middleware that calls the potentially overridden forbidden path checker
  app.use(async (req, res, next) => {
    // Call the function stored on Doh, allowing it to be replaced by other modules
    await Doh.express_server_forbidden_path(req, res, next);
  });


  //MARK: Images
  app.use(async (req, res, next) => {
    const sizeParam = req.query.size;
    const requestedPath = req.path;
    const imageSizePresets = Doh.pod.express_config?.image_size_presets || {};

    // Check if size param exists and is valid
    if (!sizeParam || !imageSizePresets[sizeParam]) {
      return next(); // Continue if no valid size param
    }

    // Check if the request is for an image file (simple extension check)
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.tiff', '.avif'];
    const ext = path.extname(requestedPath).toLowerCase();
    if (!imageExtensions.includes(ext)) {
      return next(); // Not an image request
    }

    // Construct the full path to the original image
    const imagePath = DohPath(requestedPath);

    try {
      // Check if the original file exists
      await fs.promises.access(imagePath, fs.constants.R_OK);

      // Process the image
      const resizeOptions = imageSizePresets[sizeParam];
      const imageBuffer = await sharp(imagePath)
        .resize(resizeOptions)
        .toBuffer();

      // Determine content type based on original extension (sharp preserves format)
      const contentType = `image/${ext.substring(1)}`; // e.g., image/jpeg
      res.set('Content-Type', contentType);
      res.send(imageBuffer);

    } catch (error) {
      if (error.code === 'ENOENT') {
        // Original file not found, proceed to static middleware or 404
        return next();
      } else {
        console.error(`Error processing image ${requestedPath}:`, error);
        return res.status(500).send('Error processing image');
      }
    }
  });


  //MARK: HTML
  Doh.processHtml = function (filepath, trackingId = null, parentTrackingId = null) {
    // Create handlebars data without the hmr script (we'll inject it directly)
    const handlebars = {
      ClientLoadDohFrom: Doh.hostUrlString(),
      "doh.js": `${Doh.hostUrlString()}/doh.js`,
      "deploy.js": `${Doh.hostUrlString()}/doh_js/deploy.js`,
      trackingId: trackingId || null,
      parentTrackingId: parentTrackingId || null,
      importmap: Doh.generateImportMap(),
      dependencies: ''
    }

    // Generate the HMR script to inject
    const hmrScript = `
  <script type="module">
    import "${Doh.hostUrlString()}/doh_js/deploy.js";
    await Doh.load('hmr');
    await Doh.live_html('${DohPath.DohSlash(filepath)}', {{handlebarsUsed}});
  </script>`;

    // Read file, inject HMR script after body tag, then process handlebars
    let df = New('Dataforge');
    let raw_html = df.forge(
      DohPath(filepath),
      ['ImportFromFile']
    );

    // Insert HMR script after body tag using regex for robustness
    // This matches <body> with any attributes and whitespace
    const bodyTagRegex = /(<body[^>]*>)/i;
    let modified_html = raw_html.replace(bodyTagRegex, '$1' + hmrScript);

    // Now process the modified HTML with handlebars
    let processed_html = df.forge(
      modified_html,
      ['ApplyHandlebars'],
      handlebars
    );
    processed_html = df.unescape_handlebars(processed_html);
    // processed_html = df.forge(
    //   processed_html,
    return processed_html;
  }
  Doh.IsHTMLRequest = function (req) {
    if (!req.url) return false;
    // trim the url to remove any query params
    let url = req.url.split('?')[0];

    // If URL directly ends with .html, process it
    if (url.endsWith('.html')) {
      // callback(DohPath(url));
      return DohPath(url);
    }

    // Check if this might be a URL without .html extension
    // First, see if the exact URL exists as a file
    const exactFilePath = DohPath(url);

    // if the url ends with a / or is a directory, then check for an index.html file
    if (url.endsWith('/') || fs.existsSync(exactFilePath)) {
      const indexFilePath = path.join(exactFilePath, 'index.html');
      if (fs.existsSync(indexFilePath) && fs.statSync(indexFilePath).isFile()) {
        return indexFilePath;
      }
    }
    return false;
  }
  app.use(function (req, res, next) {
    // this middleware will check if the request is for a file that ends with .html or is a directory with an index.html file
    // if it is, look for handlebars, and if found, render the file with the handlebars
    const processHtml = (filepath) => {
      let processed_html = Doh.processHtml(filepath, res.trackingId || null, res.parentTrackingId || null);

      res.send(processed_html);
      return;
    };

    const isHtml = Doh.IsHTMLRequest(req);
    if (isHtml) {
      processHtml(isHtml);
    } else {
      next();
    }
  });

  //MARK: RawFile
  // make a middleware that will check if the request is for a file that ends with .raw
  // if it is, send the file with the .raw extension
  app.use((req, res, next) => {
    if (!req.url) return next();
    let filepath = req.url.split('?')[0];
    if (filepath.endsWith('.rawfile')) {
      // check if the file exists minus the .raw extension
      filepath = DohPath(filepath.replace('.rawfile', ''));
      if (fs.existsSync(filepath)) {
        // if it's a directory, it can't be read as a file
        if (fs.statSync(filepath).isDirectory()) {
          return next();
        }
        res.send(fs.readFileSync(filepath, 'utf8'));
      } else {
        next();
      }
    } else {
      next();
    }
  });


  //MARK: Static
  // Expose the base folder of the install to the browser (this may change)
  app.use(express.static(LoadDohFrom, {dotfiles: 'allow'}));


  //MARK: Body
  // Set body size limit from config or use default
  const bodySizeLimit = Doh.pod.express_config?.body_size_limit || '50mb';
  // Set up multer for multipart form handling
  const upload = multer();
  // Add middleware for parsing URL encoded bodies and JSON bodies
  app.use(express.urlencoded({ extended: true, limit: bodySizeLimit }));
  app.use(express.json({ limit: bodySizeLimit }));
  // Middleware to handle form data
  app.use((req, res, next) => {
    const contentType = req.headers['content-type'] || '';

    if (contentType.includes('application/x-www-form-urlencoded')) {
      // Handle URL-encoded forms
      req.formData = req.body;
      next();
    } else if (contentType.includes('multipart/form-data')) {
      // Handle multipart forms
      upload.any()(req, res, (err) => {
        if (err) {
          console.error('Error processing multipart form:', err);
          return next(err);
        }
        req.formData = {
          ...req.body,  // Regular form fields
          files: req.files  // Uploaded files
        };
        next();
      });
    } else {
      next();
    }
  });


  //MARK: Rate Limiting
  // Implement optional rate limiting
  if (Doh.pod.express_config?.rate_limit) {
    const limiterOptions = {
      windowMs: Doh.pod.express_config.rate_limit.windowMs || 15 * 60 * 1000, // default 15 minutes
      max: Doh.pod.express_config.rate_limit.max || 100 // default limit each IP to 100 requests per windowMs
    };
    const limiter = rateLimit(limiterOptions);
    app.use(limiter);
  }


  //MARK: Init Servers
  if (Doh.pod.express_config?.port) {
    Doh.Globals.server = server = http.createServer(app);
  }

  let http_server = false;
  if (Doh.pod.express_config?.ssl_info) {
    try {
      Doh.Globals.http_server = http_server = Doh.Globals.server || http.createServer(app);
      Doh.Globals.server = server = https.createServer(Doh.pod.express_config.ssl_info, app);
    } catch (e) {
      console.error(Doh.colorize(`Error starting SSL server: ${e.message}`, error_color));
    }
  }



  //MARK: ImportMap
  Doh.generateImportMap = function () {
    let importmap = {};
    // Add manifest specifiers
    try {
      // Get the manifest content
      const manifestPath = DohPath('/doh_js/manifests/browser_esm_manifest.json');
      const manifestContent = fs.readFileSync(manifestPath, 'utf8');
      const manifest = JSON.parse(manifestContent);

      // Merge the manifest imports into our importmap
      if (manifest) {
        for (const [key, value] of Object.entries(manifest)) {
          // Don't override existing package-specific mappings
          if (!importmap[key]) {
            importmap[key] = value;
          }
        }
      }
    } catch (error) {
      console.warn('Failed to load browser ESM manifest:', error.message);
    }

    // always allow the detected import config to override the manifest
    // Add package-specific import maps
    for (let pack in Doh.Packages) {
      let _package = Doh.Packages[pack];
      if (_package.importmap) {
        for (const [key, value] of Object.entries(_package.importmap)) {
          if (!key.endsWith('/')) {
            //console.warn(`Import map key "${key}" should end with a forward slash`);
          }
          if (key.startsWith('/')) {
            importmap[key] = DohPath(value);
          } else if (key.startsWith('^/')) {
            importmap[key] = DohPath(value, _package.packagefile || _package.file);
          } else {
            importmap[key] = value;
          }
        }
      }
    }

    return Object.keys(importmap).length ?
      '<script type="importmap">\n' + JSON.stringify({ imports: importmap }, null, 2) + '\n</script>\n' :
      '';
  }

  /*
  ███████╗     ██████╗      ██████╗    ██╗  ██╗    ███████╗    ████████╗    ███████╗
  ██╔════╝    ██╔═══██╗    ██╔════╝    ██║ ██╔╝    ██╔════╝    ╚══██╔══╝    ██╔════╝
  ███████╗    ██║   ██║    ██║         █████╔╝     █████╗         ██║       ███████╗
  ╚════██║    ██║   ██║    ██║         ██╔═██╗     ██╔══╝         ██║       ╚════██║
  ███████║    ╚██████╔╝    ╚██████╗    ██║  ██╗    ███████╗       ██║       ███████║
  ╚══════╝     ╚═════╝      ╚═════╝    ╚═╝  ╚═╝    ╚══════╝       ╚═╝       ╚══════╝
  */
  //MARK: Socket.io
  // Use the http server as the interface to the socket.io server
  Doh.Globals.io = io = new Server(server, {
    maxHttpBufferSize: 1e8, pingTimeout: 60000,
    cors: { origin: '*' },
  });

  // Expose the socket.io client distribution folder as static resources (to access /socket.io/socket.io.js in the browser)
  //app.use('/socket.io-client/socket.io.js', express.static(DohPath('/node_modules/socket.io/client-dist/socket.io.js')));
  app.use('/socket.io-client', express.static(DohPath('/node_modules/socket.io/client-dist')));
  //console.log('exposing',__dirname+'/node_modules/socket.io/client-dist');

  Doh.Globals._current_sockets = _current_sockets = [];
  io.path(DohPath('/socket.io'));

  // console.log(colorize('Starting Express_Doh servers', header_color));

  // Add global error handler near the top of the module
  process.on('uncaughtException', (error) => {
    console.error(Doh.colorize('UNCAUGHT EXCEPTION:', error_color), error);
    console.error(error.stack);
    // Optionally restart the server or take other recovery actions
  });

  process.on('unhandledRejection', (reason, promise) => {
    console.error(Doh.colorize('UNHANDLED REJECTION:', error_color), reason);
    // Log the promise details if available
    console.error('Promise:', promise);
  });

  //MARK: Start Servers
  // Modify the server startup code to be more robust
  const startServer = async (serverType, server, port) => {
    return new Promise((resolve, reject) => {
      try {
        const timeoutId = setTimeout(() => {
          reject(new Error(`${serverType} server startup timed out after 30 seconds`));
        }, 30000);

        server.once('error', (error) => {
          clearTimeout(timeoutId);
          console.error(Doh.colorize(`${serverType} server error:`, error_color), error);
          reject(error);
        });

        server.listen(port, () => {
          clearTimeout(timeoutId);
          // console.log(colorize(`${serverType} server running on port`, info_color), port);
          resolve();
        });
      } catch (error) {
        reject(error);
      }
    });
  };

  // Replace the server startup section with this more robust version
  const startServers = async () => {
    if (Doh.pod.express_config?.ssl_info && Doh.pod.express_config?.ssl_port) {
      console.log(colorize('Starting Doh Express server with SSL...', header_color));
      if (http_server) {
        try {
          // console.log(colorize('Starting HTTP-01 challenge server', info_color));
          await startServer('HTTP-01 challenge', http_server, Doh.pod.express_config?.port);
        } catch (error) {
          console.error(Doh.colorize(`Failed to start HTTP-01 challenge server: ${error.message}`, error_color));
          // Continue trying to start SSL server even if HTTP server fails
        }
      }

      try {
        await startServer('SSL', server, Doh.pod.express_config?.ssl_port);
      } catch (error) {
        console.error(Doh.colorize(`Failed to start SSL server: ${error.message}`, error_color));
        throw error; // Re-throw as this is critical
      }
    } else if (Doh.pod.express_config?.port) {
      console.log(colorize('Starting Doh Express server...', header_color));
      try {
        await startServer('HTTP', server, Doh.pod.express_config?.port);
      } catch (error) {
        console.error(Doh.colorize(`Failed to start HTTP server: ${error.message}`, error_color));
        throw error;
      }
    } else {
      console.error(Doh.colorize('Express_Doh server not started. Missing "port" or "ssl_port" in Doh.pod.express_config.', error_color));
      throw new Error('Missing port configuration');
    }
  };

  // Call startServers and handle any errors
  await startServers().catch(error => {
    console.error(Doh.colorize('Fatal error starting servers:', error_color), error);
    // Optionally exit the process with an error code
    process.exit(1);
  });

  //MARK: IP Address
  // Function to get LAN IP address
  function getLanIpAddress() {
    const interfaces = os.networkInterfaces();
    for (const iface in interfaces) {
      for (const details of interfaces[iface]) {
        if (details.family === 'IPv4' && !details.internal) {
          return details.address;
        }
      }
    }
    return '0.0.0.0';
  }

  window.host_ip_address = getLanIpAddress();

  console.log(Doh.colorize('IP:', info_color), window.host_ip_address);


  //MARK: Error Handling
  // Error handling middleware
  app.use((err, req, res, next) => {
    console.error(Doh.colorize(err.stack, error_color));
    res.status(500).send('Doh! Something broke.');
  });
  

});