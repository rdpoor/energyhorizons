![Router](^/router.png?size=small)

The Doh Router seamlessly integrates traditional HTTP handling with Socket.IO, providing a unified interface for both protocols that offers: 

- Configuration and setup through pod.yaml
- Unified handling of HTTP/S and Socket.IO requests
- Advanced host forwarding and tunneling support
- Integrated Express middleware system with built-in security features
- Comprehensive analytics system with performance tracking
- Sophisticated route conflict detection and resolution
- Content Security Policy (CSP) configuration
- Hot Module Replacement integration
- Greenlock automatic SSL integration
- Image resizing w/ URL parameter

## Router Configuration

Configuration is managed through the `pod.yaml` file. Key settings include:

```yaml
express_config:
  # Basic HTTP/HTTPS configuration
  hostname: example.com
  strict_hostnames: false
  port: 3000
  ssl_port: 443
  ssl_info:
    key: /path/to/key.pem
    cert: /path/to/cert.pem
  
  # Tunneling configuration
  tunnel_ssl_port: 8443
  tunnel_remote_url: https://tunnel.example.com:8443
  
  # Host forwarding rules (path patterns to external URLs)
  host_forwards: 
    '/api/external/*': 'https://api.external-service.com'
  
  # Array of paths to be ignored by the default file exposure
  ignore_paths:
    - .doh
    - .git
    - pod.yaml
    - .env
    - '*.env'

  # Security configurations
  cors_hosts: ['trusted-origin.com']
  cors_wildcard: false
  only_use_defined_hosts: false
  
  # Content Security Policy settings
  helmet: true
  content_security_policy: false
  use_content_security_policy_defaults: true
  
  # Max age for caching in seconds
  cache_max_age: 10
  
  # Maximum size for request bodies
  body_size_limit: '50mb'
  
  # Configuration for rate limiting
  rate_limit:
    windowMs: 900000  # 15 minutes
    max: 100          # Limit each IP to 100 requests per windowMs
  
  # Request logging
  log_routes: false
```

## Routing Priority: File-based Routing First

**New in Doh**

The Doh Router now prioritizes file-based routing over code-based route registration. This means:

- **If a request matches an HTML file (or a directory with an `index.html`), that file is served directly.**
  - The file is processed with Handlebars and Hot Module Replacement (HMR) is automatically injected.
  - This applies to any `.html` file or any directory containing an `index.html`.
- **If no file match is found, the system falls back to code-based (registered) routes.**
  - These are routes registered via `Router.AddRoute` or similar APIs.

This approach enables a more intuitive, filesystem-driven development experience, while still supporting advanced API and dynamic routes via code.

**Routing Flow Summary:**

1. **File-based Routing:**
    - Serve HTML files (with HMR and Handlebars) if present.
    - Serve static assets (images, CSS, JS, etc.) as usual.
2. **Code-based Routing:**
    - If no file match, check registered routes (API endpoints, dynamic handlers, etc.).
3. **404 Not Found:**
    - If neither is found, return a 404 response.

## Analytics System

The Router includes a built-in analytics system that tracks route usage, performance metrics, and custom events:

```javascript
// Enable analytics in pod configuration
Doh.Pod('express_router', {
  browser_pod: {
    analytics: {
      enabled: true,
      excludePaths: ['/health', '/metrics', '*.js', '*.css', '*.map', '*.ico'],
      sampleRate: 1.0
    }
  }
})

// Register analytics event handlers
Router.onAnalytics('route', function(routeData) {
  console.log(`Route accessed: ${routeData.path} (${routeData.method})`);
  // Process route analytics data (response time, client info, etc.)
});

Router.onAnalytics('event', function(eventData) {
  console.log(`Custom event: ${eventData.event}`);
  // Process custom event data
});

// Track custom events from client or server
Router.trackEvent('user_action', {
  action: 'click',
  elementId: 'submit-button',
  page: '/checkout'
});
```

