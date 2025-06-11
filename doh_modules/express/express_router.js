Doh.Install('express_router', {
    "npm:mime-types": "",
    "npm:express-useragent": "^1.0.15",
    "npm:geoip-lite": "^1.4.7",
    "npm:performance-now": "^2.1.0"
});
Doh.Track('express_router');
Doh.Pod('express_router',{
    browser_pod: {
        analytics: {
            enabled: false,
            excludePaths: ['/health', '/metrics', '*.js', '*.css', '*.map', '*.ico'],
            sampleRate: 1.0,
        }
    }
})
Doh.CLI('express_router', {
    't2h': {
        file: '^/template_to_html.cli.js',
        help: 'Convert a template to html',
    }
});
Doh.Module('express_router_as_library', [
    'axios',
    'fs',
    'path',
    'dataforge', 
    'express_config',
    'import mime from "mime-types"',
    'import useragent from "express-useragent"',
    'import geoip from "geoip-lite"',
    'import now from "performance-now"',
    'import minimatch from "minimatch"',
    'optional socketio_client',
], async function (axios, fs, path, mime, useragent, geoip, now, minimatch, Router, app, https, _current_sockets, ioClient, express, Server) {
    //Doh.performance.start('Express Router');
    let df = New('Dataforge');
    // Ensure we have the necessary base loader styles
    

    Router = Doh.Globals.Router = New('object', {
        Routes: {},
        
        HostForwards: {},

        Middlewares: {},


        //MARK: Analytics
        analyticsHandlers: null,

        analyticsConfig: {
            excludePaths: [
                '/health', 
                '/metrics', 
                '*.js', 
                '*.css', 
                '*.map', 
                '*.ico',
                '*.png',
                '*.jpg',
                '*.jpeg',
                '*.gif',
                '*.svg',
                '*.webp',
                '/hmr',
                '/hmr/*',
            ],
            sampleRate: 1.0,
            enabled: false
        },

        setupAnalytics: function() {
            if (this.analyticsConfig.enabled) {
                this.analyticsHandlers = new Map();
                df.forge('analytics', ['SelectDB',
                    {CreateTableInDB: 'analytics_routes'},
                    {CreateTableInDB: 'analytics_events'},
                    {CreateTableInDB: 'analytics_performance'}
                ]);
                this.setupAnalyticsRoutes();
            }
        },
        
        setupAnalyticsRoutes: function() {
            this.AddRoute('/api/analytics/performance', async function(data, req, res) {
                await Router.trackPerformance({
                    ...data,
                    trackingId: req.trackingId,
                    userId: req.user?.id,
                    sessionId: req.sessionID
                });
                Router.SendJSON(res, { success: true });
            });

            this.AddRoute('/api/analytics/event', async function(data, req, res) {
                await Router.trackEvent(data.type, {
                    ...data,
                    trackingId: req.trackingId,
                    userId: req.user?.id,
                    sessionId: req.sessionID
                });
                Router.SendJSON(res, { success: true });
            });

            this.AddRoute('/api/analytics/route', async function(data, req, res) {
                // This endpoint handles client-side route changes
                await Router.trackRoute(req, res, {
                    isClientSide: true,
                    ...data
                });
                Router.SendJSON(res, { success: true });
            });
        },
        // Analytics methods
        onAnalytics: function(eventType, handler) {
            if (!this.analyticsHandlers.has(eventType)) {
                this.analyticsHandlers.set(eventType, new Set());
            }
            this.analyticsHandlers.get(eventType).add(handler);
        },

        emitAnalytics: function(eventType, data) {
            if (!this.analyticsHandlers.has(eventType)) {
                this.analyticsHandlers.set(eventType, new Set());
            }
            const handlers = this.analyticsHandlers.get(eventType);
            if (handlers) {
                handlers.forEach(handler => {
                    try {
                        handler(data);
                    } catch (error) {
                        console.error(`Error in analytics handler for ${eventType}:`, error);
                    }
                });
            }
        },

        trackEvent: async function(eventName, data = {}) {
            const event = {
                timestamp: Date.now(),
                event: eventName,
                ...data,
                id: Doh.NewUUID()
            };

            await df.forge('analytics', ['SelectDB', {
                ReplaceIntoDB: ['analytics_events', event]
            }]);

            this.emitAnalytics('event', event);
        },

        trackRoute: async function(req, res, routeInfo) {
            if (!this.analyticsConfig.enabled || !req.path || !req.headers || this.shouldExcludeFromAnalytics(req.path)) {
                return;
            }

            // Parse user agent
            const userAgentInfo = useragent.parse(req.headers['user-agent']);
            
            // Get geolocation info
            const geoInfo = geoip.lookup(req.ip || req.connection.remoteAddress);
            
            // Get precise timing
            const endTime = now();
            const responseTime = req.timestamp ? endTime - req.timestamp : null;

            const routeData = {
                path: req.originalUrl || req.url,
                query: req.query || {},
                parentId: req.headers['x-parent-tracking-id'] || null,
                trackingId: req.trackingId || null,
                params: req.params || {},
                timestamp: Date.now(),
                method: req.method,
                routeType: routeInfo.isHostForward ? 'forward' : (req.isSocket ? 'socket' : 'http'),
                status: res.statusCode,
                headers: {
                    ...this.getRelevantHeaders(req.headers)
                },
                client: {
                    ip: req.ip || req.connection.remoteAddress,
                    isSocket: !!req.isSocket,
                    socketId: req.isSocket ? req.id : undefined,
                    userAgent: {
                        browser: userAgentInfo.browser,
                        version: userAgentInfo.version,
                        os: userAgentInfo.os,
                        platform: userAgentInfo.platform,
                        isMobile: userAgentInfo.isMobile,
                        isBot: userAgentInfo.isBot
                    },
                    geo: geoInfo ? {
                        country: geoInfo.country,
                        region: geoInfo.region,
                        city: geoInfo.city,
                        ll: geoInfo.ll // latitude/longitude
                    } : null
                },
                user: req.user ? {
                    id: req.user.id,
                    type: req.user.type
                } : null,
                session: req.sessionID ? {
                    id: req.sessionID
                } : null,
                performance: {
                    responseTime: responseTime,
                    timestamp: req.timestamp,
                    endTime: endTime
                },
                ...routeInfo,
                id: Doh.NewUUID()
            };

            await df.forge('analytics', ['SelectDB', {
                ReplaceIntoDB: ['analytics_routes', routeData]
            }]);

            this.emitAnalytics('route', routeData);
        },
        // Helper to get relevant headers while excluding sensitive data
        getRelevantHeaders: function(headers) {
            const relevantHeaders = {};
            const allowedHeaders = [
                'user-agent',
                'referer',
                'referrer',
                'accept-language',
                'origin',
                'sec-ch-ua',
                'sec-ch-ua-mobile',
                'sec-ch-ua-platform'
            ];

            allowedHeaders.forEach(header => {
                if (headers[header]) {
                    relevantHeaders[header] = headers[header];
                }
            });

            return relevantHeaders;
        },

        trackPerformance: async function(metrics) {
            if (!this.analyticsConfig.performanceMetrics) return;

            await df.forge('analytics', ['SelectDB', {
                ReplaceIntoDB: ['analytics_performance', {
                    timestamp: Date.now(),
                    ...metrics,
                    id: Doh.NewUUID()
                }]
            }]);

            this.emitAnalytics('performance', metrics);
        },

        shouldExcludeFromAnalytics: function(path) {
            if(!path) return true;
            return this.analyticsConfig.excludePaths.some(pattern => {
                return pattern.includes('*') ? 
                    minimatch(path.split(/[/\\]/).join('/'), pattern.split(/[/\\]/).join('/')) :
                    path === pattern;
            });
        },

        //MARK: AddRoute
        AddRoute: function (route, middlewares, callback) {
            // Replace * with :param for Express-like route matching
            route = route.replace(/\*/g, ':param');

            // always trim a trailing slash unless it's the only character
            if (route[route.length - 1] == '/' && route.length > 1) route = route.substr(0, route.length - 1);

            if (typeof middlewares === 'function') {
                callback = middlewares;
                middlewares = [];
            }

            if (NotArray(middlewares)) {
                middlewares = [middlewares];
            }

            //middlewares = [this.parseToken, ...middlewares];

            const routeConflict = this.FindRouteConflict(route);
            if(routeConflict.conflict) {
                console.log('Route:', route, 'is overriding', routeConflict.route, '(' + routeConflict.reason + ')');
                //return;
            }

            this.Routes[route] = { callback, middlewares };
        },

        //MARK: AddMiddleware
        AddMiddleware: function (route, middleware) {
            if(NotArray(middleware)) middleware = [middleware];
            if(NotArray(this.Middlewares[route])) this.Middlewares[route] = [];
            this.Middlewares[route] = Doh.meld_arrays(this.Middlewares[route], middleware);
        },

        //MARK: AddHostForward
        AddHostForward: function (route, new_host, interceptor) {
            // always trim a trailing slash unless it's the only character
            if (route[route.length - 1] == '/' && route.length > 1) route = route.substr(0, route.length - 1);

            let routeHandler = async function (data, req, res, callback) {
                if (typeof data === 'string') {
                    req = {
                        url: data,
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        data: req
                    };
                    data = req.data;
                }
                //console.log('Forwarding:', req.url, 'to', new_host);

                // Construct the full URL for the new host
                let url = new URL(req.url, new_host);

                // Determine the request method and prepare data if method is POST
                let requestData = req.method === 'POST' && IsObjectObjectAndNotEmpty(data) ? JSON.stringify(data) : null;

                // Prepare requestOptions for Axios, including handling for both socket and non-socket scenarios
                let requestOptions = {
                    method: req.method,
                    url: url.href,
                    responseType: 'stream', // Ensuring the response is treated as a stream
                    ...(requestData ? { data: requestData } : {}), // Include data only if present
                    headers: { ...req.headers },
                };

                // Adjust headers for the forward request
                delete requestOptions.headers.host; // Remove the host header
                // Remove caching-related headers
                delete requestOptions.headers['if-none-match'];
                delete requestOptions.headers['if-modified-since'];
                delete requestOptions.headers['cache-control'];
                delete requestOptions.headers.etag;
                delete requestOptions.headers.pragma;
                delete requestOptions.headers.expires;

                // If requestData is present, set content-type and content-length headers
                if (IsString(requestData)) {
                    requestOptions.headers['Content-Type'] = 'application/json';
                    requestOptions.headers['Content-Length'] = Buffer.byteLength(requestData);
                }

                // Check if this is multipart form data
                const contentType = req.headers['content-type'] || '';
                if (contentType.startsWith('multipart/form-data')) {
                    // Create form data from the request body
                    const formData = new FormData();
                    for (const [key, value] of Object.entries(data)) {
                        // Handle files specially
                        if (value && value.buffer && value.originalname) {
                            // Convert buffer to Blob with proper type
                            const blob = new Blob([value.buffer], { type: value.mimetype });
                            formData.append(key, blob, value.originalname);
                        } else {
                            formData.append(key, value);
                        }
                    }

                    // Update request options for multipart
                    requestOptions.data = formData;
                    requestOptions.headers['Content-Type'] = contentType;
                } else {
                    // Handle regular data as before
                    let requestData = req.method === 'POST' && IsObjectObjectAndNotEmpty(data) ? JSON.stringify(data) : null;
                    if (requestData) {
                        requestOptions.data = requestData;
                        requestOptions.headers['Content-Type'] = 'application/json';
                        requestOptions.headers['Content-Length'] = Buffer.byteLength(requestData);
                    }
                }

                // Perform the forwarding with Axios
                try {
                    let response = await axios(requestOptions);

                    if(interceptor) {
                        response = await interceptor(response, req, res, callback, requestOptions);
                    }

                    if (res.isSocket) {
                        this.SendJSON(res, await convertStreamToJson(response.data), callback);
                        return false;
                    } else {
                        // Set the content type of the response
                        // Forward all headers except 'host'
                        Object.entries(response.headers).forEach(([key, value]) => {
                            if (key.toLowerCase() !== 'host' && NotFunction(value)) {
                                res.setHeader(key, value);
                            }
                        });

                        // Handle 304 Not Modified responses
                        if (response.status === 304) {
                            res.status(304).end();
                            return false;
                        }

                        // For all other responses, pipe the response stream
                        response.data.pipe(res);
                        return false;
                    }
                } catch (error) {
                    console.error(error.message);
                    if (NotFunction(res.status)) {
                        console.log('Error occurred while forwarding the request and res.status is not a function');
                        return false;
                    }
                    // if the error is a 304
                    if(error.status === 304) {
                        res.status(304).end();
                        return false;
                    }
                    res.status(500).send('Error occurred while forwarding the request');
                }
                return false;
            };

            routeHandler = routeHandler.bind(this);

            // Process route pattern for regular expression matching or direct matching
            // Replace * with :param for Express-like route matching
            route = route.replace(/\*/g, ':param');
            this.HostForwards[route] = {callback: routeHandler, isHostForward: true};

            // let routeConflict = this.FindRouteConflict(route, this.HostForwards);
            // if(routeConflict.conflict) {
            //     console.log('New HostForward:', route, 'is overriding', routeConflict.route, '(' + routeConflict.reason + ')');
            //     //return;
            // }
        },

        RemoveAppURIFromRoute: function (route, remoteLoadDohFrom = LoadDohFrom) {
            if (remoteLoadDohFrom.length) {
                if (route.indexOf(remoteLoadDohFrom) === 0) {
                    route = route.substr(remoteLoadDohFrom.length);
                }
                // always trim a trailing slash unless it's the only character
                if (route[route.length - 1] == '/' && route.length > 1) route = route.substr(0, route.length - 1);
            }
            return route;
        },

        //MARK: matchRoute
        matchRoute: function(pattern, route) {
            // Helper function to split route into parts
            const splitRoute = (r) => r.split('/').filter(Boolean);
        
            // Helper function to check if a part is a wildcard
            const isWildcard = (part = '') => part === '*' || part.startsWith(':');
        
            const patternParts = splitRoute(pattern);
            const routeParts = splitRoute(route);
        
            // Rule 5: Base Path special case
            if (route === '/' && (pattern === '/' || pattern === '*')) {
                return { match: true, params: {} };
            }
        
            const params = {};
            let patternIndex = 0;
            let routeIndex = 0;
        
            while (patternIndex < patternParts.length && routeIndex < routeParts.length) {
                const patternPart = patternParts[patternIndex];
                const routePart = routeParts[routeIndex];
        
                if (isWildcard(patternPart)) {
                    // Wildcard matching
                    const paramName = patternPart.startsWith(':') ? patternPart.slice(1) : patternPart;
                    params[paramName] = routePart;
                    patternIndex++;
                    routeIndex++;
                } else if (patternPart === routePart) {
                    // Exact match
                    patternIndex++;
                    routeIndex++;
                } else {
                    // No match
                    return false;
                }
            }
        
            // Rule 4: Longer Path Precedence
            if (patternIndex === patternParts.length && routeIndex === routeParts.length) {
                return { match: true, params };
            } else if (patternIndex === patternParts.length && isWildcard(patternParts[patternIndex-1])) {
                patternIndex--;
                routeIndex--;
                // Last part of pattern is a wildcard, consume all remaining route parts
                const paramName = patternParts[patternIndex].startsWith(':') ? patternParts[patternIndex].slice(1) : patternParts[patternIndex];
                params[paramName] = routeParts.slice(routeIndex).join('/');
                return { match: true, params };
            }
        
            return false;
        },


        //MARK: RouteConflict
        FindRouteConflict: function(newRoute, routeTable = this.Routes) {
            // Helper function to split route into parts
            const splitRoute = (route) => route.split('/').filter(Boolean);
        
            // Helper function to check if a part is a wildcard
            const isWildcard = (part = '') => part === '*' || part.startsWith(':');
        
            // Helper function to compare two route parts
            const compareRouteParts = (part1, part2) => {
                if (part1 === part2) return 'exact';
                if (isWildcard(part1) && isWildcard(part2)) return 'wildcard';
                if (!isWildcard(part1) && !isWildcard(part2)) return 'different';
                return 'static_wildcard';
            };
        
            const newRouteParts = splitRoute(newRoute);
        
            for (const existingRoute in routeTable) {
                const existingRouteParts = splitRoute(existingRoute);
        
                // Rule 1: Exact Match Conflict
                if (newRoute === existingRoute) {
                    return { conflict: true, route: existingRoute, reason: 'Exact match' };
                }
        
                // Rule 5: Base Path Conflict
                if (newRoute === '/' && existingRoute === '/') {
                    return { conflict: true, route: existingRoute, reason: 'Base path conflict' };
                }
        
                let conflictPossible = true;
                let allStaticMatch = true;
                let lastComparison = '';
        
                for (let i = 0; i < Math.max(newRouteParts.length, existingRouteParts.length); i++) {
                    const newPart = newRouteParts[i];
                    const existingPart = existingRouteParts[i];
        
                    if (!newPart || !existingPart) {
                        // Rule 4: Longer Path Precedence
                        conflictPossible = false;
                        break;
                    }
        
                    const comparison = compareRouteParts(newPart, existingPart);
        
                    switch (comparison) {
                        case 'exact':
                            // Continue checking
                            break;
                        case 'wildcard':
                            // Rule 3: Potential Wildcard Conflict
                            if (allStaticMatch) {
                                lastComparison = 'wildcard';
                            } else {
                                conflictPossible = false;
                            }
                            break;
                        case 'different':
                            // Rule 2: Static Part Precedence
                            conflictPossible = false;
                            allStaticMatch = false;
                            break;
                        case 'static_wildcard':
                            // Rule 2: Static Part Precedence
                            conflictPossible = false;
                            allStaticMatch = false;
                            break;
                    }
        
                    if (!conflictPossible) break;
                }
        
                if (conflictPossible && lastComparison === 'wildcard') {
                    return { conflict: true, route: existingRoute, reason: 'Wildcard conflict' };
                }
            }
        
            return { conflict: false };
        },


        //MARK: FindRoute
        FindRoute: function(url) {
            // TODO: for each loop:
            // 1. check if the url matches
            // 2. if it does, hang on to it as the best match so far
            // 3. check each new match against the previous best match
            // Check HostForwards first (in reverse order)
            const hostForwardPatterns = Object.keys(this.HostForwards).reverse();
            for (const pattern of hostForwardPatterns) {
                const isMatch = this.matchRoute(pattern, url);
                if (isMatch) {
                    return {...this.HostForwards[pattern], isHostForward: true, params: isMatch.params };
                }
            }

            // collect all middlewares that match this route
            let middlewares = [];
            for(const pattern in this.Middlewares) {
                if(this.matchRoute(pattern, url)) {
                    middlewares = Doh.meld_arrays(middlewares, this.Middlewares[pattern]);
                }
            }

            // Then check Routes (in reverse order)
            const routePatterns = Object.keys(this.Routes).reverse();
            for (const pattern of routePatterns) {
                const isMatch = this.matchRoute(pattern, url);
                if (isMatch) {
                    const routeInfo = this.Routes[pattern];
                    routeInfo.middlewares = Doh.meld_into_array(middlewares, routeInfo.middlewares || []);
                    return {...routeInfo, params: isMatch.params };
                }
            }

            return false;
        },


        //MARK: FollowRoute
        FollowRoute: async function (url, req, res, callback) {
            const routeInfo = this.FindRoute(url);

            res.callback = callback;
            
            if (routeInfo) {
                // Use existing tracking ID if present, otherwise generate new one
                req.trackingId = res.trackingId = req.trackingId || 
                               req.headers?.['x-tracking-id'] || 
                               req.headers?.['x-parent-tracking-id'] ||
                               Doh.NewUUID();
                
                req.timestamp = Date.now();

                // Add tracking ID to response headers for HTTP responses
                if (!res.isSocket) {
                    res.setHeader('X-Tracking-ID', req.trackingId);
                }

                let { callback: routeCallback, middlewares, params } = routeInfo;
                if (IsObjectObjectAndNotEmpty(params)) {
                    req.params = params;
                }
                middlewares = middlewares || [];
                
                // Create a middleware chain
                const executeMiddleware = async (index) => {
                    if (index < middlewares.length) {
                        // if the middleware is a function, call it
                        // the middleware function is expected to call the next middleware in the chain
                        middlewares[index](req, res, async () => await executeMiddleware(index + 1), callback);
                    } else {
                        try {
                            if(routeInfo.isHostForward && !req.url) {
                                // if this is a host forward, and there is no req.url, then call the callback with the route and req
                                // this is necessary because the req.url is not set by the proxy, so we need to use the original route
                                await routeCallback(url, req, res, callback);
                            } else {
                                // otherwise, call the callback with the req.body or req.query, which could be a string, object, or null
                                // this is the normal case
                                await routeCallback(req.body || req.query || req, req, res, callback);
                            }
                        } finally {
                            // Compute response time and track the route
                            req.responseTime = Date.now() - req.timestamp;
                            await this.trackRoute(req, res, routeInfo).catch(console.error);
                        }
                    }
                };

                await executeMiddleware(0);
                // log the route that was followed
                if(Doh.pod.express_config?.log_routes) console.log('FollowRoute:', url);
                return false;
            } else {
                // NEW: if the request comes via socket we try to serve a static file
                if (res.isSocket) {
                    try {
                        // Adjust the file path relative to our content folder.
                        // (This uses the same helper that removes the app URI if needed.)
                        const filePath = this.RemoveAppURIFromRoute(url, req?.remoteLoadDohFrom || '');
                        const fullPath = path.join(LoadDohFrom, filePath);
                        
                        if (fs.existsSync(fullPath)) {
                            const stat = fs.statSync(fullPath);
                            if (stat.isFile()) {
                                let content = '';
                                let isHtml = Doh.IsHTMLRequest(req);
                                if(isHtml) {
                                    content = Doh.processHtml(isHtml, req.trackingId, req.parentTrackingId);
                                } else {
                                    content = fs.readFileSync(fullPath);
                                }
                                // Use mime.lookup (or fallback) to determine the content type
                                const mimeType = (typeof mime !== 'undefined' && mime.lookup) ? mime.lookup(fullPath) : 'application/octet-stream';
                                
                                return this.SendJSON(res, { 
                                    status: 200, 
                                    headers: { "Content-Type": mimeType, "Content-Length": stat.size }, 
                                    body: content.toString('base64'),
                                    isBase64Encoded: true 
                                }, callback);
                            }
                        }
                    } catch (error) {
                        console.error("Error serving static file over socket:", error);
                    }
                } else {
                    console.log(`No route for ${url}`);
                }

                // For socket requests, we want to allow fallthrough to other handlers
                // by not calling any callback or response methods
                if (res.isSocket) {
                    // Return false without calling callback to enable fallthrough to other handlers
                    return false;
                }
                
                // For HTTP requests, send a 404 response
                if (res.status) {
                    res.status(404).send('Not Found');
                } else if (callback) {
                    callback({ error: 'Not Found', status: 404 });
                }
                return false;
            }
        },


        //MARK: SendJSON
        SendJSON: async function (res, data, statusCodeOrCallback, callback) {
            if(IsFunction(statusCodeOrCallback)) {
                callback = statusCodeOrCallback;
                res.status(200);
            } else if(IsNumber(statusCodeOrCallback)) {
                res.status(statusCodeOrCallback);
            } else {
                res.status(200);
            }
            if(!IsFunction(callback)) {
                // console.warn('SendJSON called with non-function callback:', callback);
                callback = function(data) {
                    console.log('SendJSON callback:', data);
                };
            }
            if (!res.isSocket) {
                if (!res.headersSent) {
                    res.setHeader('Content-Type', 'application/json');
        
                    await res.end(JSON.stringify(data));
                } else {
                    console.log('SendJSON tried to send headers a second time for data:', data);
                }
            } else {
                // For socket (tunneled) responses
                if (typeof data == 'string') {
                    await res.send(data);
                } else if (res.json) {
                    // If res.json exists, use it directly
                    res.json(data);
                } else if (IsFunction(callback)) {
                    // If no res.json but callback exists, use it directly without wrapping
                    await callback(data);
                } else {
                    console.warn('SendJSON: Unable to send response - no valid method available');
                }
            }
        },


        //MARK: SendHTML
        SendHTML: function (res, modulename, dependencies, title, template_filename, head, handlebars={}, commands=[]) {
            const sendHTMLContent = (htmlContent) => {
                if (res.isSocket) {
                    // For tunnel socket connections
                    res.setHeader('Content-Type', 'text/html');
                    res.send(htmlContent);
                } else {
                    // For regular HTTP responses
                    res.type('html').send(htmlContent);
                }
            };
        
            let importmap = Doh.generateImportMap();

            // build a block of modulepreload tags for each core dependency since all load conditions will require them
            let modulepreloads = '', dep_array = ['doh_js'], deps_added = [], all_core_deps = [];
            // let modulepreloads = '', dep_array = dependencies, deps_added = [], all_core_deps = [];
            let scriptpreloads = '', script_deps_added = [];
            for (let dependency of dep_array) {
                let deps = Doh.expand_dependencies(dependency, true);
                for(let dep of deps) {
                    if(Doh.Packages[dep]?.load){
                        for(let subdep of Doh.Packages[dep].load) {
                            let subdep_def = Doh.parse_load_statement(subdep);
                            let clean_subdep = subdep_def.from;
                            if(subdep_def.loaderType === 'js' && !script_deps_added.includes(clean_subdep)) {
                                script_deps_added.push(clean_subdep);
                                scriptpreloads += `<link rel="preload" href="${clean_subdep}" as="script" crossorigin="anonymous" />\n`;
                            }
                            if(subdep_def.loaderType === 'css' && !script_deps_added.includes(clean_subdep)) {
                                script_deps_added.push(clean_subdep);
                                scriptpreloads += `<link rel="preload" href="${clean_subdep}" as="style" crossorigin="anonymous" />\n`;
                            }
                        }
                    }
                }
                Doh.meld_arrays(all_core_deps, deps);
            }
            for (let dependency of all_core_deps) {
                let modulefile = Doh.Packages[dependency].file;
                if(modulefile && !deps_added.includes(modulefile)) {
                    deps_added.push(modulefile);
                    modulepreloads += `<link rel="modulepreload" href="${modulefile}" crossorigin="anonymous" />\n`;
                }
            }
            
            if(NotArray(commands)) {
                Doh.debug('SendHTML called with non-array commands:', commands);
                commands = [];
            }
            // if the last command is not 'ApplyHandlebars' then add it
            if(commands[commands.length - 1] !== 'ApplyHandlebars') {
                commands.push('ApplyHandlebars');
            }

            if(NotObjectObject(handlebars)) {
                Doh.debug('SendHTML called with non-object handlebars:', handlebars);
                handlebars = {};
            }

            // ensure thwat we depend on analytics_client if Doh.pod.analytics_config.enabled = true
            if(Doh.pod.analytics?.enabled) {
                dependencies = Doh.meld_into_array(['analytics_client'], dependencies || []);
            }
        
            let adf = New('AsyncDataforge');
            adf.forge(
                null,
                [
                    // import the template file contents from the stored path
                    {ImportFromFile: template_filename},
                    {
                        // if the template file contents are empty, then import the global 'htmlTemplate' variable
                        If: [[LacksValue], [{ ImportFromBranch: 'htmlTemplate' }]]
                    },
                    // run passed in commands
                    ...commands,
                    'ApplyHandlebars'
                ],
                {
                    ...handlebars,
                    modulename: JSON.stringify(modulename),
                    dependencies: dependencies.length ? JSON.stringify(dependencies) : '',
                    trackingId: res.trackingId || null,
                    parentTrackingId: res.parentTrackingId || null,
                    head:  scriptpreloads + '\n' + modulepreloads + '\n' + (head ? head : ''),
                    title: title ? title: 'Doh',
                    importmap: importmap ? importmap : '',
                    "doh.js": `${Doh.hostUrlString()}/doh.js`,
                    "deploy.js": `${Doh.hostUrlString()}/doh_js/deploy.js`,
                    body: handlebars.body ? handlebars.body : '',
                }
            ).then(function (data) {
                data = adf.unescape_handlebars(data);
                sendHTMLContent(data);
            });
        },


        //MARK: SendContent
        SendContent: async function(res, content, handlebars = {}, commands = []) {
            if(LacksValue(content)) {
                console.warn('SendContent called with no content');
                return;
            }
            if(NotObjectObject(handlebars)) {
                Doh.debug('SendContent called with non-object handlebars:', handlebars);
                handlebars = {};
            }
            handlebars.body = handlebars.body || '';
            handlebars.body += content;
            return this.SendHTML(res, handlebars.modulename || 'html_content_module', handlebars.dependencies || [], handlebars.title || null, handlebars.template || null, handlebars.head || null, handlebars, commands);
        },

        // In the setupTunnelServer function
        //MARK: Tunnel
        setupTunnelServer: function() {
            if (Doh.pod.express_config?.tunnel_ssl_port && Doh.pod.express_config?.ssl_info) {
                const tunnelApp = express();
                const tunnelServer = https.createServer(Doh.pod.express_config.ssl_info, tunnelApp);
                
                tunnelApp.use(express.raw({ type: '*/*', limit: '50mb' }));
                tunnelApp.use((req, res, next) => {
                    req.isSocket = true;
                    next();
                });

                const tunnelIo = new Server(tunnelServer, {
                    path: '/tunnel',
                    cors: { origin: '*' },
                    maxHttpBufferSize: 50 * 1024 * 1024
                });

                let tunnelSocket = null;

                tunnelIo.on('connection', (socket) => {
                    console.log('Tunnel client connected:', socket.id);
                    
                    if (tunnelSocket) {
                        console.log('Another tunnel client attempted to connect. Rejecting.');
                        socket.disconnect(true);
                        return;
                    }

                    tunnelSocket = socket;

                    socket.on('disconnect', () => {
                        console.log('Tunnel client disconnected:', socket.id);
                        tunnelSocket = null;
                    });
                });

                tunnelApp.all('*', (req, res, next) => {
                    if (!tunnelSocket) {
                        return res.status(503).send('Tunnel not available');
                    }

                    // Read the entire body as a buffer
                    let body = [];
                    req.on('data', (chunk) => {
                        body.push(chunk);
                    }).on('end', () => {
                        body = Buffer.concat(body);

                        const requestData = {
                            method: req.method,
                            url: req.url,
                            headers: req.headers,
                            body: body.toString('base64'), // Always send as base64
                            isBase64Encoded: true
                        };

                        tunnelSocket.emit('request', requestData, (response) => {
                            res.status(response.status || 200);
                            if (IsObjectObjectAndNotEmpty(response.headers)) {
                                for (const [key, value] of Object.entries(response.headers)) {
                                    res.setHeader(key, value);
                                }
                            }                        

                            if (response.isStream) {
                                // Handle streaming response
                                let isFirstChunk = true;
                                const chunkHandler = (chunk) => {
                                    if (isFirstChunk) {
                                        res.write(Buffer.from(chunk, 'base64'));
                                        isFirstChunk = false;
                                    } else {
                                        res.write(Buffer.from(chunk, 'base64'));
                                    }
                                };

                                tunnelSocket.on('file-chunk', chunkHandler);
                                tunnelSocket.once('file-end', () => {
                                    res.end();
                                    tunnelSocket.removeListener('file-chunk', chunkHandler);
                                });
                            } else {
                                // Handle regular response
                                // let responseBody = response.body;
                                // if (response.isBase64Encoded) {
                                //     responseBody = Buffer.from(responseBody, 'base64');
                                // }
                                // res.send(responseBody);
                                let responseBody = response.body;
                                if (response.isBase64Encoded) {
                                    responseBody = Buffer.from(responseBody, 'base64');
                                }
                                if (res.getHeader('Content-Type') === 'application/json') {
                                    res.json(JSON.parse(responseBody));
                                } else {
                                    res.send(responseBody);
                                }
                            }
                        });
                    });
                });

                tunnelServer.listen(Doh.pod.express_config.tunnel_ssl_port, () => {
                    console.log(`Tunnel HTTPS server running on port ${Doh.pod.express_config.tunnel_ssl_port}`);
                });
            }
        },
        setupTunnelClient: function() {
            if (Doh.pod.express_config?.tunnel_remote_url) {
                let remoteSocket = null;
                const fsp = fs.promises;

                // Helper function to check if a path is configured for host forwarding
                const isHostForwarded = (path) => {
                    const hostForwards = Doh.pod.express_config?.host_forwards || {};
                    return Object.keys(hostForwards).some(route => {
                        // Convert route pattern to regex
                        const convertedRoute = route.replace(/\*/g, ':param');
                        return Router.matchRoute(convertedRoute, path);
                    });
                };

                // Helper function to get the forwarding URL for a path
                const getForwardingUrl = (path) => {
                    const hostForwards = Doh.pod.express_config?.host_forwards || {};
                    for (const [route, targetUrl] of Object.entries(hostForwards)) {
                        const convertedRoute = route.replace(/\*/g, ':param');
                        if (Router.matchRoute(convertedRoute, path)) {
                            return targetUrl + path;
                        }
                    }
                    return null;
                };

                // Helper function to serve forwarded content
                const serveForwardedContent = async (forwardUrl, localRes) => {
                    try {
                        const response = await axios({
                            method: 'GET',
                            url: forwardUrl,
                            responseType: 'stream'
                        });

                        localRes.status(response.status);
                        for (const [key, value] of Object.entries(response.headers)) {
                            localRes.setHeader(key, value);
                        }

                        response.data.pipe(localRes);
                        return true;
                    } catch (error) {
                        console.error('Error forwarding request:', error);
                        return false;
                    }
                };

                // Helper function to serve static files
                const serveStaticFile = async (filePath, res) => {
                    let fullPath, stat;
                    try {
                        fullPath = path.join(LoadDohFrom, filePath);
                        stat = await fsp.stat(fullPath);
                    } catch (error) {
                        // File not found, just return false
                        return false;
                    }
                    try {
                        if (stat.isFile()) {
                            const content = await fsp.readFile(fullPath);
                            const mimeType = mime.lookup(fullPath) || 'application/octet-stream';
                            
                            res.setHeader('Content-Type', mimeType);
                            res.setHeader('Content-Length', stat.size);
                            res.status(200).send(content);
                            return true;
                        }
                    } catch (error) {
                        console.error('Error serving static file:', error);
                    }
                    return false;
                };

                // Helper variable to track the last attempt time
                let lastAttemptTime = Date.now();
                let reconnecting = false;
                const connectTunnel = () => {
                    if (reconnecting) return; // Exit if already reconnecting
                    reconnecting = true;
                    console.log('[Tunnel Client] Attempting to connect...');
                    remoteSocket = ioClient(Doh.pod.express_config.tunnel_remote_url, {
                        path: '/tunnel',
                        transports: ['websocket'],
                        reconnection: true,
                        reconnectionAttempts: Infinity,
                        reconnectionDelay: 1000,
                    });
        
                    remoteSocket.on('connect', () => {
                        console.log('[Tunnel Client] Connected to remote server');
                        reconnecting = false;  // Reset flag after successful connection
                    });
        
                    remoteSocket.on('request', async (requestData, callback) => {
                        console.log('[Tunnel Client] Received request:', requestData.url);
                        
                        const localReq = {
                            method: requestData.method,
                            url: requestData.url,
                            headers: requestData.headers,
                            body: requestData.body,
                            isSocket: true
                        };
        
                        const localRes = {
                            isSocket: true,
                            statusCode: 200,
                            headers: {},
                            body: null,
                            isStream: false,
                            streamStarted: false,
                            listeners: {},
                            status: function(code) {
                                this.statusCode = code;
                                return this;
                            },
                            setHeader: function(name, value) {
                                this.headers[name] = value;
                                return this;
                            },
                            set: function(headers) {
                                this.headers = {...this.headers, ...headers};
                                return this;
                            },
                            write: function(chunk) {
                                if (!this.streamStarted) {
                                    this.streamStarted = true;
                                    callback({
                                        status: this.statusCode,
                                        headers: this.headers,
                                        isStream: true
                                    });
                                }
                                remoteSocket.emit('file-chunk', Buffer.from(chunk).toString('base64'));
                            },
                            json: function(body) {
                                this.setHeader('Content-Type', 'application/json');
                                this.send(JSON.stringify(body));
                            },
                            send: function(body) {
                                this.body = body;
                                this.end();
                            },
                            end: function(chunk) {
                                if (this.streamStarted) {
                                    if (chunk) {
                                        this.write(chunk);
                                    }
                                    remoteSocket.emit('file-end');
                                } else {
                                    callback({
                                        status: this.statusCode,
                                        headers: this.headers,
                                        body: this.body,
                                        isStream: false,
                                        isBase64Encoded: Buffer.isBuffer(this.body)
                                    });
                                }
                                if (this.listeners['finish']) {
                                    this.listeners['finish'].forEach(listener => listener());
                                }
                                this.streamStarted = false;
                            },
                            on: function(event, listener) {
                                if (!this.listeners[event]) {
                                    this.listeners[event] = [];
                                }
                                this.listeners[event].push(listener);
                            },
                            emit: function(event, ...args) {
                                if (this.listeners[event]) {
                                    this.listeners[event].forEach(listener => listener(...args));
                                }
                            },
                            once: function(event, listener) {
                                const onceListener = (...args) => {
                                    this.removeListener(event, onceListener);
                                    listener(...args);
                                };
                                return this.on(event, onceListener);
                            },
                            removeListener: function(event, listener) {
                                if (this.listeners[event]) {
                                    this.listeners[event] = this.listeners[event].filter(l => l !== listener);
                                }
                            },
                            type: function(type) {
                                this.setHeader('Content-Type', type);
                                return this;
                            }
                        };
            
                        // Check if the request is for a host-forwarded path
                        const urlPath = requestData.url.split('?')[0];
                        if (isHostForwarded(urlPath)) {
                            const forwardUrl = getForwardingUrl(urlPath);
                            if (forwardUrl) {
                                const forwarded = await serveForwardedContent(forwardUrl, localRes);
                                if (forwarded) {
                                    return;
                                }
                            }
                        }

                        // Check for static file serving (if not host-forwarded)
                        const forbiddenPaths = Doh.pod.express_config?.ignore_paths || [];
                        const isAllowed = !forbiddenPaths.some(folder => {
                            const normalizedRequestPath = path.normalize(urlPath);
                            const normalizedFolderPath = path.normalize(path.join('/', folder));
                            return normalizedRequestPath === normalizedFolderPath || 
                                normalizedRequestPath.startsWith(`${normalizedFolderPath}/`);
                        });
        
                        if (isAllowed) {
                            const served = await serveStaticFile(urlPath, localRes);
                            if (served) {
                                return;
                            }
                        }
        
                        // If not a static file or not served, follow the route
                        return this.FollowRoute(requestData.url, localReq, localRes, callback);
                    });
        
                    remoteSocket.on('disconnect', () => {
                        console.log('[Tunnel Client] Disconnected from remote server');
                        reconnecting = false;  // Reset flag on disconnect
                    });
        
                    remoteSocket.on('error', (error) => {
                        console.error('[Tunnel Client] Socket error:', error.message);
                        reconnecting = false;  // Reset flag on error
                    });
        
                    remoteSocket.on('connect_error', (error) => {
                        console.error('[Tunnel Client] Connection error:', error.message);
                        reconnecting = false;  // Reset flag on connection error
                    });
                };

                connectTunnel();  // Attempt a new connection

                // Attempt to reconnect every 5 seconds if the connection is lost
                setInterval(() => {
                    if (!remoteSocket || !remoteSocket.connected) {
                        const now = Date.now();
                        const timeSinceLastAttempt = now - lastAttemptTime;
                        if (!reconnecting && timeSinceLastAttempt >= 5000) {
                            lastAttemptTime = now;
                            connectTunnel();  // Attempt a new connection
                        } else {
                            console.log('[Tunnel Client] Waiting to retry connection...');
                        }
                    }
                }, 5000);
            }
        },

        //MARK: ObjectPhase
        object_phase: function() {
            // Initialize analytics config from pod
            const analyticsConfig = Doh.pod.analytics || {};
            Object.assign(this.analyticsConfig, analyticsConfig);

            //loop through the url_forwards and add them with Router.AddForward
            let host_forwards = Doh.pod.express_config?.host_forwards;
            if (host_forwards) {
                for (var i in host_forwards) {
                    var new_host = host_forwards[i];
                    this.AddHostForward(i, new_host);
                }
            }

            //this.setupSocketHandler();
            if (IsFunction(app)) {
                this.setupTunnelServer();
                this.setupTunnelClient();


                if (this.analyticsConfig.enabled) {
                    this.setupAnalytics();
                    console.log('Router initialized with analytics config:', this.analyticsConfig);
                }
            }
        },

        // Convert response stream to string data
        GetForwardedData: async function(response) {
            let data = '';
            await new Promise((resolve, reject) => {
                response.data.on('data', chunk => data += chunk);
                response.data.on('end', resolve);
                response.data.on('error', reject);
            });
            return data;
        },

        // Create new stream from string data
        NewStreamFromData: async function(data) {
            const { Readable } = await import('stream');
            const stream = new Readable();
            stream._read = () => {};
            stream.push(data);
            stream.push(null);
            return stream;
        },
    });

    
    // Function to convert Axios response stream to JSON
    // used in the HostForwards route handler
    const convertStreamToJson = (responseStream) => {
        return new Promise((resolve, reject) => {
            let rawData = '';

            // Listen for data events to collect chunks
            responseStream.on('data', (chunk) => {
                rawData += chunk;
            });

            // Once the stream ends, parse the collected data into JSON
            responseStream.on('end', () => {
                try {
                    const jsonData = JSON.parse(rawData);
                    resolve(jsonData);
                } catch (error) {
                    reject(new Error('Error parsing JSON from response stream'));
                }
            });

            // Handle any errors during streaming
            responseStream.on('error', (error) => {
                reject(new Error('Error in response stream'));
            });
        });
    };
    window.convertStreamToJson = convertStreamToJson;
});

Doh.Module('express_router', [
    'express_server',
    'express_router_as_library',
    'socket_handler',
], async function(DohPath, Router, app, fs){
    
    if (Doh.pod.express_config?.enabled) {
        console.log(`\n\nServer running:   ${Doh.hostUrlString()}\n              (Ctrl+Click ^ to open in browser)\n`);
    }

    const DohMiddleware = async function (req, res, next) {
        var reqpath = req.url.toString().split('?')[0];
        reqpath = Router.RemoveAppURIFromRoute(reqpath);

        // find out if Doh should handle the request here
        res.isSocket = false;
        
        // Wait 1000ms on first request to allow route registration
        if (!DohMiddleware.initialized) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            DohMiddleware.initialized = true;
        }
        
        await Router.FollowRoute(reqpath, req, res, next);
        
        //next();
        return false;
    }

    // if the favicon.ico file is missing, copy the one from ^/favicon.ico
    if (!fs.existsSync(DohPath('/favicon.ico'))) {
        fs.copyFileSync(DohPath('^/favicon.ico'), DohPath('/favicon.ico'));
    }

    if (IsFunction(app)) {
        app.use(DohMiddleware);
    }
});
