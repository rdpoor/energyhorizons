//MARK: Socket Handler
Doh.Module('socket_handler', [
  'express_router_as_library',
  'user_host?? user_host',
  'import cookie from "cookie"',
], function (io, Router, Users, cookie) {

  // Maintain compatibility with old global objects
  window.current_users = {};

  // Modern socket and session tracking
  const _sockets = new Map();
  // --- Make _sockets accessible via Router --- 
  Router._socket_sessions = _sockets;
  // -------------------------------------------

  // Legacy compatibility wrapper functions
  window.userFromSocket = function (socket) {
    const socketData = _sockets.get(socket.id);
    if (!socketData) return null;
    return socketData.user;
  };

  window.userFromName = function (username) {
    // Search through sockets for user with this username
    for (const [_, data] of _sockets) {
      if (data.user?.username === username) {
        return data.user;
      }
    }
    return null;
  };

  // Wrap the old function to work with new system
  window.NewUserOnConnect = function (username, socket) {
    const socketData = _sockets.get(socket.id);
    if (!socketData?.user) {
      console.warn('Attempted legacy user creation - authentication required');
      return null;
    }
    return socketData.user;
  };

  io.on('connection', async (socket) => {
    // console.log('New socket connection:', socket.id);

    socket.binaryType = 'arraybuffer';
    socket.isSocket = true;

    // Parse cookies from handshake headers
    let cookies = {};
    if (socket.handshake.headers.cookie && cookie) {
      try {
        cookies = cookie.parse(socket.handshake.headers.cookie);
      } catch (e) {
        console.error('Error parsing socket handshake cookie:', e);
      }
    }

    // Track socket
    _sockets.set(socket.id, {
      socket,
      connected: Date.now(),
      lastActive: Date.now(),
      metadata: {
        address: socket.handshake?.address,
        port: socket.conn?.id,
        headers: socket.handshake.headers,
        cookies: cookies
      },
      user: null,
      deviceId: null
    });

    // Authenticate using JWT (from handshake auth or cookie)
    const token = socket.handshake.auth.token || cookies.accessToken;
    let authenticated = false;

    if (token && NotEmptyObject(Users)) {
      try {
        // Use Users.validateAuthToken for consistent validation logic
        // Note: We pass a simplified object mimicking req for validation purposes only
        const validationReq = { 
            isSocket: true, // Mark as socket context for validation
            handshake: socket.handshake, 
            cookies: cookies 
        }; 
        const validationResult = await Users.validateAuthToken(validationReq, null); 
        
        if (validationResult.success && validationResult.user) {
          const socketData = _sockets.get(socket.id);
          // Successfully authenticated, store user and deviceId
          socketData.user = validationResult.user; 
          socketData.socket.user = validationResult.user;
          socketData.deviceId = validationResult.user.currentDeviceId; 
          authenticated = true;

          // Update device activity (using the validated user)
          const user = validationResult.user;
          if (user.devices?.[socketData.deviceId]) {
            user.devices[socketData.deviceId].lastActive = Date.now();
            // Use a try-catch here as it's less critical than initial auth
            try { 
                await Users.updateUser(user.username, { devices: user.devices });
            } catch (updateErr) {
                console.error(`Error updating device activity for ${user.username}:`, updateErr);
            }
          }
          
          // Permissions already loaded by validateAuthToken via loadUserPermissionGroups

          // Update legacy current_users object
          window.current_users[user.username] = {
            user_name: user.username,
            socket_id: socket.id,
            last_seen: new Date().toISOString(),
            ip_address: socket.handshake?.address,
            port: socket.conn?.id
          };
          
          Users.auth_debug(`Socket ${socket.id} authenticated as user ${user.username}`);
        } else {
           // Authentication failed, BUT DO NOT DISCONNECT
           Users.auth_debug(`Socket ${socket.id} authentication failed or user invalid: ${validationResult.message}. Connection allowed anonymously.`);
           // socketData.user remains null
           // socket.disconnect(true); // REMOVED
           // return; // REMOVED
        }

      } catch (err) {
        // Error during token validation, BUT DO NOT DISCONNECT
        console.error(`Socket ${socket.id} authentication error:`, err.message);
        Users.auth_debug(`Socket ${socket.id} connection allowed anonymously after auth error.`);
        // socket.disconnect(true); // REMOVED
        // return; // REMOVED
      }
    } else {
       // No token provided, connection allowed anonymously
      //  Users.auth_debug(`No token found for socket ${socket.id}. Connection allowed anonymously.`);
    }

    // Handle all events
    socket.onAny(async (route, data, callback) => {
      const startTime = Date.now();
      const socketData = _sockets.get(socket.id);
      
      if (!socketData) {
         console.error(`Received event for disconnected/unknown socket: ${socket.id}`);
         return callback?.({error: 'Unknown socket session', status: 500 });
      }

      try {
        // Update activity timestamp
        socketData.lastActive = Date.now();

        // Handle LoadDohFrom path adjustments
        if (data?.LoadDohFrom) {
          socket.remoteLoadDohFrom = data.LoadDohFrom;
        }
        route = Router.RemoveAppURIFromRoute(route, socket.remoteLoadDohFrom);

        // Normalize data object if necessary
        if (!data || typeof data !== 'object') {
          data = {};
        }

        // Check for auth tokens in request body (which is not recommended)
        if (data.token || data.accessToken || data.refreshToken) {
          console.warn(`WARNING: Authentication token found in socket request body for route '${route}'. This is insecure. Tokens should be sent via handshake auth, not in request body.`);
          // Optionally delete these tokens from the request body to enforce security
          delete data.token;
          delete data.accessToken;
          delete data.refreshToken;
        }

        // --- Create Mock Request (req) Object ---
        const mockReq = {
          isSocket: true,
          url: route,
          originalUrl: route,
          method: 'POST',
          ip: socketData.metadata.address,
          headers: { 
            ...socketData.metadata.headers,
            // Add auth header if socket is authenticated
            ...(socketData.user && { 'authorization': 'Bearer socket-authenticated' }),
          },
          cookies: { ...socketData.metadata.cookies },
          body: data,
          query: {},
          params: {},
          user: socketData.user ? { ...socketData.user } : null,
          remoteLoadDohFrom: socket.remoteLoadDohFrom,
          trackingId: Router.analyticsConfig.enabled ? (data.trackingId || data.parentTrackingId || Doh.NewUUID()) : null,
          timestamp: startTime,
          socketId: socket.id,
          socket: socket,
          
          // Add convenience methods to better match Express request object
          get: function(headerName) {
            return this.headers[headerName.toLowerCase()];
          },
          
          // Add cookie parser compatibility
          signedCookies: {}
        };
        
        // --- Create Mock Response (res) Object ---
        const mockRes = {
          isSocket: true,
          statusCode: 200,
          _headers: { 'Content-Type': 'application/json' },
          _body: null,
          _callbackCalled: false,
          status: function(code) {
            this.statusCode = code;
            return this;
          },
          setHeader: function(name, value) {
            this._headers[name.toLowerCase()] = value;
            return this;
          },
          getHeader: function(name) {
            return this._headers[name.toLowerCase()];
          },
          json: function(jsonData) {
            this.setHeader('Content-Type', 'application/json');
            // For socket responses, just send the JSON data directly
            this.send(jsonData);
          },
          send: function(bodyData) {
            if (this._callbackCalled) return;
            this._callbackCalled = true;
            
            // For socket responses, return the data directly without additional wrapping
            // Include minimal metadata to handle special cases
            if (IsObject(bodyData) && bodyData.error) {
              // If there's an error property, include it at the top level
              callback?.({
                error: bodyData.error,
                status: this.statusCode,
                data: bodyData
              });
            } else {
              // For normal responses, just return the actual data
              // allowing the client to process it without unwrapping
              callback?.(bodyData);
            }
          },
          end: function(bodyData) {
            if (bodyData) {
              this.send(bodyData);
            } else if (!this._callbackCalled) {
              this.send(this._body);
            }
          },
        };

        mockRes.trackingId = mockReq.trackingId;

        // Call Router.FollowRoute and store result - critical for fallthrough behavior
        const routeResult = await Router.FollowRoute(route, mockReq, mockRes, callback);
        
        // If route was NOT handled by Router (routeResult is false) and callback was NOT called
        // by the Router or static file handler, then we allow fallthrough to other socket handlers
        // by not marking the callback as handled
        if (routeResult === false && !mockRes._callbackCalled) {
          // Do not call callback here - allow fallthrough to other socket handlers
          // Silent fallthrough - no logging needed
        }

      } catch (error) {
        console.error(`Socket event error on route '${route}':`, error);
        if (callback && !mockRes?._callbackCalled) {
            callback({ error: 'Internal server error', status: 500 });
        }
      }
    });

    socket.on('error', (error) => {
      console.error('Socket error:', socket.id, error);
    });

    socket.on('disconnect', async () => {
      const socketData = _sockets.get(socket.id);
      if (socketData?.user) {
        // Update device last active time
        const user = Users.getUserByUsername(socketData.user.username);
        if (user?.devices?.[socketData.deviceId]) {
          user.devices[socketData.deviceId].lastActive = Date.now();
          await Users.updateUser(user.username, { devices: user.devices });
        }

        // Clean up legacy current_users
        delete window.current_users[socketData.user.username];
      }

      _sockets.delete(socket.id);
      // Users.auth_debug(`Socket disconnected: ${socket.id}`);
    });
  });

  // Handle the socket_init route - This might still be useful for client handshake
  Router.AddRoute('/socket_init', [], async function (data, req, res, callback) {
    Router.SendJSON(res, { status: 'connected', message: 'Socket session initialized' }, callback);
  });
});