The analytics system automatically collects:
- Route access data (path, method, response time)
- User agent information (browser, device, OS)
- Geolocation data when available
- Performance metrics
- User session and authentication status

## Unified Route Handling

Doh Router unifies HTTP and Socket.IO routing, allowing a single route definition to handle both protocols seamlessly:

```javascript
// We depend on express_router to ensure Router is properly initialized
Doh.Module('mymodule_routes', ['express_router'], function(Router) {

  Router.AddRoute('/api/data', async function(data, req, res, callback) {
      // 'data' contains the request payload, regardless of HTTP method or Socket.IO
      // 'req' and 'res' are provided for HTTP requests
      // 'callback' is used for Socket.IO responses

      const result = await processData(data);
      
      // Use SendJSON for both HTTP and Socket.IO responses
      Router.SendJSON(res, result, callback);
  });
});
```

> **Note:** With the new routing priority, code-based route registration is now secondary to file-based routing. If a request matches an HTML file or directory, that file is served first. Only unmatched requests are handled by registered routes.

> **Best Practice:** Use file-based routing for static and template-driven pages, and code-based routes for APIs, dynamic endpoints, or advanced logic.

## Route Conflict Detection

The Router implements sophisticated conflict detection to prevent ambiguous routing:

```javascript
// These routes would conflict (exact match)
Router.AddRoute('/users', handleUsers);
Router.AddRoute('/users', handleUsersAgain); // Will log a conflict warning

// These won't conflict (static path vs wildcard)
Router.AddRoute('/users/:id', handleUserById);
Router.AddRoute('/users/profile', handleUserProfile); // Takes precedence due to static path

// These would conflict (wildcards in same position)
Router.AddRoute('/products/:category', handleCategory);
Router.AddRoute('/products/:id', handleProductId); // Will log a conflict warning
```

The conflict detection follows these rules:
1. Exact match routes always conflict
2. Static path segments take precedence over wildcards
3. Routes with wildcards in the same position conflict
4. Longer paths take precedence over shorter paths
5. Base path (`/`) only conflicts with another base path

## Transparent HTTP Emulation over Sockets

Doh Router emulates HTTP requests over WebSockets, allowing for protocol-agnostic APIs:

```javascript
// Client-side (using Socket.IO)
socket.emit('/api/data', { some: 'data' }, (response) => {
    console.log(response); // Handled just like an HTTP response
});

// Server-side (same route handling both HTTP and Socket.IO)
Router.AddRoute('/api/data', function(data, req, res, callback) {
    // Process data...
    Router.SendJSON(res, { result: 'success' }, callback);
});
```

The socket connection automatically:
- Maintains authentication tokens
- Tracks request/response cycles
- Handles HTTP methods appropriately
- Enables real-time communication while preserving API compatibility

## Advanced Response Handling

The Router provides several methods for sending responses:

```javascript
// Send JSON response (works for both HTTP and Socket.IO)
Router.SendJSON(res, { result: 'success' }, callback);

// Send HTML response with template processing
Router.SendHTML(res, 'my_module', ['dependency1', 'dependency2'], 'Page Title', 'path/to/template.html', customHeadContent);

// Send raw content with optional templating
Router.SendContent(res, '<h1>Hello World</h1>', {
  title: 'Custom Page',
  head: '<link rel="stylesheet" href="/styles.css">',
  dependencies: ['my_dependency']
});
```

## Host Forwarding and Tunneling

Doh Router provides advanced forwarding capabilities:

```javascript
// Simple forwarding
Router.AddHostForward('/api/external/*', 'https://api.example.com');

// Forwarding with request/response interceptor
Router.AddHostForward('/api/transform/*', 'https://backend.example.com', 
  async function(response, req, res, callback, requestOptions) {
    // Transform the response before sending it back
    // This could modify headers, data, or perform other operations
    return response;
  }
);
```

The tunneling feature enables secure remote access to local development environments:

