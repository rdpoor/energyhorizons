![Ajax](^/ajax.png?size=small)

The Doh Ajax system helps you make HTTP and WebSocket requests in a consistent way. It handles common tasks like authentication, content negotiation, and request tracking automatically.

This guide covers:
* Making basic HTTP requests with ajaxPromise
* Working with WebSocket connections
* Managing authentication and tokens
* Handling different types of content and responses
* Tracking requests for debugging
* Best practices for error handling and performance

## ajaxPromise Function

The core of the Ajax system is the `ajaxPromise` function, which provides a modern Promise-based approach with built-in support for authentication tokens and transparent protocol switching.

### Basic Syntax

```javascript
Doh.ajaxPromise(url, data = null, options = null)
```

### Parameters

1. `url` (String): The endpoint URL to send the request to
   - Must be a valid string
   - Cannot end with '/false', '/true', '/null', or '/undefined'
   - LoadDohFrom prefix is automatically handled

2. `data` (Optional, Any): The data to send with the request
   - If an object is provided, automatically:
     - Sets method to 'POST'
     - Adds Content-Type: application/json header
     - JSON stringifies the data

3. `options` (Optional, Object): Configuration options
   - `method`: HTTP method ('GET' by default)
   - `headers`: Custom headers object
   - `ignoreSocket`: Forces HTTP even if Socket.IO is available
   - `body`: Request body (alternative to data parameter)

### Response Format

The promise resolves with a normalized response object:

```javascript
{
  status: 200,          // HTTP status code
  statusText: 'OK',     // Status message
  data: {...},          // Response data (parsed JSON or text)
  headers: {...}        // Response headers
}
```

## Features

### Protocol Selection

The system automatically chooses the most efficient protocol:

- Uses Socket.IO when available (faster, persistent connection)
- Falls back to HTTP when Socket.IO isn't available
- Forces HTTP when `ignoreSocket: true` is specified
- Maintains consistent response format across protocols

### Authentication

Built-in JWT token management:

- Automatically adds authentication tokens from localStorage
- Handles token refreshing for 401/403 responses
- Retries failed requests with new tokens
- Works seamlessly across both HTTP and Socket.IO

### Request Tracking

Advanced tracking capabilities:

- Automatically generates and manages tracking IDs
- Preserves parent-child relationships between requests
- Passes tracking IDs in headers for HTTP requests
- Includes tracking IDs in socket payloads
- Enables end-to-end request tracing and debugging

### Content Processing

Sophisticated content handling:

- Automatically detects and parses JSON responses
- Handles base64-encoded binary data
- Supports multipart form data submissions
- Processes file uploads correctly
- Handles streaming responses when appropriate

## WebSocket Integration

The system seamlessly integrates with Socket.IO in two ways:

1. Through the automatic protocol selection in `ajaxPromise` (described above)
2. Through direct socket access using `Doh.emit`

### Using ajaxPromise with WebSockets

```javascript
// Establish socket connection
Doh.upgradeConnection(
  () => console.log('Disconnected'),  // onDisconnect handler
  () => console.log('Error'),         // onError handler
  () => console.log('Connected')      // onConnect/Reconnect handler
);

// Make requests - will automatically use socket when available
Doh.ajaxPromise('/api/data')
  .then(response => {
    console.log(response.data);
  });
```

### Direct Socket Access with Doh.emit

For cases where you need more direct access to the socket connection but still want the token handling, you can use `Doh.emit`:

```javascript
// Basic emit with callback
Doh.emit('/api/event', { 
  data: 'some data' 
}, (response) => {
  console.log('Event response:', response);
});

// The authentication token is automatically included in the payload
// The above is equivalent to:
Doh.socket.emit('/api/event', { 
  data: 'some data',
  token: Doh.getAccessToken()
}, (response) => {
  console.log('Event response:', response);
});
```

Key features of `Doh.emit`:
- Automatically includes authentication token in payload
- Provides direct access to socket.io's emit functionality
- Maintains consistent error handling with the rest of the system
- Works seamlessly with the socket connection management system

Use `Doh.emit` when you need:
- Direct socket communication without HTTP fallback
- Real-time event handling
- Lower latency for frequent small messages
- Direct access to socket.io features

Use `ajaxPromise` when you want:
- Automatic protocol selection
- Consistent response format
- HTTP fallback capability
- Standardized error handling

## Analytics Integration

The Ajax system integrates with the Doh analytics tracking system:

```javascript
// Track client-side events
function trackUserAction(actionType, metadata) {
  return Doh.ajaxPromise('/api/analytics/event', {
    type: actionType,
    metadata,
    timestamp: Date.now()
  });
}

// Track page navigation
function trackPageView(path) {
  return Doh.ajaxPromise('/api/analytics/route', {
    path,
    referrer: document.referrer,
    timestamp: Date.now()
  });
}

// Track performance metrics
function trackPerformance(metrics) {
  return Doh.ajaxPromise('/api/analytics/performance', {
    ...metrics,
    timestamp: Date.now()
  });
}
```

## Examples

### Basic GET Request

```javascript
// Simple data retrieval
Doh.ajaxPromise('/api/users')
  .then(response => {
    if (response.status === 200) {
      displayUsers(response.data);
    }
  })
  .catch(error => {
    console.error('Request failed:', error);
  });
```

### POST Request with Data

```javascript
// Create a new resource
Doh.ajaxPromise('/api/posts', {
  title: 'New Post',
  content: 'Post content here',
  tags: ['doh', 'tutorial']
})
  .then(response => {
    if (response.status === 201) {
      showNotification('Post created successfully');
    }
  });
```

