Doh.Module('html_differ', function() {
  Pattern('HtmlDiffer', 'object', {
    // ===============================================================
    // CORE UTILITIES - Common helpers used throughout the module
    // ===============================================================
    
    /**
     * Create a DOM representation from an HTML string
     */
    createDOMFromString: function(htmlString) {
      const parser = new DOMParser();
      const doc = parser.parseFromString(htmlString, 'text/html');
      
      // Check for parsing errors
      const parseError = doc.querySelector('parsererror');
      if (parseError) {
        console.error('Error parsing HTML string:', parseError.textContent);
        // Try parsing as fragment instead
        const fragmentDoc = parser.parseFromString('<div>' + htmlString + '</div>', 'text/html');
        return fragmentDoc;
      }
      
      return doc;
    },
    
    /**
     * Gets the index of an element among siblings with the same tag
     */
    getElementIndex: function(element) {
      if (!element || !element.parentNode) return 0;
      
      const tagName = element.tagName;
      let count = 0;
      
      for (let i = 0; i < element.parentNode.children.length; i++) {
        const child = element.parentNode.children[i];
        if (child.tagName === tagName) {
          if (child === element) return count;
          count++;
        }
      }
      
      return 0;
    },
    
    /**
     * Filter out whitespace-only text nodes for more accurate comparison
     */
    filterNonEmptyNodes: function(node) {
      return node.nodeType !== Node.TEXT_NODE || node.textContent.trim() !== '';
    },
    
    /**
     * Generate a CSS-compatible path for an element using IDs and classes
     */
    getElementPath: function(element, rootElement = document.body) {
      if (!element || element === rootElement) return '';
      
      let path = element.tagName.toLowerCase();
      
      // Add ID if available (most specific)
      if (element.id) {
        path += '#' + element.id;
      } 
      // Add classes if available (somewhat specific)
      else if (element.classList && element.classList.length) {
        // Only use the first few classes to avoid overly complex selectors
        const classesToUse = Array.from(element.classList).slice(0, 3);
        path += '.' + classesToUse.join('.');
      }
      // Add position information (least specific)
      else {
        // Find position among siblings with same tag
        if (element.parentNode) {
          const siblings = Array.from(element.parentNode.children || [])
            .filter(e => e.tagName === element.tagName);
          
          if (siblings.length > 1) {
            const index = siblings.indexOf(element);
            if (index >= 0) {
              path += `:nth-of-type(${index + 1})`;
            }
          }
        }
      }
      
      // Build parent path, but limit depth
      let depth = 0;
      let parent = element.parentNode;
      let parentPath = '';
      
      while (parent && parent !== rootElement && parent.tagName && depth < 3) {
        let currentParentPath = parent.tagName.toLowerCase();
        
        // Add ID for parent if available
        if (parent.id) {
          currentParentPath += '#' + parent.id;
          // If we have an ID, we don't need to go higher in the hierarchy
          parentPath = currentParentPath + (parentPath ? ' > ' + parentPath : '');
          break;
        } 
        // Add first class for parent if available
        else if (parent.classList && parent.classList.length) {
          currentParentPath += '.' + parent.classList[0];
        }
        
        parentPath = currentParentPath + (parentPath ? ' > ' + parentPath : '');
        parent = parent.parentNode;
        depth++;
      }
      
      // Combine parent path with current element path
      return parentPath ? parentPath + ' > ' + path : path;
    },
    
    /**
     * Find an element in the DOM based on a diff object
     */
    _findElementByDiff: function(diff, targetSelector) {
      const target = document.querySelector(targetSelector);
      if (!target) return null;
      
      let element = null;
      let path = diff.path;
      
      // Extract metadata from path
      const pathInfo = this._extractPathMetadata(path);
      path = pathInfo.path;
      
      // Try CSS selector method if it looks valid
      if (this._isValidCSSSelector(path)) {
        try {
          // Clean the path to ensure it's a valid CSS selector
          const cleanPath = this._cleanSelectorPath(path);
          if (cleanPath) {
            element = document.querySelector(cleanPath);
            
            // Handle text content nodes
            if (element && pathInfo.isTextContent && pathInfo.positionIndex >= 0) {
              if (element.childNodes && pathInfo.positionIndex < element.childNodes.length) {
                const textNode = element.childNodes[pathInfo.positionIndex];
                if (textNode && textNode.nodeType === Node.TEXT_NODE) {
                  return textNode;
                }
              }
            }
          }
        } catch (e) {
          // Invalid selector, continue to other methods
        }
      }
      
      // If not found by CSS selector, try text content
      if (!element && (diff.oldText || diff.newText)) {
        element = this._findElementByText(target, diff.oldText || diff.newText);
      }
      
      // Try finding by tag if other methods failed
      if (!element && diff.oldTag) {
        const elements = document.getElementsByTagName(diff.oldTag);
        if (elements.length === 1) {
          element = elements[0];
        }
      }
      
      return element;
    },
    
    /**
     * Extract metadata from a path string
     */
    _extractPathMetadata: function(path) {
      let isTextContent = false;
      let positionIndex = -1;
      
      // Text content indicator
      if (path && path.includes(' (text content)')) {
        isTextContent = true;
        path = path.replace(' (text content)', '');
      } 
      // Text position indicator
      else if (path && path.includes(' (text at position ')) {
        isTextContent = true;
        const match = path.match(/ \(text at position (\d+)\)/);
        if (match && match[1]) {
          positionIndex = parseInt(match[1], 10);
        }
        path = path.replace(/ \(text at position \d+\)/, '');
      } 
      // Item position indicator
      else if (path && path.includes(' (item at position ')) {
        const match = path.match(/ \(item at position (\d+)\)/);
        if (match && match[1]) {
          positionIndex = parseInt(match[1], 10);
        }
        path = path.replace(/ \(item at position \d+\)/, '');
      }
      
      return { path, isTextContent, positionIndex };
    },
    
    /**
     * Check if a path is likely a valid CSS selector
     */
    _isValidCSSSelector: function(path) {
      if (!path) return false;
      
      // Check for common indicators of invalid selectors
      if (path.includes('(') || path.includes(')')) return false;
      
      // Check for valid CSS selector indicators
      const hasValidCharacters = path.includes('#') || 
        path.includes('.') || 
        path.includes('>') || 
        path.includes('[') || 
        path.includes(':');
        
      // Avoid paths with numeric indices that aren't part of CSS syntax
      const hasInvalidNumericPart = /\/\d+/.test(path);
      
      return hasValidCharacters && !hasInvalidNumericPart;
    },
    
    /**
     * Find an element by its text content
     */
    _findElementByText: function(rootElement, text) {
      if (!text || !text.trim() || !rootElement) return null;
      
      const walker = document.createTreeWalker(
        rootElement,
        NodeFilter.SHOW_TEXT,
        { acceptNode: node => node.textContent.trim() === text.trim() ? 
                            NodeFilter.FILTER_ACCEPT : 
                            NodeFilter.FILTER_REJECT }
      );
      
      let textNode = walker.nextNode();
      return textNode ? textNode.parentNode : null;
    },
    
    /**
     * Check if an element is a protected Doh element
     */
    _isDohProtectedElement: function(element, options) {
      if (!element || !options.ignoreDohElements) {
        return false;
      }
      
      // Check self for 'doh' class
      if (element.classList && element.classList.contains('doh')) {
        return true;
      }
      
      // Check parents for 'doh' class
      let parent = element.parentElement;
      while (parent) {
        if (parent.classList && parent.classList.contains('doh')) {
          return true;
        }
        parent = parent.parentElement;
      }
      
      return false;
    },
    
    // ===============================================================
    // CSS HANDLING - Comprehensive CSS management
    // ===============================================================
    
    /**
     * Advanced StyleManager for handling CSS updates elegantly
     */
    StyleManager: {
      // Track stylesheets by id and path
      styleRegistry: new Map(),
      
      /**
       * Register a stylesheet for tracking
       */
      register: function(element) {
        if (!element) return;

        // Generate identifier based on href or unique id for inline styles
        const id = this._getStylesheetId(element);
        if (id) {
          this.styleRegistry.set(id, {
            element,
            type: element.tagName.toLowerCase(),
            href: element.href || null,
            timestamp: Date.now()
          });
        }
      },

      /**
       * Initialize tracking of all current stylesheets
       */
      init: function() {
        // Clear existing registry
        this.styleRegistry.clear();
        
        // Register all link stylesheets
        Array.from(document.querySelectorAll('link[rel="stylesheet"]')).forEach(link => {
          this.register(link);
        });
        
        // Register all style elements
        Array.from(document.querySelectorAll('style')).forEach(style => {
          this.register(style);
        });
      },
      
      /**
       * Get unique ID for a stylesheet
       */
      _getStylesheetId: function(element) {
        if (!element) return null;
        
        if (element.tagName.toLowerCase() === 'link' && element.href) {
          // For link elements, use the href as id (without cache param)
          const url = new URL(element.href, window.location.href);
          // Remove cache busting parameters if present
          url.searchParams.delete('_reload');
          url.searchParams.delete('_v');
          url.searchParams.delete('v');
          url.searchParams.delete('t');
          url.hash = '';
          return url.toString();
        } else if (element.tagName.toLowerCase() === 'style') {
          // For inline styles, use id if available or create fingerprint
          if (element.id) {
            return `style#${element.id}`;
          }
          // Create a fingerprint based on content and position
          const parentPath = element.parentNode ? 
            (element.parentNode.id ? `#${element.parentNode.id}` : 
            (element.parentNode.tagName || '')) : '';
          const siblings = element.parentNode ? 
            Array.from(element.parentNode.querySelectorAll('style')).indexOf(element) : -1;
          
          return `style:${parentPath}:${siblings}:${element.textContent.length}`;
        }
        return null;
      },
      
      /**
       * Apply all stylesheet changes from the diff
       */
      applyStyleChanges: function(styleChanges, newHeadElement) {
        // First, initialize tracking of current stylesheets if not already done
        if (this.styleRegistry.size === 0) {
          this.init();
        }
        
        // Group changes by type for better handling
        const addedStyles = styleChanges.filter(change => change.type === 'node_added');
        const modifiedStyles = styleChanges.filter(change => 
          change.type === 'attribute_changed' || change.type === 'text_changed');
        const removedStyles = styleChanges.filter(change => change.type === 'node_removed');
        
        // Handle each type of change
        this._handleAddedStyles(addedStyles, newHeadElement);
        this._handleModifiedStyles(modifiedStyles, newHeadElement);
        this._handleRemovedStyles(removedStyles);
      },
      
      /**
       * Handle added stylesheet elements
       */
      _handleAddedStyles: function(addedStyles, newHeadElement) {
        addedStyles.forEach(change => {
          try {
            // Create temporary element to parse the new style/link
            const temp = document.createElement('div');
            temp.innerHTML = change.content || '';
            
            // Handle link elements (external stylesheets)
            const linkEl = temp.querySelector('link[rel="stylesheet"]');
            if (linkEl) {
              this._handleAddedLinkStylesheet(linkEl);
              return;
            }
            
            // Handle style elements (inline styles)
            const styleEl = temp.querySelector('style');
            if (styleEl) {
              this._handleAddedInlineStyle(styleEl);
            }
          } catch (error) {
            console.error('Error handling added stylesheet:', error, change);
          }
        });
      },
      
      /**
       * Handle added external stylesheet (link element)
       */
      _handleAddedLinkStylesheet: function(linkEl) {
        // Generate a clean ID for this new stylesheet
        const newStyleId = this._getStylesheetId(linkEl);
        
        // Check if we already have this stylesheet
        if (newStyleId && this.styleRegistry.has(newStyleId)) {
          // If it exists, we'll just refresh it rather than add a duplicate
          const existingEntry = this.styleRegistry.get(newStyleId);
          this._refreshExternalStylesheet(existingEntry.element);
          return;
        }
        
        // Otherwise, create a new link with cache busting
        const newLink = document.createElement('link');
        
        // Copy all attributes
        Array.from(linkEl.attributes).forEach(attr => {
          newLink.setAttribute(attr.name, attr.value);
        });
        
        // Add cache-busting to href
        if (newLink.href) {
          const url = new URL(newLink.href, window.location.href);
          url.searchParams.set('_reload', Date.now());
          newLink.href = url.toString();
        }
        
        // Register this new stylesheet
        this.register(newLink);
        
        // Add to document
        document.head.appendChild(newLink);
      },
      
      /**
       * Handle added inline style element
       */
      _handleAddedInlineStyle: function(styleEl) {
        // Check if we can find a similar style element
        const styleId = this._getStylesheetId(styleEl);
        if (styleId && this.styleRegistry.has(styleId)) {
          // Update existing style instead of adding duplicate
          const existingEntry = this.styleRegistry.get(styleId);
          existingEntry.element.textContent = styleEl.textContent;
          return;
        }
        
        // Otherwise, add new style element
        const newStyle = document.createElement('style');
        
        // Copy attributes
        Array.from(styleEl.attributes).forEach(attr => {
          newStyle.setAttribute(attr.name, attr.value);
        });
        
        // Copy content
        newStyle.textContent = styleEl.textContent;
        
        // Register new style
        this.register(newStyle);
        
        // Add to document
        document.head.appendChild(newStyle);
      },
      
      /**
       * Handle modified stylesheet elements
       */
      _handleModifiedStyles: function(modifiedStyles, newHeadElement) {
        modifiedStyles.forEach(change => {
          try {
            // Find the affected stylesheet element
            let styleEl;
            try {
              styleEl = document.querySelector(change.path);
            } catch (e) {
              // If selector fails, try more advanced lookup
              styleEl = this._findStyleElementByChange(change);
            }
            
            if (!styleEl) return;
            
            // Handle based on element type
            if (styleEl.tagName.toLowerCase() === 'link') {
              this._handleModifiedLinkStylesheet(styleEl, change, newHeadElement);
            } else if (styleEl.tagName.toLowerCase() === 'style') {
              this._handleModifiedInlineStyle(styleEl, change, newHeadElement);
            }
          } catch (error) {
            console.error('Error handling modified stylesheet:', error, change);
          }
        });
      },
      
      /**
       * Find a style element that matches the change description
       */
      _findStyleElementByChange: function(change) {
        // Try to find based on attributes in the change
        if (change.name === 'href' && change.oldValue) {
          // For external stylesheets with modified href
          return Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
            .find(el => el.href.includes(change.oldValue));
        }
        
        // For inline styles, try to find by content if we have oldText
        if (change.oldText && change.type === 'text_changed') {
          return Array.from(document.querySelectorAll('style'))
            .find(el => el.textContent.trim() === change.oldText.trim());
        }
        
        return null;
      },
      
      /**
       * Handle modification to external stylesheet (link element)
       */
      _handleModifiedLinkStylesheet: function(linkEl, change, newHeadElement) {
        // For external stylesheets, the simplest approach is to refresh it
        this._refreshExternalStylesheet(linkEl);
      },
      
      /**
       * Refresh an external stylesheet with cache busting
       */
      _refreshExternalStylesheet: function(linkEl) {
        // Ensure we're working with a stylesheet link
        if (!linkEl || linkEl.tagName.toLowerCase() !== 'link' || 
            !linkEl.rel || linkEl.rel.toLowerCase() !== 'stylesheet') {
          return;
        }
        
        // Store original URL
        const originalHref = linkEl.href;
        
        // Create a new link element
        const newLink = document.createElement('link');
        
        // Copy all attributes
        Array.from(linkEl.attributes).forEach(attr => {
          newLink.setAttribute(attr.name, attr.value);
        });
        
        // Add cache-busting parameter
        if (newLink.href) {
          const url = new URL(newLink.href, window.location.href);
          url.searchParams.set('_reload', Date.now());
          newLink.href = url.toString();
        }
        
        // Handle onload event to remove the old link after new one loads
        newLink.onload = function() {
          // Remove old link element after a small delay
          setTimeout(() => {
            if (linkEl.parentNode) {
              linkEl.parentNode.removeChild(linkEl);
            }
          }, 50);
        };
        
        // Update registry
        const styleId = this._getStylesheetId(linkEl);
        if (styleId) {
          this.styleRegistry.delete(styleId);
          this.register(newLink);
        }
        
        // Add new link before the old one
        if (linkEl.parentNode) {
          linkEl.parentNode.insertBefore(newLink, linkEl);
        } else {
          document.head.appendChild(newLink);
        }
      },
      
      /**
       * Handle modification to inline style element
       */
      _handleModifiedInlineStyle: function(styleEl, change, newHeadElement) {
        // If we have a text_changed type, update the style content
        if (change.type === 'text_changed' && change.newText) {
          styleEl.textContent = change.newText;
          return;
        }
        
        // If it's an attribute change, update the attribute
        if (change.type === 'attribute_changed' && change.name && change.newValue !== undefined) {
          styleEl.setAttribute(change.name, change.newValue);
          return;
        }
        
        // For other cases, try to find the updated style in the new DOM
        let newStyleEl;
        try {
          // Remove head from path if present to search within newHeadElement
          const cleanPath = change.path.replace(/^head\s*>?\s*/, '');
          newStyleEl = newHeadElement.querySelector(cleanPath);
        } catch (e) {
          // If that fails, try matching by other attributes
        }
        
        // If we found the new style, update content
        if (newStyleEl && newStyleEl.textContent) {
          styleEl.textContent = newStyleEl.textContent;
        }
      },
      
      /**
       * Handle removed stylesheet elements
       */
      _handleRemovedStyles: function(removedStyles) {
        removedStyles.forEach(change => {
          try {
            // If we have the path, try to find and remove the element
            if (change.path) {
              try {
                const styleEl = document.querySelector(change.path);
                if (styleEl && styleEl.parentNode) {
                  // Remove from registry
                  const styleId = this._getStylesheetId(styleEl);
                  if (styleId) {
                    this.styleRegistry.delete(styleId);
                  }
                  
                  // Remove from DOM
                  styleEl.parentNode.removeChild(styleEl);
                }
              } catch (e) {
                // If selector fails, try finding by content
                if (change.content) {
                  // For external stylesheets, look for matching href
                  if (change.content.includes('stylesheet') && change.content.includes('href=')) {
                    const match = change.content.match(/href=["']([^"']+)["']/);
                    if (match && match[1]) {
                      const href = match[1];
                      const links = Array.from(document.querySelectorAll('link[rel="stylesheet"]'));
                      const matchingLink = links.find(link => link.href.includes(href));
                      
                      if (matchingLink && matchingLink.parentNode) {
                        // Remove from registry
                        const styleId = this._getStylesheetId(matchingLink);
                        if (styleId) {
                          this.styleRegistry.delete(styleId);
                        }
                        
                        // Remove from DOM
                        matchingLink.parentNode.removeChild(matchingLink);
                      }
                    }
                  }
                  
                  // For inline styles, might need more complex matching
                }
              }
            }
          } catch (error) {
            console.error('Error handling removed stylesheet:', error, change);
          }
        });
      }
    },

    // ===============================================================
    // DIFFERENCE DETECTION - Core logic for finding differences
    // ===============================================================
    
    /**
     * Compare two virtual DOMs created from HTML strings
     * This is used for source-to-source comparison
     */
    compare: function(originalHtmlString, newHtmlString, options = {}) {
      // Default options
      options = this._initializeCompareOptions(options);
      
      // Create DOM from both HTML strings
      const originalDOM = this.createDOMFromString(originalHtmlString);
      const newDOM = this.createDOMFromString(newHtmlString);
      
      // Find differences based on element types
      let differences = [];
      
      // Compare the head section if needed
      if (options.includeHeadChanges) {
        const headDifferences = this._compareHeadElements(originalDOM.head, newDOM.head, options);
        differences = differences.concat(headDifferences);
      }
      
      // Compare body elements
      const bodyDifferences = this._compareBodyElements(originalDOM.body, newDOM.body);
      differences = differences.concat(bodyDifferences);
      
      // Post-process and return differences
      return this._postProcessDifferences(differences, options);
    },
    
    /**
     * Filter out insignificant differences like whitespace-only changes
     */
    filterInsignificantDiffs: function(differences) {
      if (!differences) return [];
      
      return differences.filter(diff => {
        // Keep all non-text changes
        if (!diff.type.includes('text_changed')) return true;
        
        // For text changes, make sure they're significant (not just whitespace)
        if (diff.oldText && diff.newText) {
          const oldTrimmed = diff.oldText.trim();
          const newTrimmed = diff.newText.trim();
          return oldTrimmed !== newTrimmed && (oldTrimmed || newTrimmed);
        }
        
        return true;
      });
    },
    
    /**
     * Compare two DOM elements
     */
    getDiff: function(currentElement, newElement) {
      const differences = [];
      
      // Handle missing elements
      if (!currentElement || !newElement) {
        differences.push({
          type: 'missing_element',
          path: '/',
          detail: !currentElement ? 'Current element is missing' : 'New element is missing'
        });
        return differences;
      }
      
      // Create a stable path for the element
      const path = this.getElementPath(currentElement);
      
      // Compare attributes
      this.compareAttributes(currentElement, newElement, differences, path);
      
      // Compare child nodes recursively
      this.compareChildren(currentElement, newElement, differences, path);
      
      return differences;
    },
    
    /**
     * Compare attributes between two elements
     */
    compareAttributes: function(current, newNode, differences, path = '') {
      if (!current || !newNode) return;
      
      const currentAttrs = Array.from(current.attributes || []);
      const newAttrs = Array.from(newNode.attributes || []);
      
      // Check for removed or changed attributes
      currentAttrs.forEach(attr => {
        const newAttr = newNode.getAttribute ? newNode.getAttribute(attr.name) : null;
        if (newAttr === null) {
          differences.push({
            type: 'attribute_removed',
            path: path,
            name: attr.name,
            value: attr.value
          });
        } else if (newAttr !== attr.value) {
          differences.push({
            type: 'attribute_changed',
            path: path,
            name: attr.name,
            oldValue: attr.value,
            newValue: newAttr
          });
        }
      });
      
      // Check for added attributes
      newAttrs.forEach(attr => {
        if (!current.hasAttribute(attr.name)) {
          differences.push({
            type: 'attribute_added',
            path: path,
            name: attr.name,
            value: attr.value
          });
        }
      });
    },
    
    /**
     * Compare children between two elements
     */
    compareChildren: function(current, newNode, differences, path = '') {
      if (!current || !newNode) return;
      
      // Filter out whitespace-only text nodes
      const currentChildren = Array.from(current.childNodes)
        .filter(this.filterNonEmptyNodes);
      const newChildren = Array.from(newNode.childNodes)
        .filter(this.filterNonEmptyNodes);
      
      // Compare node counts
      if (currentChildren.length !== newChildren.length) {
        differences.push({
          type: 'children_count_different',
          path: path,
          oldCount: currentChildren.length,
          newCount: newChildren.length
        });
      }
      
      // Match elements for comparison
      const matchedPairs = this.matchElements(currentChildren, newChildren);
      
      // Compare each matched pair
      matchedPairs.forEach(pair => {
        this._compareNodePair(pair, differences, path);
      });
    },
    
    /**
     * Compare a pair of matched nodes
     */
    _compareNodePair: function(pair, differences, parentPath) {
      const [currentChild, newChild, index] = pair;
      
      // Skip if both are null (should not happen)
      if (!currentChild && !newChild) return;
      
      // Generate path for this child
      const childPath = this._generateChildPath(currentChild, parentPath, index);
      
      // Handle node addition
      if (!currentChild) {
        differences.push({
          type: 'node_added',
          path: childPath,
          nodeType: newChild.nodeType,
          content: newChild.nodeType === Node.TEXT_NODE ? 
                   newChild.textContent.trim() : newChild.outerHTML
        });
        return;
      }
      
      // Handle node removal
      if (!newChild) {
        differences.push({
          type: 'node_removed',
          path: childPath,
          nodeType: currentChild.nodeType,
          content: currentChild.nodeType === Node.TEXT_NODE ? 
                   currentChild.textContent.trim() : currentChild.outerHTML
        });
        return;
      }
      
      // Compare node types
      if (currentChild.nodeType !== newChild.nodeType) {
        differences.push({
          type: 'node_type_different',
          path: childPath,
          oldType: currentChild.nodeType,
          newType: newChild.nodeType
        });
        return;
      }
      
      // Handle text nodes
      if (currentChild.nodeType === Node.TEXT_NODE) {
        this._compareTextNodes(currentChild, newChild, childPath, differences);
        return;
      }
      
      // Handle element nodes
      if (currentChild.nodeType === Node.ELEMENT_NODE) {
        this._compareElementNodes(currentChild, newChild, childPath, differences);
      }
    },
    
    /**
     * Generate a path for a child node
     */
    _generateChildPath: function(node, parentPath, index) {
      if (!node) return `${parentPath} (item at position ${index})`;
      
      if (node.nodeType === Node.ELEMENT_NODE) {
        return this.getElementPath(node);
      } 
      
      if (node.nodeType === Node.TEXT_NODE) {
        if (node.parentElement) {
          return this.getElementPath(node.parentElement) + ' (text content)';
        }
        return `${parentPath} (text at position ${index})`;
      }
      
      return `${parentPath} (item at position ${index})`;
    },
    
    /**
     * Compare two text nodes
     */
    _compareTextNodes: function(currentNode, newNode, path, differences) {
      const currentText = currentNode.textContent.trim();
      const newText = newNode.textContent.trim();
      
      if (currentText !== newText && (currentText || newText)) {
        differences.push({
          type: 'text_changed',
          path: path,
          oldText: currentText,
          newText: newText
        });
      }
    },
    
    /**
     * Compare two element nodes
     */
    _compareElementNodes: function(currentNode, newNode, path, differences) {
      // Compare tag names
      if (currentNode.tagName !== newNode.tagName) {
        differences.push({
          type: 'tag_changed',
          path: path,
          oldTag: currentNode.tagName,
          newTag: newNode.tagName
        });
        return;
      }
      
      // Compare attributes
      this.compareAttributes(currentNode, newNode, differences, path);
      
      // Recursively compare children
      this.compareChildren(currentNode, newNode, differences, path);
    },
    
    /**
     * Match elements between two arrays, preferring ID matching
     */
    matchElements: function(currentNodes, newNodes) {
      const matches = [];
      const matchedCurrentIndexes = new Set();
      const matchedNewIndexes = new Set();
      
      // First pass: match by ID for elements
      this._matchElementsById(currentNodes, newNodes, matches, matchedCurrentIndexes, matchedNewIndexes);
      
      // Second pass: match remaining elements by position
      this._matchElementsByPosition(currentNodes, newNodes, matches, matchedCurrentIndexes, matchedNewIndexes);
      
      // Add any remaining new nodes that weren't matched
      this._addRemainingNewNodes(newNodes, matches, matchedNewIndexes);
      
      return matches;
    },
    
    /**
     * Match elements by ID
     */
    _matchElementsById: function(currentNodes, newNodes, matches, matchedCurrentIndexes, matchedNewIndexes) {
      for (let i = 0; i < currentNodes.length; i++) {
        const currentNode = currentNodes[i];
        if (currentNode.nodeType !== Node.ELEMENT_NODE || !currentNode.id) continue;
        
        for (let j = 0; j < newNodes.length; j++) {
          const newNode = newNodes[j];
          if (newNode.nodeType !== Node.ELEMENT_NODE || !newNode.id) continue;
          
          if (currentNode.id === newNode.id) {
            matches.push([currentNode, newNode, i]);
            matchedCurrentIndexes.add(i);
            matchedNewIndexes.add(j);
            break;
          }
        }
      }
    },
    
    /**
     * Match remaining elements by position
     */
    _matchElementsByPosition: function(currentNodes, newNodes, matches, matchedCurrentIndexes, matchedNewIndexes) {
      for (let i = 0; i < currentNodes.length; i++) {
        if (matchedCurrentIndexes.has(i)) continue;
        
        // Find the first unmatched node in newNodes
        let matchIndex = -1;
        for (let j = 0; j < newNodes.length; j++) {
          if (!matchedNewIndexes.has(j)) {
            matchIndex = j;
            break;
          }
        }
        
        if (matchIndex >= 0) {
          matches.push([currentNodes[i], newNodes[matchIndex], i]);
          matchedNewIndexes.add(matchIndex);
        } else {
          // No match found in new nodes
          matches.push([currentNodes[i], null, i]);
        }
      }
    },
    
    /**
     * Add remaining new nodes that weren't matched
     */
    _addRemainingNewNodes: function(newNodes, matches, matchedNewIndexes) {
      for (let j = 0; j < newNodes.length; j++) {
        if (!matchedNewIndexes.has(j)) {
          // Find the next position in the current nodes
          let insertIndex = matches.length;
          matches.push([null, newNodes[j], insertIndex]);
        }
      }
    },
    
    /**
     * Check if a change is a special head change requiring additional handling
     * Links, scripts, styles, and certain meta tags need special handling beyond simple HTML updates
     */
    isSpecialHeadChange: function(diff) {
      // Not a head change
      if (!diff.isHeadChange) return false;
      
      const path = diff.path || '';
      
      // Check element type
      const isScriptChange = this._isScriptChange(diff, path);
      const isLinkChange = this._isLinkChange(diff, path);
      const isStyleChange = this._isStyleChange(diff, path);
      const isMetaChange = this._isMetaChange(diff, path);
      
      // Special meta changes like viewport, charset, http-equiv
      let isSpecialMetaChange = false;
      if (isMetaChange) {
        isSpecialMetaChange = this._isSpecialMetaChange(diff, path);
      }
      
      // Special attribute changes (src, href, integrity, etc.)
      let hasSpecialAttributeChange = false;
      if ((isScriptChange || isLinkChange) && diff.type.includes('attribute_')) {
        hasSpecialAttributeChange = this._hasSpecialAttributeChange(diff);
      }
      
      // Text content changes in script or style tags
      let hasContentChange = false;
      if ((isScriptChange || isStyleChange) && diff.type.includes('text_changed')) {
        hasContentChange = true;
      }
      
      // Node structure changes (additions or removals)
      let isNodeStructureChange = false;
      if ((isScriptChange || isLinkChange || isStyleChange || isMetaChange) && 
          (diff.type.includes('node_added') || diff.type.includes('node_removed'))) {
        isNodeStructureChange = true;
      }
      
      // Return true if any of these conditions are met
      return isScriptChange || isLinkChange || isStyleChange || isSpecialMetaChange || 
             hasSpecialAttributeChange || hasContentChange || isNodeStructureChange;
    },
    
    /**
     * Check if a change is related to a script element
     */
    _isScriptChange: function(diff, path) {
      return path.includes('script') || 
        (diff.oldTag && diff.oldTag.toLowerCase() === 'script') || 
        (diff.newTag && diff.newTag.toLowerCase() === 'script');
    },
    
    /**
     * Check if a change is related to a link element
     */
    _isLinkChange: function(diff, path) {
      // Check if this diff involves a link element
      const isLink = path.includes('link') || 
        (diff.oldTag && diff.oldTag.toLowerCase() === 'link') || 
        (diff.newTag && diff.newTag.toLowerCase() === 'link');
      
      return isLink;
    },
    
    /**
     * Check if a change is related to a style element
     */
    _isStyleChange: function(diff, path) {
      // Check if this diff involves a style element
      return path.includes('style') || 
        (diff.oldTag && diff.oldTag.toLowerCase() === 'style') || 
        (diff.newTag && diff.newTag.toLowerCase() === 'style');
    },
    
    /**
     * Check if a change is related to a meta element
     */
    _isMetaChange: function(diff, path) {
      return path.includes('meta') || 
        (diff.oldTag && diff.oldTag.toLowerCase() === 'meta') || 
        (diff.newTag && diff.newTag.toLowerCase() === 'meta');
    },
    
    /**
     * Check if a meta change is special (viewport, charset, http-equiv)
     */
    _isSpecialMetaChange: function(diff, path) {
      return path.includes('viewport') || 
        path.includes('charset') || 
        (diff.name === 'name' && (diff.oldValue === 'viewport' || diff.newValue === 'viewport')) || 
        (diff.name === 'charset') || 
        (diff.name === 'http-equiv');
    },
    
    /**
     * Check if a change involves special attributes
     */
    _hasSpecialAttributeChange: function(diff) {
      const specialAttributes = ['src', 'href', 'integrity', 'crossorigin', 'type', 'rel'];
      return specialAttributes.some(attr => diff.name === attr);
    },
    
    // ===============================================================
    // MAIN PUBLIC API - Compare, apply and highlight differences
    // ===============================================================
    
    /**
     * Apply changes using two virtual DOMs and then applying changes to live DOM
     */
    applyChanges: function(originalHtmlString, newHtmlString, targetSelector, options = {}) {
      // Default options
      options = Object.assign({
        highlightBeforeApply: false, // Highlight differences before applying them
        applyMode: 'smart', // 'smart', 'replace', or 'merge'
        handleSpecialHeadChanges: true, // Whether to specially handle head changes that require more than HTML updates
        reloadStylesheetsOnChange: true, // Whether to reload stylesheets when they change
        reloadScriptsOnChange: false, // Whether to reload scripts when they change
        reloadPageOnMajorHeadChanges: false // Whether to reload the page on major head changes
      }, options);
      
      try {
        // Get the target element to update
        const targetElement = document.querySelector(targetSelector);
        if (!targetElement) {
          console.error(`Target element not found: ${targetSelector}`);
          return false;
        }
        
        // Compare the two HTML strings to find differences
        const differences = this.compare(originalHtmlString, newHtmlString, {
          includeHeadChanges: true,
          detectSpecialHeadChanges: options.handleSpecialHeadChanges
        });
        
        // If no differences, nothing to do
        if (!differences || differences.length === 0) {
          console.log('No differences found to apply');
          return true;
        }
        
        // Check for major head changes that might require a page reload
        if (options.handleSpecialHeadChanges && options.reloadPageOnMajorHeadChanges) {
          const hasMajorHeadChanges = differences.some(diff => 
            diff.isHeadChange && diff.requiresSpecialHandling && 
            (diff.type.includes('node_added') || diff.type.includes('node_removed')) &&
            (diff.path.includes('script') || diff.path.includes('meta[http-equiv')));
          
          if (hasMajorHeadChanges) {
            console.log('Major head changes detected that require page reload');
            // If we determine a reload is needed, reload the page
            if (typeof window !== 'undefined') {
              window.location.reload();
              return true;
            }
          }
        }
        
        // Optionally highlight differences before applying
        if (options.highlightBeforeApply) {
          this.highlightChanges(differences, targetSelector);
          // Wait a bit to show highlights before applying changes
          return new Promise(resolve => {
            setTimeout(() => {
              this._applyChangesToDOM(differences, targetSelector, options, this.createDOMFromString(newHtmlString));
              resolve(true);
            }, 1000); // Wait 1 second to show highlights
          });
        }
        
        // Apply changes immediately
        return this._applyChangesToDOM(differences, targetSelector, options, this.createDOMFromString(newHtmlString));
      } catch (error) {
        console.error('Error applying changes:', error);
        return false;
      }
    },
    
    // Private method to actually apply the changes
    _applyChangesToDOM: function(differences, targetSelector, options, newDOM) {
      const targetElement = document.querySelector(targetSelector);
      if (!targetElement) return false;
      
      // Separate head changes from other changes
      const headChanges = differences.filter(diff => diff.isHeadChange);
      const bodyChanges = differences.filter(diff => !diff.isHeadChange);
      
      // Identify stylesheet changes that need special handling
      // This detects both external stylesheets and inline styles
      const styleChanges = headChanges.filter(diff => 
        (diff.path && diff.path.includes('link') && diff.path.includes('stylesheet')) || 
        (diff.path && diff.path.includes('style')) ||
        (diff.oldTag && (diff.oldTag.toLowerCase() === 'style' || diff.oldTag.toLowerCase() === 'link')) || 
        (diff.newTag && (diff.newTag.toLowerCase() === 'style' || diff.newTag.toLowerCase() === 'link')) ||
        (diff.name === 'rel' && (diff.oldValue === 'stylesheet' || diff.newValue === 'stylesheet')) ||
        (diff.name === 'href' && diff.path && diff.path.includes('link')));
      
      // Check for inline style changes specifically
      if (styleChanges.length > 0) {
        const hasInlineStyleChanges = styleChanges.some(change => 
          (change.path && change.path.includes('style')) || 
          (change.oldTag && change.oldTag.toLowerCase() === 'style') || 
          (change.newTag && change.newTag.toLowerCase() === 'style'));
        
        // Styles need special care to ensure they're properly applied
        // Flag for refreshing inline styles after main DOM operations complete
        if (hasInlineStyleChanges) {
          this._pendingInlineStyleRefresh = true;
        }
      }
      
      // Handle special head changes (scripts, styles, meta tags)
      if (options.handleSpecialHeadChanges && headChanges.length > 0) {
        this._applyHeadChanges(headChanges, newDOM, options);
      }
      
      // If we're updating the entire HTML, apply body changes too
      if (targetSelector.toLowerCase() === 'html') {
        if (bodyChanges.length > 0) {
          // Apply body changes based on mode
          this._applyBodyChanges(bodyChanges, newDOM.body, options);
        }
        
        // If not handling special head changes separately, update head directly
        if (!options.handleSpecialHeadChanges && headChanges.length > 0) {
          document.head.innerHTML = newDOM.head.innerHTML;
          
          // If we replaced the entire head, we should process inline styles
          this._pendingInlineStyleRefresh = true;
        }
      }
      // For head-specific updates
      else if (targetSelector.toLowerCase() === 'head') {
        // If not handling special head changes separately, update head directly
        if (!options.handleSpecialHeadChanges) {
          document.head.innerHTML = newDOM.head.innerHTML;
          
          // If we replaced the entire head, we should process inline styles
          this._pendingInlineStyleRefresh = true;
        }
        // Otherwise special head changes were handled above already
      }
      // For body or other element updates
      else {
        // Determine how to apply changes based on mode
        switch (options.applyMode) {
          case 'replace':
            // Simple replacement - just swap out the innerHTML
            targetElement.innerHTML = newDOM.querySelector(targetSelector)?.innerHTML || 
                                     newDOM.body.innerHTML;
            break;
            
          case 'merge':
            // Apply specific changes
            this._applyDiffSelective(bodyChanges, targetElement, targetSelector, options);
            break;
            
          case 'smart':
          default:
            // Use replace for major structural changes, merge for small changes
            if (bodyChanges.length > 10 || bodyChanges.some(d => d.type === 'children_count_different')) {
              // For major changes, use replace
              targetElement.innerHTML = newDOM.querySelector(targetSelector)?.innerHTML || 
                                       newDOM.body.innerHTML;
            } else {
              // For minor changes, use selective updates
            this._applyDiffSelective(bodyChanges, targetElement, targetSelector, options);
            }
            break;
        }
      }
      
      // Clear any highlights after applying
      document.querySelectorAll('.diff-highlight').forEach(el => {
        el.classList.remove('diff-highlight', 'diff-added', 'diff-removed', 'diff-changed');
      });
      
      // Process any pending inline style refresh
      if (this._pendingInlineStyleRefresh) {
        // Delay slightly to allow other DOM changes to complete
        setTimeout(() => {
          this.refreshInlineStyles(newDOM);
          this._pendingInlineStyleRefresh = false;
        }, 100);
      }
      
      return true;
    },
    
    // Private method to apply body changes
    _applyBodyChanges: function(bodyChanges, newBody, options) {
      // Apply changes based on mode
      switch (options.applyMode) {
        case 'replace':
          // Simple replacement
          document.body.innerHTML = newBody.innerHTML;
          break;
          
        case 'merge':
          // Apply specific changes
          this._applyDiffSelective(bodyChanges, document.body, 'body', options);
          break;
          
        case 'smart':
        default:
          // Use replace for major changes, merge for small changes
          if (bodyChanges.length > 10 || bodyChanges.some(d => d.type === 'children_count_different')) {
            document.body.innerHTML = newBody.innerHTML;
          } else {
            this._applyDiffSelective(bodyChanges, document.body, 'body', options);
          }
          break;
      }
    },
    
    /**
     * Compare head elements and mark special changes
     * This identifies stylesheet, script, and meta changes requiring special handling
     */
    _compareHeadElements: function(currentHead, newHead, options) {
      if (!currentHead || !newHead) return [];
      
      // Compare all elements in head and get raw differences
      const headDifferences = this.getDiff(currentHead, newHead);
      
      // Mark and check for special head changes that need custom handling
      if (options.detectSpecialHeadChanges && headDifferences && headDifferences.length > 0) {
        headDifferences.forEach(diff => {
          // Mark all differences as head changes for filtering
          diff.isHeadChange = true;
          
          // Check if this is a special type of change requiring custom handling
          // (scripts, stylesheets, meta tags with special attributes)
          if (this.isSpecialHeadChange(diff)) {
            diff.requiresSpecialHandling = true;
          }
        });
      }
      
      return headDifferences || [];
    },
    
    /**
     * Compare body elements
     */
    _compareBodyElements: function(currentBody, newBody) {
      if (!currentBody || !newBody) return [];
      
      const bodyDifferences = this.getDiff(currentBody, newBody);
      return bodyDifferences || [];
    },
    
    /**
     * Find the matching element in the new DOM to compare against
     */
    _findMatchingNewElement: function(newDOM, targetElement, targetSelector) {
      // Body element is a direct match
      if (targetSelector.toLowerCase() === 'body') {
        return newDOM.body;
      }
      
      // Try to find a matching element by selector
      let newElement = newDOM.querySelector(targetSelector);
      
      // If not found directly, try to find by position/tag
      if (!newElement && targetElement.tagName) {
        const tagName = targetElement.tagName.toLowerCase();
        const elements = newDOM.getElementsByTagName(tagName);
        const elementIndex = this.getElementIndex(targetElement);
        
        if (elementIndex < elements.length) {
          newElement = elements[elementIndex];
        }
      }
      
      // If still not found, fallback to body
      return newElement || newDOM.body;
    },
    
    /**
     * Post-process differences (filter, limit)
     */
    _postProcessDifferences: function(differences, options) {
      if (!differences || differences.length === 0) return [];
      
      // Filter insignificant differences
      if (options.filterInsignificant) {
        differences = this.filterInsignificantDiffs(differences);
      }
      
      // Limit number of differences
      if (options.maxDiffs && differences.length > options.maxDiffs) {
        console.warn(`Limited differences to ${options.maxDiffs} out of ${differences.length} total differences`);
        differences = differences.slice(0, options.maxDiffs);
      }
      
      return differences;
    },
    
    /**
     * Determine the best target selector based on the HTML content
     * This helps when loading full HTML pages versus partial fragments
     */
    _determineTargetSelector: function(htmlString, providedSelector = 'body') {
      // Default to the provided selector
      let targetSelector = providedSelector;
      
      // Create a temporary DOM to analyze the HTML structure
      const tempDOM = this.createDOMFromString(htmlString);
      
      // If the HTML contains <html>, <head>, or <body> tags, it's likely a full HTML document
      const hasHtmlTag = tempDOM.querySelector('html') !== null;
      const hasHeadTag = tempDOM.querySelector('head') !== null;
      const hasBodyTag = tempDOM.querySelector('body') !== null;
      
      // Determine if this is a full HTML document or a fragment
      const isFullDocument = hasHtmlTag || (hasHeadTag && hasBodyTag);
      
      // For full documents, we should use 'html' as the target to capture both head and body changes
      if (isFullDocument && providedSelector === 'body') {
        targetSelector = 'html';
      }
      
      // If it's just a fragment with a single root element, we might want to target that specific element
      if (!isFullDocument && providedSelector === 'body') {
        const bodyChildren = Array.from(tempDOM.body.children);
        if (bodyChildren.length === 1) {
          // If there's a single root element with an ID, use that as a more specific target
          const rootElement = bodyChildren[0];
          if (rootElement.id) {
            targetSelector = '#' + rootElement.id;
          } else if (rootElement.className) {
            // If it has classes, use the first class as a target
            const classes = rootElement.className.split(' ').filter(c => c.trim() !== '');
            if (classes.length > 0) {
              targetSelector = rootElement.tagName.toLowerCase() + '.' + classes[0];
            }
          }
        }
      }
      
      return targetSelector;
    },
    
    /**
     * Highlight DOM elements based on detected differences
     */
    highlightChanges: function(differences, targetSelector) {
      const target = document.querySelector(targetSelector);
      if (!target) return;
      
      // Clear any previous highlights
      document.querySelectorAll('.diff-highlight').forEach(el => {
        el.classList.remove('diff-highlight', 'diff-added', 'diff-removed', 'diff-changed');
      });
      
      // Create highlight style if it doesn't exist
      if (!document.getElementById('diff-styles')) {
        const style = document.createElement('style');
        style.id = 'diff-styles';
        style.textContent = `
          .diff-highlight { outline: 2px solid #ffcc00; }
          .diff-added { background-color: rgba(0, 255, 0, 0.2); }
          .diff-removed { background-color: rgba(255, 0, 0, 0.2); }
          .diff-changed { background-color: rgba(0, 0, 255, 0.2); }
        `;
        document.head.appendChild(style);
        }
        
      // Apply highlights based on differences
      differences.forEach(diff => {
        try {
          let element = this._findElementByDiff(diff, targetSelector);
          
          // Skip if element not found
          if (!element) {
            console.log('Could not find element for difference:', diff);
            return;
          }
          
          // Skip non-element nodes
          if (element.nodeType !== Node.ELEMENT_NODE) {
            // For text nodes, highlight parent
            if (element.nodeType === Node.TEXT_NODE && element.parentElement) {
              element = element.parentElement;
      } else {
              return;
        }
      }
      
          // Apply appropriate highlight class
          element.classList.add('diff-highlight');
          
          if (diff.type.includes('added')) {
            element.classList.add('diff-added');
          } else if (diff.type.includes('removed')) {
            element.classList.add('diff-removed');
            } else {
            element.classList.add('diff-changed');
          }
        } catch (error) {
          console.error('Error highlighting difference:', error, diff);
        }
      });
      
      return true; // Return success
    },
    
    /**
     * Initialize compare options with defaults
     */
    _initializeCompareOptions: function(options) {
      return Object.assign({
        filterInsignificant: true, // Filter out insignificant differences by default
        maxDiffs: 100, // Limit the number of differences to prevent performance issues
        includeHeadChanges: true, // Also detect changes in the head section
        detectSpecialHeadChanges: true // Flag changes that require special handling beyond HTML updates
      }, options);
    },
    
    /**
     * Determine if head comparison should be included
     */
    _shouldCompareHead: function(options, targetType) {
      return options.includeHeadChanges && 
        (targetType === 'html' || targetType === 'body' || targetType === 'head');
    },
    
    /**
     * Private method to apply head changes with special handling
     * Processes changes to scripts, stylesheets, and meta tags that need careful handling
     */
    _applyHeadChanges: function(headChanges, newDOM, options) {
      // Separate changes based on whether they need special handling
      const specialChanges = headChanges.filter(diff => diff.requiresSpecialHandling);
      const regularChanges = headChanges.filter(diff => !diff.requiresSpecialHandling);
      
      // SCRIPTS: Handle JavaScript files and inline scripts
      const scriptChanges = specialChanges.filter(diff => 
        diff.path.includes('script') || 
        (diff.oldTag && diff.oldTag.toLowerCase() === 'script') || 
        (diff.newTag && diff.newTag.toLowerCase() === 'script'));
      
      if (scriptChanges.length > 0 && options.reloadScriptsOnChange) {
        this._reloadAffectedScripts(scriptChanges, newDOM.head);
      }
      
      // STYLESHEETS: Handle CSS files and inline styles
      // Identify stylesheet changes using multiple criteria to catch all cases
      const styleChanges = specialChanges.filter(diff => 
        (diff.path && (diff.path.includes('link') && diff.path.includes('stylesheet'))) || 
        (diff.path && diff.path.includes('style')) ||
        (diff.oldTag && diff.oldTag.toLowerCase() === 'style') || 
        (diff.newTag && diff.newTag.toLowerCase() === 'style') ||
        (diff.name === 'rel' && (diff.oldValue === 'stylesheet' || diff.newValue === 'stylesheet')) ||
        (diff.name === 'href' && (diff.path && diff.path.includes('link'))));
      
      if (styleChanges.length > 0 && options.reloadStylesheetsOnChange) {
        try {
          // Handle external stylesheet updates (link elements)
        this._reloadAffectedStylesheets(styleChanges, newDOM.head);
          
          // Detect if we have inline style changes
          const hasInlineStyleChanges = styleChanges.some(change => 
            change.path.includes('style') || 
            (change.oldTag && change.oldTag.toLowerCase() === 'style') || 
            (change.newTag && change.newTag.toLowerCase() === 'style'));
          
          // Handle inline style updates separately for better control
          if (hasInlineStyleChanges) {
            // Delay slightly to let external stylesheets finish processing
            setTimeout(() => {
              this.refreshInlineStyles(newDOM);
            }, 50);
          }
        } catch (styleError) {
          console.error('Error updating stylesheets:', styleError);
          
          // Still try to refresh inline styles as fallback
          setTimeout(() => {
            this.refreshInlineStyles(newDOM);
          }, 100);
        }
      }
      
      // META TAGS: Handle special meta tags that affect page behavior
      const metaChanges = specialChanges.filter(diff => 
        diff.path.includes('meta') || 
        (diff.oldTag && diff.oldTag.toLowerCase() === 'meta') || 
        (diff.newTag && diff.newTag.toLowerCase() === 'meta'));
      
      if (metaChanges.length > 0) {
        this._applyMetaChanges(metaChanges, newDOM.head);
      }
      
      // Apply remaining head changes that don't need special handling
      if (regularChanges.length > 0) {
        this._applyDiffSelective(regularChanges, document.head, 'head', options);
      }
    },
    
    /**
     * Reload affected scripts based on changes
     */
    _reloadAffectedScripts: function(scriptChanges, newHeadElement) {
      // For each change that involves adding a new script or modifying an existing one
      scriptChanges.forEach(change => {
        try {
          // For added scripts
          if (change.type === 'node_added' && change.content) {
            // Create a temporary element to parse the script
            const temp = document.createElement('div');
            temp.innerHTML = change.content;
            const scriptEl = temp.querySelector('script');
            
            if (scriptEl) {
              // Create a new script element to ensure it will be executed
              const newScript = document.createElement('script');
              
              // Copy all attributes
              Array.from(scriptEl.attributes).forEach(attr => {
                newScript.setAttribute(attr.name, attr.value);
              });
              
              // Copy content for inline scripts
              if (!scriptEl.src) {
                newScript.textContent = scriptEl.textContent;
              }
              
              // Add to document
              document.head.appendChild(newScript);
            }
          }
          // For modified scripts
          else if ((change.type === 'attribute_changed' || change.type === 'text_changed') && change.path) {
            // Try to find the script in the document
            let scriptEl;
            try {
              scriptEl = document.querySelector(change.path);
            } catch (e) {
              // If selector fails, try to find based on other properties
              if (change.name === 'src' && change.oldValue) {
                scriptEl = Array.from(document.querySelectorAll('script[src]'))
                  .find(el => el.src.includes(change.oldValue));
              }
            }
            
            // If we found the script, replace it
            if (scriptEl) {
              // Find the corresponding script in the new head
              let newScriptEl;
              
              // Try finding by path
              try {
                // Remove head from path if present to search within newHeadElement
                const cleanPath = change.path.replace(/^head\s*>?\s*/, '');
                newScriptEl = newHeadElement.querySelector(cleanPath);
              } catch (e) {
                // If that fails, try to match by src or content
                if (change.name === 'src' && change.newValue) {
                  newScriptEl = Array.from(newHeadElement.querySelectorAll('script[src]'))
                    .find(el => el.src.includes(change.newValue));
                }
              }
              
              // If we found the new script version, replace the old one
              if (newScriptEl) {
                // Create a new script to ensure it will be executed
                const reloadedScript = document.createElement('script');
                
                // Copy all attributes
                Array.from(newScriptEl.attributes).forEach(attr => {
                  reloadedScript.setAttribute(attr.name, attr.value);
                });
                
                // Copy content for inline scripts
                if (!newScriptEl.src) {
                  reloadedScript.textContent = newScriptEl.textContent;
                }
                
                // Replace the old script
                if (scriptEl.parentNode) {
                  scriptEl.parentNode.replaceChild(reloadedScript, scriptEl);
                }
              }
            }
          }
        } catch (error) {
          console.error('Error reloading script:', error, change);
        }
      });
    },
    
    /**
     * Apply meta tag changes
     */
    _applyMetaChanges: function(metaChanges, newHeadElement) {
      metaChanges.forEach(change => {
        try {
          // For added meta tags
          if (change.type === 'node_added' && change.content) {
            // Create a temporary element to parse the meta tag
            const temp = document.createElement('div');
            temp.innerHTML = change.content;
            const metaEl = temp.querySelector('meta');
            
            if (metaEl) {
              // Check if a similar meta tag already exists
              let exists = false;
              
              // For meta tags with name attribute
              if (metaEl.name) {
                exists = !!document.querySelector(`meta[name="${metaEl.name}"]`);
              }
              // For meta tags with property attribute (e.g. Open Graph)
              else if (metaEl.hasAttribute('property')) {
                exists = !!document.querySelector(`meta[property="${metaEl.getAttribute('property')}"]`);
              }
              // For http-equiv meta tags
              else if (metaEl.hasAttribute('http-equiv')) {
                exists = !!document.querySelector(`meta[http-equiv="${metaEl.getAttribute('http-equiv')}"]`);
              }
              // For charset meta tags
              else if (metaEl.hasAttribute('charset')) {
                exists = !!document.querySelector('meta[charset]');
              }
              
              // If it doesn't exist, add it
              if (!exists) {
                document.head.appendChild(metaEl.cloneNode(true));
              }
              // If it exists, we might want to update it in some cases
              else {
                // For meta tags that should be updated if they exist
                if (metaEl.hasAttribute('http-equiv') || 
                    metaEl.name === 'viewport' || 
                    metaEl.hasAttribute('charset')) {
                  
                  let existingMeta;
                  
                  // Find the existing meta tag
                  if (metaEl.name) {
                    existingMeta = document.querySelector(`meta[name="${metaEl.name}"]`);
                  } else if (metaEl.hasAttribute('http-equiv')) {
                    existingMeta = document.querySelector(`meta[http-equiv="${metaEl.getAttribute('http-equiv')}"]`);
                  } else if (metaEl.hasAttribute('charset')) {
                    existingMeta = document.querySelector('meta[charset]');
                  }
                  
                  // Update the existing meta tag
                  if (existingMeta) {
                    Array.from(metaEl.attributes).forEach(attr => {
                      existingMeta.setAttribute(attr.name, attr.value);
                    });
                  }
                }
              }
            }
          }
          // For modified meta tags
          else if (change.type === 'attribute_changed' && change.path) {
            // Try to find the meta tag in the document
            let metaEl;
            try {
              metaEl = document.querySelector(change.path);
            } catch (e) {
              // If selector fails, try other methods based on what we know
              // about the change
            }
            
            // If we found the meta tag, update its attribute
            if (metaEl && change.name) {
              metaEl.setAttribute(change.name, change.newValue);
            }
          }
        } catch (error) {
          console.error('Error applying meta changes:', error, change);
        }
      });
    },
    
    /**
     * Apply specific changes selectively
     */
    _applyDiffSelective: function(differences, targetElement, targetSelector, options = {}) {
      differences.forEach(diff => {
        try {
          // Find the element to modify using the same logic as highlightChanges
          let element = this._findElementByDiff(diff, targetSelector);
          if (!element) return;
          
          // Apply the specific change based on type
          switch (diff.type) {
            case 'attribute_added':
            case 'attribute_changed':
              if (element.setAttribute && diff.name && diff.newValue !== undefined) {
                element.setAttribute(diff.name, diff.newValue);
              }
              break;
              
            case 'attribute_removed':
              if (element.removeAttribute && diff.name) {
                element.removeAttribute(diff.name);
              }
              break;
              
            case 'text_changed':
              // For text changes, need to find the text node
              if (diff.newText !== undefined) {
                const textNodes = Array.from(element.childNodes)
                  .filter(node => node.nodeType === Node.TEXT_NODE);
                
                // If we have a specific text node to modify
                if (textNodes.length > 0) {
                  // Try to find matching text node
                  const matchingNode = textNodes.find(node => 
                    node.textContent.trim() === diff.oldText);
                  
                  if (matchingNode) {
                    matchingNode.textContent = diff.newText;
                  } else if (textNodes.length === 1) {
                    // If only one text node, update it
                    textNodes[0].textContent = diff.newText;
                  } else {
                    // Otherwise update all text content
                    element.textContent = diff.newText;
                  }
                } else {
                  // If no text nodes found, set the text content
                  element.textContent = diff.newText;
                }
              }
              break;
              
            case 'node_added':
              // Handle node_added by updating parent's innerHTML
              if (diff.content) {
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = diff.content;
                const newNode = tempDiv.firstChild;
                if (newNode) {
                  element.appendChild(newNode);
                }
              }
              break;
              
            case 'node_removed':
              // For node removal, we need to find the specific node to remove
              if (element.parentNode) {
                element.parentNode.removeChild(element);
              }
              break;
              
            case 'tag_changed':
              // Tag changes require a full replacement of the element
              if (diff.newTag && element.parentNode) {
                const newElement = document.createElement(diff.newTag);
                // Copy attributes
                Array.from(element.attributes).forEach(attr => {
                  newElement.setAttribute(attr.name, attr.value);
                });
                // Copy content
                newElement.innerHTML = element.innerHTML;
                // Replace
                element.parentNode.replaceChild(newElement, element);
              }
              break;
          }
        } catch (error) {
          console.error('Error applying diff:', error, diff);
        }
      });
    },
    
    /**
     * Reload affected stylesheets based on changes
     * This method handles external stylesheet updates in a way that preserves page styling
     */
    _reloadAffectedStylesheets: function(styleChanges, newHeadElement) {
      // Group changes by type for more predictable processing
      const addedStyles = styleChanges.filter(change => change.type === 'node_added');
      const removedStyles = styleChanges.filter(change => change.type === 'node_removed');
      const modifiedStyles = styleChanges.filter(change => 
        change.type === 'attribute_changed' || change.type === 'text_changed');
      
      // First handle removed stylesheets - remove them from the DOM
      // This prevents duplicate stylesheets from accumulating
      removedStyles.forEach(change => {
        if (!change.path) return;
        
        try {
          // Clean the path to ensure it's a valid CSS selector
          const cleanPath = this._cleanSelectorPath(change.path);
          
          // Try to find element by path first
          let element = cleanPath ? document.querySelector(cleanPath) : null;
          
          if (element) {
            // Remove the element
            if (element.parentNode) {
              element.parentNode.removeChild(element);
            }
          } else {
            // If element not found by path, try extracting href for link elements
            if (change.content && change.content.includes('stylesheet') && change.content.includes('href=')) {
              const hrefMatch = change.content.match(/href=["']([^"']+)["']/);
              if (hrefMatch && hrefMatch[1]) {
                const hrefToRemove = hrefMatch[1];
                
                // Find all stylesheets and remove any with matching href
                document.querySelectorAll('link[rel="stylesheet"]').forEach(link => {
                  if (link.href.includes(hrefToRemove)) {
                    if (link.parentNode) {
                      link.parentNode.removeChild(link);
                    }
                  }
                });
              }
            }
          }
        } catch (error) {
          console.error('Error removing stylesheet:', error);
        }
      });
      
      // Next handle modified stylesheets - update them in place
      modifiedStyles.forEach(change => {
        try {
          if (!change.path) return;
          
          // Clean the path to ensure it's a valid CSS selector
          const cleanPath = this._cleanSelectorPath(change.path);
          if (!cleanPath) return;
          
          const element = document.querySelector(cleanPath);
          
          if (!element) return;
          
          // For link elements (external stylesheets)
          if (element.tagName.toLowerCase() === 'link') {
            // Special handling for href changes
            if (change.type === 'attribute_changed' && change.name === 'href') {
              // Create a new link element with the updated href
              const newLink = document.createElement('link');
              
              // Copy all attributes except href
              Array.from(element.attributes).forEach(attr => {
                if (attr.name === 'href') {
                  // Use the new href value with cache busting
                  const url = new URL(change.newValue, window.location.href);
                  url.searchParams.set('_reload', Date.now());
                  newLink.setAttribute('href', url.toString());
                } else {
                  newLink.setAttribute(attr.name, attr.value);
                }
              });
              
              // Insert before removing to prevent FOUC
              if (element.parentNode) {
                element.parentNode.insertBefore(newLink, element);
                
                // Remove old element after a delay to ensure the new one loads
                setTimeout(() => {
                  if (element.parentNode) {
                    element.parentNode.removeChild(element);
                  }
                }, 200);
              } else {
                document.head.appendChild(newLink);
              }
            } 
            // For other attribute changes
            else if (change.type === 'attribute_changed') {
              element.setAttribute(change.name, change.newValue);
            }
          } 
          // For style elements
          else if (element.tagName.toLowerCase() === 'style') {
            // Text content changes
            if (change.type === 'text_changed' && change.newText !== undefined) {
              element.textContent = change.newText;
              this._forceStyleRecalculation(element);
            }
          }
        } catch (error) {
          console.error('Error modifying stylesheet:', error);
        }
      });
      
      // Finally add new stylesheets
      addedStyles.forEach(change => {
        try {
          if (!change.content) return;
          
            const temp = document.createElement('div');
          temp.innerHTML = change.content;
          
          // For link elements
          const linkEl = temp.querySelector('link[rel="stylesheet"]');
          if (linkEl) {
            // Check if we already have this stylesheet to prevent duplicates
            const href = linkEl.getAttribute('href');
            if (href) {
              // Check if we already have a link with this href
              let duplicate = false;
              document.querySelectorAll('link[rel="stylesheet"]').forEach(link => {
                const existingHref = link.getAttribute('href');
                if (existingHref && this._stripCacheBusting(existingHref) === this._stripCacheBusting(href)) {
                  console.log('STYLESHEET: Duplicate stylesheet detected, skipping');
                  duplicate = true;
                }
              });
              
              if (duplicate) return;
            }
            
            // Create a new link with cache busting
            const newLink = document.createElement('link');
            
            // Copy attributes
            Array.from(linkEl.attributes).forEach(attr => {
              if (attr.name === 'href' && attr.value) {
                // Add cache busting
                const url = new URL(attr.value, window.location.href);
                url.searchParams.set('_reload', Date.now());
                newLink.setAttribute('href', url.toString());
            } else {
                newLink.setAttribute(attr.name, attr.value);
              }
            });
            
            // Add to document
            document.head.appendChild(newLink);
            console.log('STYLESHEET: Added new link stylesheet');
          }
          
          // For style elements
          const styleEl = temp.querySelector('style');
          if (styleEl) {
            // This is now handled by the refreshInlineStyles method
            console.log('STYLESHEET: Inline style additions are handled by refreshInlineStyles');
          }
        } catch (error) {
          console.error('STYLESHEET: Error adding stylesheet:', error);
        }
      });
    },
    
    /**
     * Clean a path string to create a valid CSS selector
     * Removes annotations like '(text content)' that aren't valid in selectors
     */
    _cleanSelectorPath: function(path) {
      if (!path) return null;
      
      // Remove text content annotations
      let cleanPath = path.replace(/ \(text content\)$/, '');
      cleanPath = cleanPath.replace(/ \(text at position \d+\)$/, '');
      cleanPath = cleanPath.replace(/ \(item at position \d+\)$/, '');
      
      // Skip any paths that still look invalid
      if (cleanPath.includes('(') || cleanPath.includes(')')) {
        return null;
      }
      
      return cleanPath;
    },
    
    /**
     * Helper to strip cache busting parameters from URLs for comparison
     */
    _stripCacheBusting: function(url) {
      try {
        const urlObj = new URL(url, window.location.href);
        // Remove common cache-busting parameters
        urlObj.searchParams.delete('_reload');
        urlObj.searchParams.delete('_v');
        urlObj.searchParams.delete('v');
        urlObj.searchParams.delete('t');
        urlObj.searchParams.delete('_t');
        urlObj.searchParams.delete('_forcereload');
        // Remove hash
        urlObj.hash = '';
        return urlObj.toString();
      } catch (e) {
        return url; // Return original if parsing fails
      }
    },
    
    /**
     * Force browser to recalculate styles for an inline style element
     * This helps ensure changes are applied when textContent updates might not trigger a reflow
     */
    _forceStyleRecalculation: function(styleElement) {
      if (!styleElement || styleElement.tagName.toLowerCase() !== 'style') {
        return;
      }
      
      try {
        // Method 1: Toggle the disabled property
        styleElement.disabled = true;
        // Force a reflow
        void document.body.offsetHeight;
        // Re-enable the style
        styleElement.disabled = false;
        
        // Method 2: Try cloning and replacing
        const parent = styleElement.parentNode;
        if (parent) {
          const clone = styleElement.cloneNode(true);
          clone.id = styleElement.id + '_new';
          parent.insertBefore(clone, styleElement);
          // Wait a moment before removing the old one
          setTimeout(() => {
            parent.removeChild(styleElement);
            // Fix the ID back
            if (styleElement.id) {
              clone.id = styleElement.id;
            }
          }, 10);
        }
        
        // Method 3: Add a harmless rule to force re-evaluation
        const originalContent = styleElement.textContent;
        // Add a harmless unique comment to force a refresh
        const uniqueComment = `/* Refresh ${Date.now()} */`;
        styleElement.textContent = originalContent + '\n' + uniqueComment;
      } catch (error) {
        console.error('Error during style recalculation:', error);
      }
    },
    
    /**
     * Specifically update all inline styles in the document
     * Provides a focused way to handle inline style changes even when the diff
     * doesn't precisely identify what changed
     */
    refreshInlineStyles: function(newDOM) {
      // Get all style elements from current document
      const currentStyles = Array.from(document.querySelectorAll('style'));
      
      // Get all style elements from new DOM
      const newStyles = newDOM ? Array.from(newDOM.querySelectorAll('style')) : [];
      
      // If we don't have new styles to work with, force recalculation of existing styles
      if (newStyles.length === 0 && currentStyles.length > 0) {
        currentStyles.forEach(style => {
          this._forceStyleRecalculation(style);
        });
        return;
      }
      
      // Try to match styles between old and new DOM
      currentStyles.forEach((currentStyle, index) => {
        // Try to find a matching style in the new DOM
        let matchingNewStyle = null;
        
        // Match by ID if available (most reliable)
        if (currentStyle.id) {
          matchingNewStyle = newStyles.find(s => s.id === currentStyle.id);
        }
        
        // If no match by ID, try by position (less reliable but often works)
        if (!matchingNewStyle) {
          if (index < newStyles.length) {
            matchingNewStyle = newStyles[index];
          }
        }
        
        // If we found a match, update the content if different
        if (matchingNewStyle) {
          // Only update if content is different
          if (currentStyle.textContent !== matchingNewStyle.textContent) {
            currentStyle.textContent = matchingNewStyle.textContent;
            // Force recalculation to ensure changes take effect
            this._forceStyleRecalculation(currentStyle);
          }
        }
      });
      
      // Add any new styles that don't exist in current document
      if (newStyles.length > currentStyles.length) {
        for (let i = currentStyles.length; i < newStyles.length; i++) {
          const newStyle = document.createElement('style');
          // Copy attributes
          Array.from(newStyles[i].attributes).forEach(attr => {
            newStyle.setAttribute(attr.name, attr.value);
          });
          // Copy content
          newStyle.textContent = newStyles[i].textContent;
          // Add to document
          document.head.appendChild(newStyle);
        }
      }
    },
    
    /**
     * Brute force approach to reload all stylesheets
     * This is a fallback method when other update methods fail
     * Forces a complete reload of all external stylesheets and refresh of inline styles
     */
    forceReloadStylesheets: function() {
      // Get all link elements with rel="stylesheet"
      const linkStylesheets = Array.from(document.querySelectorAll('link[rel="stylesheet"]'));
      
      // Process each external stylesheet
      linkStylesheets.forEach((link) => {
        try {
          // Skip stylesheets loaded from different origins (CORS restrictions)
          const linkUrl = new URL(link.href);
          const isSameOrigin = linkUrl.origin === window.location.origin;
          if (!isSameOrigin) {
            return; // Skip cross-origin stylesheets
          }
          
          // Create a new link element to replace the old one
          const newLink = document.createElement('link');
          
          // Copy all attributes
          Array.from(link.attributes).forEach(attr => {
            newLink.setAttribute(attr.name, attr.value);
          });
          
          // Force reload with cache busting
          if (newLink.href) {
            const url = new URL(newLink.href, window.location.href);
            // Remove any existing cache busters
            url.searchParams.delete('_reload');
            url.searchParams.delete('t');
            url.searchParams.delete('v');
            // Add new cache buster
            url.searchParams.set('_forcereload', Date.now());
            newLink.href = url.toString();
          }
          
          // Make sure it's marked as a stylesheet
          newLink.rel = 'stylesheet';
          
          // Insert before removing to prevent flash of unstyled content (FOUC)
          if (link.parentNode) {
            link.parentNode.insertBefore(newLink, link);
            
            // Remove the old link after a small delay
            setTimeout(() => {
              if (link.parentNode) {
                link.parentNode.removeChild(link);
              }
            }, 100);
          } else {
            document.head.appendChild(newLink);
          }
        } catch (error) {
          console.error('Error force reloading stylesheet:', error);
        }
      });
      
      // Now handle inline styles
      const inlineStyles = Array.from(document.querySelectorAll('style'));
      
      // Force re-evaluation of all inline styles
      inlineStyles.forEach((style) => {
        if (!style.textContent) return;
        
        // Force recalculation using our utility method
        this._forceStyleRecalculation(style);
      });
      
      return true;
    },
    
    /**
     * Diagnose stylesheet issues for troubleshooting purposes
     * This is a utility method intended to be called manually when debugging
     * stylesheet update problems
     */
    diagnoseStylesheetCaching: function(differences) {
      // Get information about all current stylesheets
      const linkStylesheets = Array.from(document.querySelectorAll('link[rel="stylesheet"]'));
      const inlineStyles = Array.from(document.querySelectorAll('style'));
      
      const report = {
        currentTime: new Date().toString(),
        externalStylesheets: linkStylesheets.map(link => ({
          href: link.href,
          rel: link.rel,
          id: link.id,
          media: link.media,
          disabled: link.disabled,
          hasCacheBusting: this._hasCacheBusting(link.href)
        })),
        inlineStyles: inlineStyles.map(style => ({
          id: style.id,
          content: style.textContent ? `${style.textContent.substring(0, 100)}...` : null,
          length: style.textContent ? style.textContent.length : 0
        }))
      };
      
      // Add difference information if provided
      if (differences) {
        report.differences = differences.map(diff => ({
          type: diff.type,
          path: diff.path,
          isHeadChange: diff.isHeadChange,
          requiresSpecialHandling: diff.requiresSpecialHandling,
          name: diff.name,
          oldValue: diff.oldValue,
          newValue: diff.newValue
        }));
      }
      
      // Return the report as a JSON string for easier viewing
      return JSON.stringify(report, null, 2);
    },
    
    /**
     * Check if a URL has cache busting parameters
     */
    _hasCacheBusting: function(url) {
      if (!url) return false;
      
      try {
        const urlObj = new URL(url, window.location.href);
        return urlObj.searchParams.has('_reload') || 
          urlObj.searchParams.has('_v') || 
          urlObj.searchParams.has('v') || 
          urlObj.searchParams.has('t') ||
          urlObj.searchParams.has('_t') ||
          urlObj.searchParams.has('_forcereload');
      } catch (e) {
        return false;
      }
    }
  });
});