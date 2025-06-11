Doh.Module('ajax', [
  //'browser?? socket-io-client',
  'browser?? socketio_client',
], function ($, io) {

  let ajax_spinner = false;

  Doh.setTokens = function (accessToken, refreshToken) {
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', refreshToken);
    
    // Also update the old token system for backward compatibility
    if (accessToken) {
      Doh.token = accessToken;
      localStorage.setItem('authToken', accessToken);
    }
    
    // Update socket authentication if available
    if (Doh.socket && Doh.socketAuth && typeof Doh.socketAuth.ensureSocketHasToken === 'function') {
      Doh.socketAuth.ensureSocketHasToken();
    }
  };

  Doh.getAccessToken = function () {
    return localStorage.getItem('accessToken');
  };

  Doh.getRefreshToken = function () {
    return localStorage.getItem('refreshToken');
  };

  Doh.clearTokens = function () {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    // Clear the accessToken cookie by setting its expiration to the past
    document.cookie = 'accessToken=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Strict; Secure;';
    
    // Also clear old token system
    Doh.token = null;
    localStorage.removeItem('authToken');
    
    // Clear socket authentication if available
    if (Doh.socketAuth && typeof Doh.socketAuth.clearSocketAuth === 'function') {
      Doh.socketAuth.clearSocketAuth();
    }
  };

  Doh.meld_objects(Doh, {
    hasSocket: Doh.hasSocket || false,
    token: null,

    // Update the old token system to work with the new one
    setToken: function (token) {
      Doh.token = token;
      localStorage.setItem('authToken', token);
      
      // Also update the new token system
      if (token) {
        localStorage.setItem('accessToken', token);
      }
      
      // Update socket authentication
      if (Doh.socket && Doh.socketAuth && typeof Doh.socketAuth.ensureSocketHasToken === 'function') {
        Doh.socketAuth.ensureSocketHasToken();
      }
    },

    getToken: function () {
      // First check the new system
      const accessToken = localStorage.getItem('accessToken');
      if (accessToken) {
        Doh.token = accessToken; // Keep token in memory in sync
        return accessToken;
      }
      
      // Fall back to old system
      if (!Doh.token) {
        Doh.token = localStorage.getItem('authToken');
      }
      return Doh.token;
    },

    clearToken: function () {
      Doh.token = null;
      localStorage.removeItem('authToken');
      
      // Also clear the new token system
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      
      // Clear the accessToken cookie
      document.cookie = 'accessToken=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Strict; Secure;';
      
      // Clear socket authentication
      if (Doh.socketAuth && typeof Doh.socketAuth.clearSocketAuth === 'function') {
        Doh.socketAuth.clearSocketAuth();
      }
    },

    /**
     *  @brief Make an ajax call and potentially do something with it
     *  
     *  @param [in] args                    Object containing arguments for the ajax call
     *  @param [in] args.spinner            Default: ajax_spinner.selector
     *  @param [in] args.spinner_timeout    Default: ajax_spinner.timeout
     *  @param [in] args.spinner_timetolive Default: ajax_spinner.timetolive
     *  @param [in] args.container          (optional) Build response into container
     *  @param [in] args.replacer           (optional} replace this with response, requires
     *                                                 container and forces args.append to false
     *  @param [in] args.response_key       (optional) Use parse_reference('this.name.other.name')
     *                                                 to get a deep reference into response
     *  @param [in] args.append             Default: false, use true to append instead of replacing
     *  @param [in] args.status             (optional) A string to set as the status bar text
     *  @param [in] args.jq_ajax = {        The object to pass into the jQuery.ajax method,
     *    url: 'someurl'                    must contain url property. Defaults 'type' to 'GET' and 
     *  }                                   'dataType' to 'json' unless overridden.
     *  @return None
     */

    ajax: function (args) {
      // set a completion flag for the spinner timeout
      var completed = false;

      // check for a spinner
      var spinner = false;
      if (args.spinner !== false) {
        if (args.spinner || ajax_spinner) spinner = $(args.spinner || ajax_spinner.selector);
      }
      // check for a container
      var container = false;
      if (args.container) {
        // make sure the container is a dobj
        container = Doh.get_dobj(args.container);
      }
      // check for an object to replace
      var replacer = false;
      if (args.replacer) {
        // make sure the replacer is a dobj
        replacer = Doh.get_dobj(args.replacer);
      }

      // save the success callback since we need to use it for our own methods
      var success_callback = args.jq_ajax.success;

      // setup a callback for completion
      var callback_wrapper = function (e, status, settings) {
        var data;
        if (!status) {
          data = e;
          settings = settings || {};
          settings.responseJSON = data;
        } else {
          data = settings.responseJSON;
        }
        // if a container was specified, then we want the response built into the container
        if (container) {
          //if(!e.error){
          // the response_key is a '.' delimited deep reference into the responseJSON
          console.log('callback_wrapper with container data:', data);

          var new_dobj = args.response_key ? Doh.parse_reference(data, args.response_key) : data;
          // if append is false or missing, clear the container
          if (!args.append && !replacer) {
            container.e.empty();
            container.children = {};
          }
          var name = (args.response_key ? Doh.parse_reference(true, args.response_key) : Doh.new_id());
          new_dobj.parent = container;
          //TODO: children is now an array, so we need to rewrite this:
          container.children[name] = New(new_dobj);
          if (replacer) {
            container.children[name].e.insertAfter(replacer.e);
            replacer.e.remove();
            replacer = null;
            //delete replacer;
          }
        }
        if (success_callback) success_callback(e, status, settings, args);
        completed = true;
        if (spinner) spinner.hide();
      };

      // default the ajax settings
      args.jq_ajax.type = args.jq_ajax.type || 'GET';

      var jq_ajax = Doh.meld_objects({}, args.jq_ajax);
      //jq_ajax.url = DohPath(args.jq_ajax.url);
      //jq_ajax.url = args.jq_ajax.url;


      // optionally set the status and wrap the callback to remove it when done
      if (args.status) {
        Doh.setStatus(args.status);
        jq_ajax.success = Doh.statusWrap.bind(args.container || callback_wrapper);
      }
      else jq_ajax.success = callback_wrapper

      args.jq_ajax = jq_ajax;

      // do the ajax
      Doh.ajaxPromise(jq_ajax.url, null, args);

      // if it takes longer than half a second to complete, show the spinner
      if (spinner) window.setTimeout(function () {
        if (!completed) {
          if (spinner) spinner.show();
          window.setTimeout(function () {
            if (!completed) {
              if (confirm('Something has gone wrong.\n\nClick "Ok" to reload the page.\nClick "Cancel" to return.')) {
                window.location.reload(false);
              } else {
                spinner.hide();
              }
            }
          }, args.spinner_timetolive || ajax_spinner.timetolive || 60000);
        }
      }, args.spinner_timeout || ajax_spinner.timeout || 500);
    },

    ajaxPromise: function (url, data = null, args = null) {
      let fetchOptions = {
        method: 'GET', // Default method
        headers: {}
      };

      // Handle backward compatibility with jq_ajax
      let successCallback = null;
      let errorCallback = null;

      const invalid_urls = ['/false', '/true', '/null', '/undefined'];
      // remove the LoadDohFrom from the url
      const url_fragment = url.replace(LoadDohFrom, '');

      if (NotString(url) || invalid_urls.some(invalid => url_fragment.endsWith(invalid))) {
        throw console.error('Invalid URL in ajaxPromise()', url);
      }

      // If the first argument is an object, it could be the new format or the old jq_ajax
      if (IsObjectObjectAndNotEmpty(args)) {
        if (args.jq_ajax) { // Old jq_ajax object
          fetchOptions.method = args.jq_ajax.type || fetchOptions.method;
          if (args.jq_ajax.data) fetchOptions.body = args.jq_ajax.data;
          if (args.jq_ajax.headers) fetchOptions.headers = Doh.meld_objects(fetchOptions.headers || {}, args.jq_ajax.headers);

          successCallback = args.jq_ajax.success;
          errorCallback = args.jq_ajax.fail;
        }
        Object.assign(fetchOptions, args);
      }
      if (HasValue(data)) fetchOptions.body = data;

      // Add authentication token to headers
      const token = Doh.getAccessToken();
      if (token) {
        fetchOptions.headers['Authorization'] = `Bearer ${token}`;
      }

      // Add tracking ID to headers if we have one
      if (Doh.currentTrackingId) {
        fetchOptions.headers['X-Parent-Tracking-ID'] = Doh.currentTrackingId;
      }

      // Updated normalization function to decode static file responses if the socket branch returns one.
      let normalizeResponse = function (response, isSocketResponse = false) {
        if (isSocketResponse) {
          // Socket now sends direct data, not wrapped responses
          // Just ensure we have a consistent normalized format
          
          // Special case for base64 encoded responses (static files)
          if (typeof response === 'object' && response !== null && response.isBase64Encoded) {
            let data;
            if (response.isBase64Encoded && response.body) {
              try {
                // Decode base64 content (using atob in browser or Buffer in Node)
                data = typeof atob === 'function'
                  ? atob(response.body)
                  : Buffer.from(response.body, 'base64').toString('utf-8');

                // If content type is JSON, attempt to parse it
                const contentType = response.headers && (response.headers["Content-Type"] || response.headers["content-type"]);
                if (contentType && contentType.indexOf('application/json') !== -1) {
                  try {
                    data = JSON.parse(data);
                  } catch (ex) {
                    // leave data as string if JSON parsing fails
                  }
                }
              } catch (error) {
                console.error("Error decoding base64 static file response:", error);
                data = response.body;
              }
            } else {
              data = response.body;
            }
            return {
              status: response.status || 200,
              statusText: response.statusText || 'OK',
              data: data,
              headers: response.headers || {}
            };
          } 
          let parsed;
          try {
            parsed = JSON.parse(response);
          } catch (e) {
            parsed = response;
          }
          // Regular data responses - just use the data directly
          return { 
            status: response?.status || 200, 
            statusText: 'OK', 
            data: parsed, 
            headers: response?.headers || {} 
          };
        } else {
          // HTTP response - standard processing
          const contentType = response.headers.get('content-type');
          if (contentType && contentType.includes('application/json')) {
            return response.json().then(data => ({
              status: response.status,
              statusText: response.statusText,
              data: data,
              headers: response.headers // This is a Headers object; convert to plain object if needed
            })).catch(() => ({
              status: response.status,
              statusText: response.statusText,
              data: null, // In case of failure to parse JSON
              headers: response.headers
            }));
          } else {
            return response.text().then(data => ({
              status: response.status,
              statusText: response.statusText,
              data: data,
              headers: response.headers
            }));
          }
        }
      };

      return new Promise((resolve, reject) => {
        if (!Doh.hasSocket || fetchOptions.ignoreSocket) {
          if (IsObjectObject(fetchOptions.body)) {
            fetchOptions.method = 'POST';
            if (NotEmptyObject(fetchOptions.body)) {
              fetchOptions.headers['Content-Type'] = 'application/json';
              fetchOptions.body = JSON.stringify(fetchOptions.body);
            }
          }

          // Add existing tracking ID to request headers
          if (Doh.currentTrackingId) {
            fetchOptions.headers['X-Tracking-ID'] = Doh.currentTrackingId;
          }

          // add LoadDohFrom to the url
          url = LoadDohFrom + (url_fragment.startsWith('/') ? url_fragment : '/' + url_fragment);

          fetch(url, fetchOptions).then(response => {
            // Only update tracking ID if we don't already have one
            if (!Doh.currentTrackingId) {
              const trackingId = response.headers.get('X-Tracking-ID');
              if (trackingId) {
                Doh.currentTrackingId = trackingId;
              }
            }
            
            if (response.status === 401 || response.status === 403) {
              // CRITICAL FIX: Better handling of authentication failures
              console.log('Authentication failed (401/403), attempting token refresh');
              
              // Check if we have a refresh token before attempting refresh
              const refreshToken = Doh.getRefreshToken();
              if (!refreshToken) {
                console.log('No refresh token available, clearing tokens and forcing relogin');
                Doh.clearTokens();
                // Trigger browser-side logout if user object exists
                if (Doh.user && typeof Doh.user.forceRelogin === 'function') {
                  Doh.user.forceRelogin();
                }
                throw new Error('Authentication required - no refresh token');
              }
              
              // Token might be expired, try to refresh
              return Doh.refreshToken().then(newToken => {
                if (newToken) {
                  // Update token in fetchOptions and retry
                  fetchOptions.headers['Authorization'] = `Bearer ${newToken}`;
                  console.log('Token refreshed, retrying fetch');
                  return fetch(url, fetchOptions);
                } else {
                  console.log('Token refresh failed, clearing tokens and forcing relogin');
                  Doh.clearTokens();
                  // Trigger browser-side logout if user object exists
                  if (Doh.user && typeof Doh.user.forceRelogin === 'function') {
                    Doh.user.forceRelogin();
                  }
                  throw new Error('Unable to refresh token');
                }
              });
            }
            return response;
          }).then(response => {
            return normalizeResponse(response);
          }).then(normalizedResponse => {
            if (successCallback) successCallback(normalizedResponse.data);
            resolve(normalizedResponse);
          }).catch(error => {
            if (errorCallback) errorCallback(error);
            reject(error);
          });
        } else {
          // For socket connections, ensure socket has proper auth
          if (token) {
            Doh.socketAuth.ensureSocketHasToken();
          }
          
          // Create a clean payload WITHOUT authentication tokens
          // Only include the original request data and tracking ID
          const payload = {
            ...(fetchOptions.body || {}),
            parentTrackingId: Doh.currentTrackingId
            // No tokens here - authentication happens at socket connection level
          };
          
          // Remove any potential token/auth data that might have been in the payload
          if (payload.token) delete payload.token;
          if (payload.accessToken) delete payload.accessToken;
          if (payload.refreshToken) delete payload.refreshToken;
          
          Doh.socket.emitWithAck(url, payload).then(response => {
            // Handle logout signal from server via socket
            if (IsObject(response) && response.clearCookie === true) {
              console.log('Received clearCookie signal via socket, clearing tokens and reloading.');
              Doh.clearTokens(); 
              if (Doh.socket) {
                // Prevent the standard disconnect handler from trying to reconnect automatically
                Doh.socket.io.opts.reconnection = false; 
                Doh.socket.disconnect(); 
              }
              Doh.socket = null;
              Doh.hasSocket = false;
              // If on the logout page, redirect to homepage after logout signal.
              // Otherwise, reload the current page to reflect the logged-out state.
              if (window.location.pathname === '/logout') {
                window.location.href = '/';
              } else {
                window.location.reload();
              }
              // Since the page might be reloading or redirecting, stop further execution.
              return;
            }

            // Update tracking ID from socket response if provided
            if (response?.trackingId) {
              Doh.currentTrackingId = response.trackingId;
            }
            
            // Socket responses now come through directly without being wrapped
            // No need to use normalizeResponse here anymore
            if (successCallback) successCallback(response);
            
            // Create a minimal normalized response format for consistency with HTTP responses
            const normalizedResponse = {
              status: response?.status || 200,
              data: response,
              // Include headers for API consistency, but they're not relevant for sockets
              headers: response?.headers || {}
            };
            
            resolve(normalizedResponse);
          }).catch(error => {
            if (errorCallback) errorCallback(error);
            // reject(error);
            console.log('ajaxPromise error:', error);
            resolve(error);
          });
        }
      });
    },
    refreshToken: async function () {
      try {
        const response = await fetch('/api/refresh-token', {
          headers: {
            'Content-Type': 'application/json'
          },
          method: 'POST',
          body: JSON.stringify({ refreshToken: Doh.getRefreshToken() }),
        });
        const data = await response.json();
        const { accessToken, refreshToken } = data;
        if (data.success && accessToken && refreshToken) {
          Doh.setTokens(accessToken, refreshToken);
          return accessToken;
        }
      } catch (error) {
        console.error('Error refreshing token:', error);
      }
      return null;
    },
    /**
     * creates iframe and form in it with hidden field,
     * then submit form with provided data
     * url - form url
     * data - data to form field
     * input_name - form hidden input name
     */
    ajax_download: function (url, data, input_name) {
      var $iframe,
        iframe_doc,
        iframe_html;

      input_name = input_name || 'data';

      if (($iframe = $('#download_iframe')).length === 0) {
        $iframe = $("<iframe id='download_iframe'" +
          " style='display: none' src='about:blank'></iframe>"
        ).appendTo("body");
      }

      iframe_doc = $iframe[0].contentWindow || $iframe[0].contentDocument;
      if (iframe_doc.document) {
        iframe_doc = iframe_doc.document;
      }

      iframe_html = "<html><head></head><body><form method='POST' action='" +
        url + "'>" +
        "<input type=hidden name='" + input_name + "' value='" +
        JSON.stringify(data) + "'/></form>" +
        "</body></html>";
      //console.log(iframe_html);
      iframe_doc.open();
      iframe_doc.write(iframe_html);
      $(iframe_doc).find('form').submit();
      var msg = '';
      var success_callback = function () {
        //console.log('ajax_download success callback');
        try {
          $iframe = $('#download_iframe');
          iframe_doc = $iframe[0].contentWindow || $iframe[0].contentDocument;
          if (iframe_doc.document) {
            iframe_doc = iframe_doc.document;
          }
          msg = JSON.parse($(iframe_doc).find('body').html()).msg;
          if (msg != 'success') {
            alert(msg);
          }
        } catch (err) {
        }

        if (msg == '') {
          //console.log('ajax_download success callback msg is blank');
          window.setTimeout(success_callback, 2000);
        }

      }
      window.setTimeout(success_callback, 2000);
    },
    // Add tracking ID storage
    currentTrackingId: null,
  });

  Pattern('ajax_helper', {
    //meld_objects:['ajaxOptions','jq_ajax'],

    moc: {
      ajaxOptions: 'object',
      jq_ajax: 'object',
    },

    ajaxOptions: {},
    jq_ajax: {},
    ajax: function (url, data, options) {
      options = options || {};
      data = data || {};
      var newOptions = Doh.meld_objects({}, this.ajaxOptions, options);
      options.jq_ajax = options.jq_ajax || {};
      newOptions.jq_ajax = Doh.meld_objects({}, this.jq_ajax, options.jq_ajax, { url: url, data: data });
      Doh.ajax(newOptions);
    },
  });

  Pattern('ajax_post_helper', 'ajax_helper', {
    jq_ajax: {
      url: '',
      type: 'POST',
      contentType: 'application/json',
      data: {}
    },
  });

  Doh.emit = function (url, data, callback) {
    Doh.ajax({
      jq_ajax: {
        url: url,
        data: data, // Removed token from payload
        success: callback,
        error: function (xhr, status, error) {
          console.error('Doh.emit error:', error);
        }
      }
    });
  };

  // Initialize callback arrays if they don't exist
  Doh.socketCallbacks = Doh.socketCallbacks || {
    disconnect: [],
    error: [],
    connectOrReconnect: []
  };
  
  Doh.upgradeConnection = function (
    onDisconnect = function () { console.log('Doh.socket got disconnect.'); },
    onError = function () { console.log('Doh.socket got error.'); },
    onConnectOrReconnect = function () {
      console.log('Doh.socket got connect or reconnect.');
  }) {
    // Add the callbacks to their respective arrays
    Doh.socketCallbacks.disconnect.push(onDisconnect);
    Doh.socketCallbacks.error.push(onError);
    Doh.socketCallbacks.connectOrReconnect.push(onConnectOrReconnect);
    
    const setup_socket = async () => {
      if (!Doh.socket) {
        if (typeof io == 'undefined') {
          console.warn('io undefined in Doh.upgradeConnection');
          return;
        }

        if (LoadDohFrom) {
          let sock_path = LoadDohFrom;
          // if (LoadDohFrom.indexOf('http') >= 0) {
            Doh.socket = Doh.socket || io(sock_path, {
              'sync disconnect on unload': true,
              auth: { token: Doh.getAccessToken() }
            });
          // } else
          //   Doh.socket = Doh.socket || io(window.location.host, {
          //     path: sock_path + "/socket.io",
          //     'sync disconnect on unload': true,
          //     auth: { token: Doh.getAccessToken() }
          //   });
        } else {
          Doh.socket = Doh.socket || io({
            auth: { token: Doh.getAccessToken() }
          });
        }

        // Handle disconnect with token refresh attempt
        Doh.socket.on('disconnect', async (reason) => {
          console.log('Socket disconnected:', reason);
          Doh.hasSocket = false;
          Doh.socket = null;
          if (reason === 'io server disconnect') {
            // Server disconnected us, likely due to invalid token
            try {
              const newToken = await Doh.refreshToken();
              if (newToken) {
                // store the new token
                Doh.setTokens(newToken, Doh.getRefreshToken());
                // Reconnect with new token
                // set a timeout to reconnect
                setTimeout(() => {
                  window.location.reload();
                }, 10);
              } else {
                console.log('Token refresh failed, socket will remain disconnected');
              }
            } catch (error) {
              console.log('Error during token refresh:', error);
            }
          }
          
          // Execute all disconnect callbacks
          Doh.socketCallbacks.disconnect.forEach(callback => {
            try {
              callback(reason);
            } catch (err) {
              console.error('Error in socket disconnect callback:', err);
            }
          });
        });

        Doh.hasSocket = true;
        
        // If socket exists, setup the event handlers
        if (Doh.socket) {
          // Setup the socket event handlers to execute all callbacks of each type
          Doh.socket.on('error', (err) => {
            Doh.socketCallbacks.error.forEach(callback => {
              try {
                callback(err);
              } catch (callbackErr) {
                console.error('Error in socket error callback:', callbackErr);
              }
            });
          });
          
          Doh.socket.on('connect', setup_socket);
          
          Doh.socket.on('reconnect', () => {
            Doh.socketCallbacks.connectOrReconnect.forEach(callback => {
              try {
                callback();
              } catch (err) {
                console.error('Error in socket reconnect callback:', err);
              }
            });
          });
          
          Doh.socket.emit('/socket_init', { LoadDohFrom });
        }
        
        // Execute all connect/reconnect callbacks
        Doh.socketCallbacks.connectOrReconnect.forEach(callback => {
          try {
            callback();
          } catch (err) {
            console.error('Error in socket connect/reconnect callback:', err);
          }
        });
      }
    }

    setup_socket();
    
    // Return a remover function that removes the callbacks from their arrays
    return function removeConnectionHandlers() {
      Doh.socketCallbacks.disconnect = Doh.socketCallbacks.disconnect.filter(cb => cb !== onDisconnect);
      Doh.socketCallbacks.error = Doh.socketCallbacks.error.filter(cb => cb !== onError);
      Doh.socketCallbacks.connectOrReconnect = Doh.socketCallbacks.connectOrReconnect.filter(cb => cb !== onConnectOrReconnect);
      
      return {
        disconnectRemoved: onDisconnect,
        errorRemoved: onError,
        connectOrReconnectRemoved: onConnectOrReconnect
      };
    };
  }

  // Add socket authentication utilities
  Doh.socketAuth = {
    ensureSocketHasToken: function() {
      if (!Doh.socket) return false;
      
      // Make sure the socket has the current token in its auth
      const currentToken = Doh.getAccessToken();
      if (!currentToken) return false;
      
      if (!Doh.socket.auth || Doh.socket.auth.token !== currentToken) {
        console.log('Updating socket authentication token');
        Doh.socket.auth = { token: currentToken };
        // If socket is connected, we need to reconnect for auth to take effect
        if (Doh.socket.connected) {
          console.log('Reconnecting socket to apply new auth token');
          Doh.socket.disconnect().connect();
        }
      }
      
      return true;
    },
    
    clearSocketAuth: function() {
      if (!Doh.socket) return;
      
      Doh.socket.auth = {};
      // We typically don't need to reconnect when clearing auth,
      // as the server will detect missing auth on next request
    }
  };

  // We've integrated the token update logic directly into setTokens and setToken methods
  // No need for mimic call here

});