```yaml
# Server configuration (public-facing)
express_config:
  tunnel_ssl_port: 8443
  ssl_info:
    key: /path/to/key.pem
    cert: /path/to/cert.pem

# Client configuration (private development environment)
express_config:
  tunnel_remote_url: https://tunnel.example.com:8443
```

This creates a secure bidirectional tunnel between environments:
- The tunnel server listens for incoming connections on `tunnel_ssl_port`
- The tunnel client connects to the server at `tunnel_remote_url`
- Requests received by the server are forwarded to the client
- The client processes requests locally and returns responses through the tunnel

## Security and Middleware

The Router includes comprehensive security features:

```javascript
// Global middleware for all routes
Router.AddMiddleware('/*', authenticationMiddleware);

// Path-specific middleware
Router.AddMiddleware('/admin/*', [
  Router.parseToken,
  Router.requireAuth,
  adminAccessCheck
]);

// Route-specific middleware
Router.AddRoute('/protected', [Router.parseToken, Router.requireAuth], 
  function(data, req, res, callback) {
    // Protected route logic
    Router.SendJSON(res, { protected: 'data' }, callback);
});
```

Additional security features include:
- Content Security Policy configuration with smart defaults
- Helmet integration for HTTP headers
- Rate limiting to prevent abuse
- CORS configuration with origin control
- Request body size limits
- Path exclusion for sensitive files

## Best Practices

### Middleware Organization

```javascript
// Create custom middleware
const loggingMiddleware = (req, res, next) => {
  console.log(`Request: ${req.method} ${req.url}`);
  const startTime = Date.now();
  
  // Measure response time
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    console.log(`Response: ${res.statusCode} (${duration}ms)`);
  });
  
  next();
};

// Apply middleware globally for specific paths
Router.AddMiddleware('/api/*', loggingMiddleware);

// Stack middleware for specific routes
Router.AddRoute('/important', [
  loggingMiddleware, 
  authMiddleware, 
  validationMiddleware
], handleImportantRoute);
```

### Microservices Architecture

```javascript
// Forward different API paths to specialized microservices
Router.AddHostForward('/api/users/*', 'https://user-service.internal');
Router.AddHostForward('/api/products/*', 'https://product-service.internal');
Router.AddHostForward('/api/orders/*', 'https://order-service.internal');

// Forward with request transformation
Router.AddHostForward('/legacy/*', 'https://legacy-system.internal', 
  async function(response, req, res, callback, requestOptions) {
    // Convert legacy response format to modern API format
    const transformedData = transformLegacyResponse(await response.data);
    response.data = transformedData;
    return response;
  }
);
```

- Leverage unified GET/POST handling for flexible API design
- Utilize Socket.IO for real-time features while maintaining HTTP compatibility
- Implement custom middleware for specialized request processing
- Use host forwarding for microservices architecture
- Employ tunneling for secure remote development and testing

This creates a protocol-agnostic API that works identically over HTTP and WebSockets, making it ideal for both traditional web applications and real-time interactive experiences.

## Hot Module Replacement (HMR)

The Doh Router includes a built-in Hot Module Replacement (HMR) system that enables live updates of HTML content without requiring page refreshes. **All HTML files served through file-based routing are automatically equipped with HMR capabilities.**

### HMR Integration

- The HMR subsystem is integrated as a module within the Router system
- **HTML files served through file-based routing are automatically processed with Handlebars and HMR.**
- Changes to HTML files trigger instant updates without losing page state

### How It Works

1. The `Doh.processHtml` function in the express server automatically injects HMR scripts into all HTML responses:

```javascript
// HMR script injected after <body> tag
const hmrScript = `
  <script type="module">
    import "${Doh.hostUrlString()}/doh_js/deploy.js";
    await Doh.load('hmr');
    await Doh.live_html('${DohPath.DohSlash(filepath)}');
  </script>`;
```

2. When the page loads, the HMR subsystem establishes a connection to monitor file changes
3. When the original HTML file is modified, the changes are applied to the live page
4. This provides a seamless development experience without losing application state

### Using HMR in Custom Templates