### File Upload with Multipart Form Data

```javascript
// Get file input element
const fileInput = document.getElementById('fileInput');
const file = fileInput.files[0];

// Create FormData object
const formData = new FormData();
formData.append('file', file);
formData.append('description', 'Uploaded document');

// Send multipart request
Doh.ajaxPromise('/api/upload', formData, {
  headers: {
    // Content-Type is automatically set by the browser
  },
  ignoreSocket: true  // Better to use HTTP for file uploads
})
  .then(response => {
    if (response.status === 200) {
      showSuccess('File uploaded successfully');
    }
  });
```

### Static File Request

```javascript
// Request a static file - automatically handles base64 encoding/decoding
Doh.ajaxPromise('/assets/document.pdf')
  .then(response => {
    if (response.status === 200) {
      // For HTTP, the response is direct
      // For socket responses with base64 encoding, decoding is automatic
      displayDocument(response.data);
    }
  });
```

### Using with Async/Await

```javascript
async function fetchUserProfile() {
  try {
    const response = await Doh.ajaxPromise('/api/profile');
    
    if (response.status !== 200) {
      throw new Error(`Failed to fetch profile: ${response.statusText}`);
    }
    
    return response.data;
  } catch (error) {
    console.error('Profile fetch error:', error);
    throw error;
  }
}
```

### Parallel Requests

```javascript
// Fetch multiple resources simultaneously
Promise.all([
  Doh.ajaxPromise('/api/users'),
  Doh.ajaxPromise('/api/posts'),
  Doh.ajaxPromise('/api/comments')
])
  .then(([users, posts, comments]) => {
    // All data available at once
    initializeApplication(users.data, posts.data, comments.data);
  })
  .catch(error => {
    console.error('One or more requests failed:', error);
  });
```

## Authentication Workflow

### Login and Token Storage

```javascript
async function login(username, password) {
  try {
    const response = await Doh.ajaxPromise('/api/auth/login', {
      username,
      password
    });
    
    if (response.status === 200 && response.data.accessToken) {
      // Store tokens for future requests
      Doh.setTokens(response.data.accessToken, response.data.refreshToken);
      return true;
    }
    return false;
  } catch (error) {
    console.error('Login failed:', error);
    return false;
  }
}
```

### Token Refreshing

The system automatically handles token refreshing:

1. When a request receives a 401/403 response
2. The system attempts to refresh the token using `Doh.refreshToken()`
3. If successful, the original request is retried with the new token
4. If unsuccessful, the promise is rejected with the authentication error

```javascript
// Token refresh happens automatically, but can be triggered manually:
async function ensureValidToken() {
  const currentToken = Doh.getAccessToken();
  if (!currentToken || isTokenExpired(currentToken)) {
    const newToken = await Doh.refreshToken();
    return !!newToken;
  }
  return true;
}
```

## Best Practices

### Error Handling

Always include thorough error handling:

```javascript
Doh.ajaxPromise('/api/data')
  .then(response => {
    if (response.status >= 200 && response.status < 300) {
      return processData(response.data);
    } else {
      throw new Error(`Request failed with status ${response.status}: ${response.statusText}`);
    }
  })
  .catch(error => {
    console.error('Error:', error);
    showErrorNotification(error.message);
  });
```

### Protocol Awareness

Be mindful of protocol differences:

```javascript
// Better over HTTP (large files, binary data)
Doh.ajaxPromise('/api/large-file', null, { ignoreSocket: true });

// Better over Socket.IO (frequent small requests, real-time data)
Doh.ajaxPromise('/api/real-time-updates');
```

### Tracking for Debugging

Use tracking IDs to correlate requests:

```javascript
// Get the current tracking ID
const trackingId = document.querySelector('meta[name="x-tracking-id"]')?.content;

// Include it in a related request
const requestOptions = {
  headers: {
    'X-Parent-Tracking-ID': trackingId
  }
};

// The response will include a new tracking ID that's linked to the parent
Doh.ajaxPromise('/api/related-data', null, requestOptions)
  .then(response => {
    // Both requests are now linked in tracking logs
    console.log('Response with linked tracking:', response.data);
  });
```

### Performance Optimization

Optimize for different scenarios:

```javascript
// For cached resources
Doh.ajaxPromise('/api/rarely-changing-data', null, {
  headers: {
    'Cache-Control': 'max-age=3600'
  }
});

// For frequent updates
Doh.upgradeConnection();  // Enable socket connection
setInterval(() => {
  Doh.ajaxPromise('/api/status-updates');  // Uses socket automatically
}, 5000);
```

### Integration with Analytics

Implement comprehensive tracking:

```javascript
// Track all navigation events
document.addEventListener('click', event => {
  const link = event.target.closest('a');
  if (link && link.href) {
    trackNavigation(link.pathname);
  }
});

// Track form submissions
document.querySelector('form').addEventListener('submit', event => {
  trackUserAction('form_submit', {
    formId: event.target.id,
    formAction: event.target.action
  });
});

// Track performance metrics
window.addEventListener('load', () => {
  const performance = window.performance;
  if (performance) {
    const perfData = {
      loadTime: performance.timing.loadEventEnd - performance.timing.navigationStart,
      domReadyTime: performance.timing.domComplete - performance.timing.domLoading,
      networkLatency: performance.timing.responseEnd - performance.timing.requestStart
    };
    trackPerformance(perfData);
  }
});
```