When creating custom HTML templates, you don't need to add any special code - the HMR functionality is automatically injected. The system works with:

- Standard HTML files
- Templates processed through the handlebars system
- Dynamically generated HTML content

This creates a streamlined development workflow where changes to HTML files are instantly reflected in the browser.

## Image Resizing

The Doh Router includes built-in image resizing capabilities that can be accessed through URL parameters. This feature allows for dynamic image resizing without requiring pre-processing or storing multiple versions of the same image.

### Configuration

Image size presets are configured in the `pod.yaml` file under `express_config`:

```yaml
express_config:
  image_size_presets:
    icon: { width: 32, height: 32, fit: 'cover' }
    'small-thumb': { width: 64, height: 64, fit: 'cover' }
    'large-thumb': { width: 128, height: 128, fit: 'cover' }
    smaller: { width: 240, fit: 'inside' }
    small: { width: 320, fit: 'inside' }
    medium: { width: 640, fit: 'inside' }
    large: { width: 1024, fit: 'inside' }
```

Each preset can specify:
- `width`: Target width in pixels
- `height`: Target height in pixels (optional)
- `fit`: Resize fitting method ('cover', 'contain', 'inside', 'outside', 'fill')

### Usage

To resize an image, simply add the `size` parameter to the image URL:

```html
<!-- Original image -->
<img src="/images/photo.jpg">

<!-- Resized versions -->
<img src="/images/photo.jpg?size=icon">
<img src="/images/photo.jpg?size=small-thumb">
<img src="/images/photo.jpg?size=large-thumb">
<img src="/images/photo.jpg?size=small">
<img src="/images/photo.jpg?size=medium">
<img src="/images/photo.jpg?size=large">
```

### Supported Image Formats

The image resizing feature supports the following formats:
- JPEG/JPG
- PNG
- GIF
- WebP
- TIFF
- AVIF

### Extending Size Presets

You can extend or override the default size presets in your `pod.yaml`:

```yaml
express_config:
  image_size_presets:
    # Override existing presets
    icon: { width: 48, height: 48, fit: 'cover' }
    
    # Add new presets
    'hero': { width: 1920, height: 1080, fit: 'cover' }
    'card': { width: 400, height: 300, fit: 'cover' }
    'avatar': { width: 150, height: 150, fit: 'cover' }
    
    # Custom aspect ratio
    'banner': { width: 1200, height: 400, fit: 'cover' }
    
    # Maintain aspect ratio
    'sidebar': { width: 300, fit: 'inside' }
```

### Performance Considerations

- Images are processed on-demand and cached by the browser
- The original image format is preserved
- Processing is done using the efficient Sharp library
- Failed requests fall back to the original image
- Invalid size parameters are ignored

### Example Usage in Templates

```html
<!-- Responsive images with different sizes -->
<picture>
  <source media="(max-width: 320px)" srcset="/images/hero.jpg?size=small">
  <source media="(max-width: 640px)" srcset="/images/hero.jpg?size=medium">
  <source media="(max-width: 1024px)" srcset="/images/hero.jpg?size=large">
  <img src="/images/hero.jpg?size=hero" alt="Hero image">
</picture>

<!-- Thumbnail grid -->
<div class="thumbnails">
  <img src="/images/item1.jpg?size=small-thumb" alt="Item 1">
  <img src="/images/item2.jpg?size=small-thumb" alt="Item 2">
  <img src="/images/item3.jpg?size=small-thumb" alt="Item 3">
</div>

<!-- User avatars -->
<img src="/images/avatar.jpg?size=icon" alt="User avatar">
```

This feature provides a flexible and efficient way to handle image resizing without requiring pre-processing or storing multiple versions of the same image.

# Doh Registered Route Conflict Detection

The route conflict detection system in Doh identifies potential conflicts between registered* routes while allowing for flexible and intuitive URL structuring. It prevents ambiguous routing scenarios while permitting rich, nested route structures.

> *file-based routes always supercede registered routing

## Behavior
When adding a new route, the system checks it against all existing routes to detect any conflicts. If a conflict is found, the system prevents the new route from being added and reports the conflict.

## Simplified Rules

1. **Exact Match Conflict**
   - Two identical routes always conflict.

2. **Static Part Precedence**
   - Static parts of a route take precedence over wildcard parts.
   - A route with a static part at any level does not conflict with a route having a wildcard at the same level.

3. **Wildcard Conflict**
   - Two routes conflict only if all their static parts match exactly and they have wildcards in the same positions.
   - Wildcards include `*` and parameter placeholders (e.g., `:id`).

4. **Longer Path Precedence**
   - A longer, more specific path takes precedence over a shorter path, even if the shorter path ends with a wildcard.

5. **Base Path Conflict**
   - A base path (`/`) only conflicts with another base path (`/`).

## Exhaustive Examples

1. `/users` vs `/users` 
   - **Result**: Conflict
   - **Rule Applied**: 1 (Exact match)

2. `/users` vs `/users/profile`
   - **Result**: No conflict
   - **Rule Applied**: 4 (Longer path precedence)

3. `/users/*` vs `/users/account`
   - **Result**: No conflict
   - **Rule Applied**: 2 (Static 'account' takes precedence)

4. `/users/:id` vs `/users/*`
   - **Result**: Conflict
   - **Rule Applied**: 3 (All static parts match, wildcards in same position)

5. `/users/:id/posts` vs `/users/*/comments`
   - **Result**: No conflict
   - **Rule Applied**: 2 (Static 'posts' and 'comments' differentiate)

6. `/users/profile` vs `/users/:id`
   - **Result**: No conflict
   - **Rule Applied**: 2 (Static 'profile' takes precedence)

7. `/users/*` vs `/users/*/settings`
   - **Result**: No conflict
   - **Rule Applied**: 4 (Longer path precedence)

8. `/users/:id/profile` vs `/users/*/settings`
   - **Result**: No conflict
   - **Rule Applied**: 2 (Static 'profile' and 'settings' differentiate)

9. `/` vs `/users`
   - **Result**: No conflict
   - **Rule Applied**: 4 (Longer path precedence)

10. `/users/:id` vs `/users/:name`
    - **Result**: Conflict
    - **Rule Applied**: 3 (All static parts match, wildcards in same position)

11. `/products/:category/*` vs `/products/:id`
    - **Result**: No conflict
    - **Rule Applied**: 4 (Longer path precedence)

12. `/blog/:year/:month` vs `/blog/:slug`
    - **Result**: No conflict
    - **Rule Applied**: 4 (Longer path precedence)

13. `/api/v1/*` vs `/api/v2/*`
    - **Result**: No conflict
    - **Rule Applied**: 2 (Static 'v1' and 'v2' differentiate)

14. `/search` vs `/search/:query`
    - **Result**: No conflict
    - **Rule Applied**: 2 (Static route takes precedence)

15. `/items/:id` vs `/items/new`
    - **Result**: No conflict
    - **Rule Applied**: 2 (Static 'new' takes precedence)

16. `/users/:id/posts/:postId` vs `/users/active/posts/*`
    - **Result**: No conflict
    - **Rule Applied**: 2 (Static 'active' differentiates from `:id`)

17. `/products/:category/:id` vs `/products/featured/:id`
    - **Result**: No conflict
    - **Rule Applied**: 2 (Static 'featured' takes precedence over `:category`)

18. `/articles/*` vs `/articles/:id/edit`
    - **Result**: No conflict
    - **Rule Applied**: 4 (Longer path precedence)

19. `/users/*` vs `/users/:id/profile`
    - **Result**: No conflict
    - **Rule Applied**: 4 (Longer path precedence)

20. `/api/v1/:resource/*` vs `/api/v1/:resource/:id`
    - **Result**: No conflict
    - **Rule Applied**: 4 (Longer path precedence)

21. `/` vs `/`
    - **Result**: Conflict
    - **Rule Applied**: 5 (Base path conflict)