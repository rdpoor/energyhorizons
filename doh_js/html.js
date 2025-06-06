Doh.Module('stylesheet', ['browser?? jquery'], function (jQuery) {
  if (!IsBrowser()) return;

  // Internal cache for the default style element
  const _styleCache = {
    defaultStyleElement: null
  };

  /**
   * Creates or updates a style element with the provided CSS content
   * @param {string} cssContent - CSS rules to include in the style tag
   * @param {HTMLStyleElement} [styleElement] - Optional existing style element to update
   * @returns {HTMLStyleElement} - The created or updated style element
   */
  Doh.css = function (cssContent, styleElement) {
    // Use provided style element, or the cached one, or create a new one
    if (!styleElement) {
      if (!_styleCache.defaultStyleElement) {
        _styleCache.defaultStyleElement = document.createElement('style');
        _styleCache.defaultStyleElement.setAttribute('type', 'text/css');
        document.head.appendChild(_styleCache.defaultStyleElement);
      }
      styleElement = _styleCache.defaultStyleElement;
    }

    // Add/append the CSS content
    if (styleElement.styleSheet) {
      // For old IE - this replaces existing content, so we need to append manually
      const existingContent = styleElement.styleSheet.cssText || '';
      styleElement.styleSheet.cssText = existingContent + cssContent;
    } else {
      // For modern browsers - append new content
      styleElement.appendChild(document.createTextNode(cssContent));
    }

    // Return the style element for further manipulation
    return styleElement;
  };

  /**
   * jQuery plugin for adding, removing and making changes to CSS rules
   * 
   * @author Vimal Aravindashan
   * @version 0.3.7
   * @licensed MIT license
   */
  (function (factory) {
    if (typeof module === "object" && typeof module.exports === "object") {
      // Node/CommonJS
      module.exports = factory;
    } else {
      // Browser globals
      factory(jQuery);
    }
  }(function ($) {
    var _ahref = $(document.createElement('a')), /**< <a> tag used for evaluating hrefs */
      _styles = _ahref.prop('style'), /**< Collection of styles available on the host */
      _sheet = function (s) {
        return s.sheet || s.styleSheet;
      }($('<style type="text/css">*{}</style>').appendTo('head')[0]), /**< StyleSheet for adding new rules*/
      _rules = ('cssRules' in _sheet) ? 'cssRules' : 'rules', /**< Attribute name for rules collection in a stylesheet */
      vendorPrefixes = ["Webkit", "O", "Moz", "ms"]; /**< Case sensitive list of vendor specific prefixes */

    /**
     * @function filterStyleSheet
     * Filter a stylesheet based on accessibility and, ID or location
     * @param {String} filter Filter to be applied. id or href of the style element can be used as filters.
     * @param {CSSStyleSheet} styleSheet StyleSheet to be filtered
     * @returns {Boolean} true if styleSheet matches the filter, false otherwise
     */
    function filterStyleSheet(filter, styleSheet) {
      try {
        if (styleSheet[_rules]) {
          filter = filter || '';
          var node = $(styleSheet.ownerNode || styleSheet.owningElement);
          return (filter === '') || (filter === '*') ||
            ('#' + (node.prop('id') || '') == filter) ||
            ((node.prop('href') || '') == _ahref.prop('href', filter).prop('href'));
        } else {
          return false;
        }
      } catch (e) {
        return false;
      }
    }

    /**
     * @function parseSelector
     * Splits a jQuery.stylesheet compatible selector into stylesheet filter and selector text
     * @param {String} selector Selector text to be parsed
     * @returns {Object} object with two properties 'styleSheet' and 'selectorText'
     */
    function parseSelector(selector) {
      var styleSheet = (/.*?{/.exec(selector) || ['{'])[0],
        selectorText = /{.*}/g.exec(selector); //TODO: replace selector with dict object
      if (selectorText === null) {
        var parts = selector.split('{');
        selectorText = '{' + parts[parts.length == 1 ? 0 : 1].split('}')[0] + '}';
      } else {
        selectorText = selectorText[0];
      }
      return {
        styleSheet: $.trim(styleSheet.substr(0, styleSheet.length - 1)),
        selectorText: normalizeSelector(selectorText.substr(1, selectorText.length - 2))
      };
    }

    /**
     * @function normalizeSelector
     * Normalizes selectorText to work cross-browser
     * @param {String} selectorText selector string to normalize
     * @returns {String} normalized selector string
     */
    function normalizeSelector(selectorText) {
      var selector = [], last, len;
      last = _sheet[_rules].length;
      insertRule.call(_sheet, selectorText, ';'); //NOTE: IE doesn't seem to mind ';' as non-empty
      len = _sheet[_rules].length;
      for (var i = len - 1; i >= last; i--) {
        selector.push(_sheet[_rules][i].selectorText);
        deleteRule.call(_sheet, i);
      }
      return selector.reverse().join(', ');
    }

    /**
     * @function matchSelector
     * Matches given selector to selectorText of cssRule
     * @param {CSSStyleRule} cssRule to match with
     * @param {String} selectorText selector string to compare
     * @param {Boolean} matchGroups when true, selector is matched in grouped style rules
     * @returns true if selectorText of cssRule matches given selector, false otherwise
     */
    function matchSelector(cssRule, selectorText, matchGroups) {
      if ($.type(cssRule.selectorText) !== 'string') {
        return false;
      }

      if (cssRule.selectorText === selectorText) {
        return true;
      } else if (matchGroups === true) {
        return $($.map(cssRule.selectorText.split(','), $.trim)).filter(function (i) {
          return this.toString() === selectorText;
        }).length > 0;
      } else {
        return false;
      }
    }

    /**
     * @function vendorPropName
     * Vendor prefixed style property name.
     * Based on similar function in jQuery library.
     * @param {String} name camelCased CSS property name
     * @returns {String} Vendor specific tag prefixed style name
     * if found in styles, else passed name as-is
     * @see vendorPrefixes
     * @see _styles
     */
    function vendorPropName(name) {
      var titleName = name[0].toUpperCase() + name.slice(1),
        styleName, i = vendorPrefixes.length;
      while (--i) {
        styleName = vendorPrefixes[i] + titleName;
        if (styleName in _styles) {
          return styleName;
        }
      }
      return name;
    }

    /**
     * @function normalizeRule
     * Normalizes the CSSStyleRule object to work better across browsers
     * @param {CSSStyleRule} rule CSSStyleRule object to be normalized
     * @param {StyleSheet} styleSheet parent stylesheet of the rule
     * @returns {CSSStyleRule} normalized CSSStyleRule
     */
    function normalizeRule(rule, styleSheet) {
      //NOTE: this is experimental, however, it does have it's benefits
      //      for use with $.animate(), be sure to include jquery.stylesheet-animate.js as well
      //TODO: move some of the defaults used here to user options
      rule.ownerDocument = rule.ownerDocument || document; //XXX: Hack for jQuery.isHidden()
      rule.nodeType = rule.nodeType || 1; //XXX: Hack for jQuery's defaultPrefilter()
      rule.nodeName = rule.nodeName || 'DIV'; //XXX: Hack for jQuery's acceptData()
      rule.parentNode = rule.parentNode || styleSheet.ownerNode || styleSheet.owningElement; //XXX: Hack for jQuery.contains()
      rule.parentStyleSheet = rule.parentStyleSheet || styleSheet; //XXX: Fix for IE7
      return rule;
    }
    /*
    * Checking for 'instanceof CSSStyleRule' fails in IE7 but not in IE8, however, the call to normalizeRule() fails in both.
    * So, we will define our custom CSSStyleRule class on all browsers where normalizeRule() fails.
    */
    try {
      normalizeRule(_sheet[_rules][0], _sheet);
      $.support.nativeCSSStyleRule = true;
    } catch (e) {
      $.support.nativeCSSStyleRule = false;
      CSSStyleRule = function (rule) {
        $.extend(this, rule);
        this.rule = rule; //XXX: deleteRule() requires the original object
        this.currentStyle = rule.style; //XXX: Hack for jQuery's curCSS()/getStyles() for IE7
      };
    }

    /**
     * @function insertRule
     * Cross-browser function for inserting rules
     * @param {String} selector selectorText for the rule
     * @param {String} css CSS property-value pair string
     * @param {Number} index Index position to insert the string;
     * defaults to end of rules collection
     */
    function insertRule(selector, css, index) {
      if (!selector || !css) {
        return -1; //NOTE: IE does not like addRule(selector,'',index)
      }
      var self = this,
        _insfn = self.insertRule ? function (selector, css, index) { this.insertRule(selector + '{' + css + '}', index); } : self.addRule;
      index = index || this[_rules].length;
      try {
        return _insfn.call(self, selector, css, index);
      } catch (e) {
        $.each(selector.split(','), function (i, sel) {
          _insfn.call(self, $.trim(sel), css);
        });
        return -1;
      }
    }

    /**
     * @function deleteRule
     * Cross-browser function for deleting rules
     * @param {Number|CSSStyleRule} Index of rule to be deleted, or
     * reference to rule to be deleted from rules collection
     */
    function deleteRule(rule) {
      //NOTE: If we are using our custom CSSStyleRule, then CSSStyleRule.rule is the real style rule object
      rule = (rule && rule.rule) ? rule.rule : rule;
      if (!rule) {
        return;
      }
      var self = this,
        _delfn = self.deleteRule || self.removeRule;
      if (!_delfn) { //NOTE: IE7 has issues with rule.parentStyleSheet, so we need to search for the parent stylesheet
        $(document.styleSheets).each(function (i, styleSheet) {
          if ($(styleSheet[_rules]).filter(function () { return this === rule; }).length == 1) {
            self = styleSheet;
            _delfn = self.deleteRule || self.removeRule;
            return false;
          }
        });
      }
      if ($.type(rule) == 'number') {
        _delfn.call(self, rule);
      } else {
        $.each(self[_rules], function (i, _rule) {
          if (rule === _rule) {
            _delfn.call(self, i);
            return false;
          }
        });
      }
    }

    /**
     * jQuery.stylesheet
     * 
     * Constructor/Factory method for initializing a jQuery.stylesheet object.
     * Includes a short-cut to apply style changes immediately.
     * @param {String} selector CSS rule selector text with optional stylesheet filter  
     * @param {String|Array|Object} name Name of style property to get/set.
     * Also accepts array of property names and object of name/value pairs.
     * @param {String} value If defined, then value of the style property
     * is updated with it. Unused when name is an object map.
     * @returns {jQuery.stylesheet|String|Object} A new jQuery.stylesheet object
     * if name/value is not passed, or value of property or object of name/value pairs
     */
    $.stylesheet = function (selector, name, value) {
      if (!(this instanceof $.stylesheet)) {
        return new $.stylesheet(selector, name, value);
      }

      this.init(selector);
      return this.css(name, value);
    };

    $.extend($.stylesheet, {
      /**
       * @function jQuery.stylesheet.cssRules
       * @param {String} selector CSS rule selector text with optional stylesheet filter
       * @returns {Array} Array of CSSStyleRule objects that match the selector text
       * and pass the stylesheet filter
       */
      cssRules: function (selector) {
        var rules = [],
          filters = parseSelector(selector);
        //NOTE: The stylesheet filter will be treated as case-sensitive
        //      The selectorText filter's case depends on the browser
        $(document.styleSheets).each(function (i, styleSheet) {
          if (filterStyleSheet(filters.styleSheet, styleSheet)) {
            $.merge(rules, $(styleSheet[_rules]).filter(function () {
              return matchSelector(this, filters.selectorText, filters.styleSheet === '*');
            }).map(function () {
              return normalizeRule($.support.nativeCSSStyleRule ? this : new CSSStyleRule(this), styleSheet);
            }));
          }
        });
        return rules.reverse();
      },

      /**
       * @function jQuery.stylesheet.camelCase
       * jQuery.camelCase is undocumented and could be removed at any point
       * @param {String} str Hypenated string to be camelCased
       * @returns {String} camelCased string
       */
      camelCase: $.camelCase || function (str) {
        return str.replace(/-([\da-z])/g, function (a) { return a.toUpperCase().replace('-', ''); });
      },

      /**
       * Normalized CSS property names
       * jQuery.cssProps is undocumented and could be removed at any point
       */
      cssProps: $.cssProps || {},

      /**
       * @function jQuery.styesheet.cssStyleName
       * @param {String} name Hypenated CSS property name
       * @returns {String} camelCased or vendor specific name if found in host styles
       */
      cssStyleName: function (name) {
        if (name) {
          var camelcasedName = $.camelCase(name);
          if (camelcasedName in _styles) {
            return camelcasedName;
          } else if (($.cssProps[name] || ($.cssProps[name] = vendorPropName(camelcasedName))) in _styles) {
            return $.cssProps[name];
          }
        }
      }
    });

    $.stylesheet.fn = $.stylesheet.prototype = {
      /**
       * @function jQuery.stylesheet.fn.init
       * Initializes a jQuery.stylesheet object.
       * Selects a list of applicable CSS rules for given selector.
       * @see jQuery.stylesheet.cssRules
       * @param {String|Array|Object} selector CSS rule selector text(s)
       * with optional stylesheet filter(s)
       */
      init: function (selector) {
        var rules = []; /**< Array of CSSStyleRule objects matching the selector initialized with */

        switch ($.type(selector)) {
          case 'string':
            rules = $.stylesheet.cssRules(selector);
            break;
          case 'array':
            $.each(selector, function (idx, val) {
              if ($.type(val) === 'string') {
                $.merge(rules, $.stylesheet.cssRules(val));
              } else if (val instanceof CSSStyleRule) {
                rules.push(val);
              }
            });
            break;
          case 'object':
            if (selector instanceof CSSStyleRule) {
              rules.push(val); // TODO: val undefined
            }
            break;
        }

        $.extend(this, {
          /**
           * @function jQuery.stylesheet.rules
           * @returns {Array} Copy of array of CSSStyleRule objects used
           * by this instance of jQuery.stylesheet 
           */
          rules: function () {
            return rules.slice();
          },

          /**
           * @function jQuery.stylesheet.css()
           * @param {String|Array|Object} name Name of style property to get/set.
           * Also accepts array of property names and object of name/value pairs.
           * @param {String} value If defined, then value of the style property
           * is updated with it. Unused when name is an object map.
           * @returns {jQuery.stylesheet|String|Object} A new jQuery.stylesheet object
           * if name/value is not passed, or value of property or object of name/value pairs
           */
          css: function (name, value) {
            var self = this, styles = undefined;

            switch ($.type(name)) {
              case 'null':
                $.each(rules, function (idx, rule) {
                  deleteRule.call(rule.parentStyleSheet, rule);
                });
                //NOTE: Safari seems to replace the rules collection object on insert/delete
                //      Refresh our private collection to reflect the changes
                rules = $.stylesheet.cssRules(selector);
                return self;
              case 'string':
                var stylename = $.stylesheet.cssStyleName(name);
                if (stylename) {
                  if (rules.length === 0 && value !== undefined) {
                    var filters = parseSelector(selector),
                      sheet = $(document.styleSheets).filter(function () {
                        return filterStyleSheet(filters.styleSheet, this);
                      });
                    sheet = (sheet && sheet.length == 1) ? sheet[0] : _sheet;
                    insertRule.call(sheet, filters.selectorText, name + ':' + value + ';');
                    //NOTE: See above note on Safari
                    //      Also, IE has different behaviour for grouped selectors 
                    rules = $.stylesheet.cssRules(selector);
                    styles = self;
                  } else {
                    $.each(rules, function (i, rule) {
                      if (rule.style[stylename] !== '') {
                        if (value !== undefined) {
                          rule.style[stylename] = value;
                          styles = self;
                        } else {
                          styles = rule.style[stylename];
                        }
                        return false;
                      }
                    });
                    if (styles === undefined && value !== undefined) {
                      rules[0].style[stylename] = value;
                      styles = self;
                    }
                  }
                }
                break;
              case 'array':
                styles = {};
                $.each(name, function (idx, key) {
                  styles[key] = self.css(key, value);
                });
                if (value !== undefined) {
                  styles = self;
                }
                break;
              case 'object':
                $.each(name, function (key, val) {
                  self.css(key, val);
                });
                return self;
              default: /*undefined*/
                return self;
            }

            return styles;
          }
        });
      }
    };
  }));
});

//MARK: HotFix
/*
 * Collection of fixes that apply to core Doh modules that aren't core itself.
 * We cannot make the core work with old stuff. Instead, we upgrade the old stuff to work with the new core
 */
// fix append_phase
Doh.HotFix(Doh.ApplyFixes, function () {
  /*
   * Fixes for changing append_phase to html_phase
   */
  Doh.meld_objects(Doh.WatchedKeys, {
    append_phase: { rename: 'html_phase' },
    pre_append_phase: { rename: 'pre_html_phase' }
  });
  Doh.meld_objects(Doh.WatchedPhases, {
    append_phase: { rename: 'html_phase' },
  });
});
// fix old parenting system
Doh.HotFix(Doh.ApplyFixes, function () {
  Doh.meld_objects(Doh.WatchedKeys, {
    skip_auto_build: { rename: 'skip_being_built' },

    auto_built: { rename: 'built' },
    _auto_built_by: { rename: 'builder' },
    _auto_built_by_name: { rename: 'my_property_on_builder' },

    machine_children: { rename: 'machine_built' },
    machine_children_to: { rename: 'machine_built_to' },

    parent: { rename: 'builder' },

    parenting_phase: { rename: 'builder_phase' },
    pre_parenting_phase: { rename: 'pre_builder_phase' },
    // children:           {run:function(idea){
    //   if(!Doh.SeenKeys['children'][idea.pattern] && (!Doh.HasReported['children'] || !Doh.ReduceWarnings)) Doh.warn('"',idea.pattern,'" has children. (module:',Doh.PatternModule[idea.pattern],')');
    //   Doh.HasReported.children = true;
    // }},
  });
  Doh.meld_objects(Doh.WatchedPhases, {
    parenting_phase: { rename: 'builder_phase' },
  });
});
// fix old pattern names for html_image and checkbox2
// fix the old reference to attr that should be attrs
Doh.HotFix(Doh.ApplyFixes, function () {
  /*
    * Fixes for old pattern names that live in /doh_js/html
    */
  /*
Doh.meld_objects(Doh.WatchedPatternNames, {
  //html_image:{rename:'image'},
  //checkbox2:{rename:'checkbox_click',throw:'find the clicks!'},
});
*/
  Doh.meld_objects(Doh.WatchedKeys, {
    attrs: { rename: 'attr' },
  });
});


//MARK: html Module
Doh.Module('html', [
  'jqueryui',
  // 'browser?? optional ^/core.css',
  'browser?? stylesheet',
  'object_utils',
  'html_patterns',
  'html_jquery_patterns'
], function () {

  if (IsBrowser()) {

    var jWin = jQuery(window);
    var $ = jQuery;
    //MARK: get_dobj
    /**
     *  @brief Turns a string or jquery object into a doh object
     *
     *  @param [in] e jQuery String Selector, jQuery Selector Object, or Doh Object
     *  @return Doh Object or empty jQuery Selector Object
     */
    Doh.get_dobj = function (e, pattern = 'html', phase = 'builder_phase') {
      let object = e;
      if (typeof e == 'string') {
        // if it's a string, then it's a jquery selector
        object = $(e);
      }
      if (object instanceof jQuery) {
        // if it's a jquery object, find the dobj that built it
        if (object[0]) {
          if (object[0].dobj) object = object[0].dobj;
          // or make a new one for it
          // TO ANDY: I don't think we use this and I don't really like it.
          // test raising warning
          else {
            //Doh.warn('Doh.get_dobj(',e,") found a jQuery object that we didn't build.");
            let oparent = object.parent();
            object = New({ pattern: pattern, e: object, builder: oparent, html_parent: oparent }, phase);
          }
        }
        // the jQuery selector object is empty, we didn't find an actual element
        else object = false;
      }
      if (!InstanceOf(object)) {
        Doh.warn('Doh.get_dobj could not find a doh object with:', e);
      }
      // in any case, at least return e
      return object || e;
    };

    Doh.OnWindowResizeListeners = {};
    /**
     *  @brief Refresh this window's cached sizes and boxes
     *
     *  @return the cache object
     *
     *  @details N/A
     */
    Doh.refresh_win = function () {
      // cache the window size on doh
      // window h/w is happily consistent

      const DWS = Doh.WindowSizes = Doh.win = { w: jWin.width(), h: jWin.height() };
      // floor to err on the size of fitting
      // we stash this to keep from dividing by 2 as much as possible
      DWS.w2 = Math.floor(DWS.w * 0.5);
      DWS.h2 = Math.floor(DWS.h * 0.5);

      // In HTML land, the x,y coords 0,0 are in the top,left of the screen
      DWS.box = {
        t: 0,
        l: 0,
        r: DWS.w,
        b: DWS.h
      }

      // stash 'full' and 'half' css objects for jQuery and target_offset
      DWS.css = { top: DWS.h, left: DWS.w };
      DWS.center = { top: DWS.h2, left: DWS.w2 };
      return DWS;
    };
    // refresh the window sizes as soon as possible
    Doh.refresh_win();

    //MARK: find_controller
    // AA: describe how this relates to the control phase
    // Also, this is an example of a developer-facing method (as opposed to internal build machinery) -- should we have a naming convention to make that difference clear?
    // NOTE: get_controller_from_parents
    Doh.find_controller = function (object, previous_objectAsjQuery) {
      // if the object is not of doh, then return false
      //NOTE: this keeps controls from cascading past their defined parents (e.g.: into vanilla html that contaiins them)
      //if(!InstanceOf(object)) return false;
      let objectAsjQuery;
      let parent, parentAsjQuery, previous_object;
      // we passed in a jquery object, trying to find it's doh controller
      if (object instanceof jQuery) {
        // note the parent as jquery for later
        parentAsjQuery = object.parent();
        // same for object
        objectAsjQuery = object;
        // even though we passed in a jquery, still try to resolve it to doh
        if (objectAsjQuery[0] && objectAsjQuery[0].dobj) object = objectAsjQuery[0].dobj;
      }
      // even if we passed in a jquery, try to resolve the parent to doh too
      if (parentAsjQuery && parentAsjQuery[0]) {
        parent = parentAsjQuery[0];
        // trying to find a good .builder before continuing
        if (parent.dobj && !object.builder) {
          object.builder = parent.dobj;
        }
      }

      if (object.builder) {
        //if the parent is a controller, use that
        if (object.builder.is_controller) return object.builder;
        //otherwise, if the parent HAS a controller, use that
        if (object.builder.controller) return object.builder.controller;
        //otherwise, search for a controller
        return Doh.find_controller(object.builder);
      }

      if (parentAsjQuery && parentAsjQuery[0] && objectAsjQuery[0]) {

        parent = parentAsjQuery[0];

        object = objectAsjQuery[0];

        previous_object = previous_objectAsjQuery ? previous_objectAsjQuery[0] : false;

        if (parent !== previous_object && parent !== object && object !== previous_object) {
          return Doh.find_controller(parentAsjQuery, objectAsjQuery);
        }
      }
      // we have no parent, or we found no controller
      return false;
    };

    //MARK: Pattern
    // AA: We should explain how css fits into the Doh development workflow
    // AA:  that can mostly go in the README buy maybe some breadcrumbs here?
    let originalPatternize = Doh.Pattern;
    let stylesheetElement = $('#dynamic');
    // if the stylesheet element does not exist, create it
    if (!stylesheetElement.length) {
      stylesheetElement = $('<style id="dynamic"></style>');
      $('body').prepend(stylesheetElement);
    }

    /**
     * This function overloads the original Pattern implementation to create dynamic CSS styles
     * from pattern definitions. When a pattern is created with CSS properties or style attributes,
     * it processes them as follows:
     * 
     * 1. Creates a unique CSS class name based on the pattern name (e.g., 'doh-patternName')
     * 2. Extracts CSS properties from both the 'css' object and 'style' string attribute
     * 3. Automatically adds 'px' to numeric values (except for z-index and opacity)
     * 4. Adds the generated CSS class to a stylesheet in the DOM (#dynamic)
     * 5. Adds the class name to the pattern's classes array
     * 6. Stores original CSS/style in initial_css/initial_style for reference
     * 7. Clears the css/style properties to prevent duplication
     * 
     * This approach allows for consistent styling across all instances of a pattern while
     * maintaining efficient DOM manipulation by leveraging CSS classes rather than inline styles.
     * 
     * @param {String} name - Name of the pattern
     * @param {String|Array} inherits - Parent pattern name(s) to inherit from
     * @param {Object} idea - Properties and methods for the pattern
     * @returns {Object} The created pattern
     */
    Pattern = Doh.Pattern = function (name, inherits, idea) {
      //let off = function(name, inherits, idea) {
      const newPattern = originalPatternize(name, inherits, idea);
      if (!newPattern) return;
      if (NotEmptyObject(newPattern.css) || HasValue(newPattern.style)) {
        // build a class from .css and .style here
        // create a class name
        let className = 'doh-' + newPattern.pattern;
        const newCSS = {};
        //newPattern.css_old = Doh.meld_objects({},newPattern.css);
        //newPattern.style_old = newPattern.style;
        //newPattern.pattern_styles_old = newPattern.pattern_styles;
        // get styles, if any
        if (newPattern.style) {
          newPattern.style.split(';').forEach((a) => {
            //var oldPatterrn = newPattern;
            const b = a.split(':');
            if (HasValue(b[0]) && HasValue(b[1])) {
              newCSS[(b[0]).trim()] = b[1].trim();
            } else {
              //Doh.warn('Patterns failed parsing: '+ a);
            }
          });
        }

        for (const i in newPattern.css) {
          if (i === 'z-index') continue;
          if (i === 'opacity') continue;
          if (IsNumber(newPattern.css[i])) {
            // this is literally what jquery does too.
            newPattern.css[i] = newPattern.css[i] + 'px';
            //Doh.warn('Pattern (' + newPattern.pattern + ')found css number for: ' + i + ' of: ' + newPattern.css[i] + ' .', 'The value may be ignored!' , newPattern);
          }
        }

        // get css, if any;
        Doh.meld_objects(newCSS, newPattern.css);

        // add our class to a stylesheet
        newPattern.stylesheet_class = $.stylesheet('#dynamic  {.' + className + '}');

        newPattern.stylesheet_class.css(newCSS);
        // add our class to the pattern's classes
        newPattern.classes = Doh.meld_arrays(newPattern.classes || [], [className]);
        // clear the properties so they aren't added to the final object
        newPattern.initial_css = newPattern.css;
        newPattern.css = {};
        if (newPattern.style) {
          newPattern.initial_style = newPattern.style;
          newPattern.style = '';
        }

        newPattern.moc = Doh.meld_objects(newPattern.moc || {}, {
          initial_css: 'object'
        });

      }
      return newPattern;
    }


    //MARK: fix_untitled_controls
    Doh.fix_untitled_controls = function () {
      // if doh previously identified things that it constructed which did not have a title
      if (Doh.UntitledControls) {
        console.groupCollapsed('Doh.fix_untitled_controls Returned:');
        let DUC;
        for (const id in Doh.UntitledControls) {
          DUC = Doh.UntitledControls[id];
          // we are still a control?
          if (DUC.control) {
            // did we set a title?
            if (DUC.attr.title) {
              // ok, so something set our title, is it at least not empty string on the actual DDM object?
              if (IsEmptyString(DUC.e.attr('title'))) {
                // so we wanted it to be set but it's empty on the DOM object, fix that:
                console.log('Tooltip title was set BUT it was deleted. Restored to the value originally set.', DUC.id, 'Pattern:', DUC.pattern, '.control:', DUC.control);
                DUC.e.attr('title', DUC.attr.title);
              }
            } else {
              // so we didn't set a title, but did a title get set by someone else?
              if (!DUC.e.attr('title')) {
                // no title was set and it was never updated up to this point
                console.log('Tooltip title was not set AND it was never updated. Set to .control', DUC.id, 'Pattern:', DUC.pattern, '.control:', DUC.control);
                DUC.e.attr('title', DUC.control);
              } else {
                // a title was not defined by us, but someone updated us to have one, which somehow seems fine for now
                console.log('Tooltip title was not set BUT it was updated later. Abort.', DUC.id, 'Pattern:', DUC.pattern, '.control:', DUC.control);
              }
            }
          }
        }
        console.groupEnd();
      }
    }

  }

  // AA:  A good place for an essay about the control system
  //MARK: control Pattern
  Pattern('control', 'object', {
    // advance the children machine to this phase when building
    machine_built_to: 'control_phase',
    // setup our phases for building controls
    moc: {
      control_phase: 'phase'
    },
    control_phase: function () {
      //let proto = Object.getPrototypeOf(this);
      if (!this.control) if (this.my_property_on_builder) this.control = this.my_property_on_builder;
      // if we have a control name
      if (this.control) {
        // find the controller
        const controller = Doh.find_controller(this);
        // if we find one, use it
        if (controller) {
          this.controller = controller;
        } else {
          // otherwise, use the parent with warning
          //Doh.warn('control:', this, 'could not find a controller. Use the builder:', this.builder, 'instead.');
          this.controller = this.builder;
        }
        // ensure that our newly assigned controller has controls storage
        this.controller.controls = this.controller.controls || {};
        // add ourself to it
        this.controller.controls[this.control] = this;
      }
    },
  });


  //MARK: doh_controller
  Pattern('doh_controller', 'html', {
    is_controller: true,
    control_phase: function () {
      let controllers = this.e.find('[doh-controller]');
      controllers.each((index, element) => {
        let $element = $(element);
        let controllerName = $element.attr('doh-controller');
        let dobj = Doh.get_dobj($element, 'html', 'builder_phase');
        dobj.is_controller = true;
        if (controllerName === 'true' || controllerName === '' || controllerName === 'false') {
          controllerName = $element.attr('id');
        }
        dobj.control = controllerName;
      });
      let controlElements = this.e.find('[doh-control]');
      controlElements.each((index, element) => {
        let $element = $(element);
        let controlName = $element.attr('doh-control');
        let dobj = Doh.get_dobj($element, 'html', 'builder_phase');
        dobj.control = controlName;
      });
      controllers.each((index, element) => {
        if (element.dobj.control) {
          element.dobj.machine('control_phase');
        }
      });
      controlElements.each((index, element) => {
        element.dobj.machine('control_phase');
      });
    }
  });

  const generateUniqueId = () => `dobj_${Doh.NewUUID()}`;

  //MARK: NewForHTML
  const NewForHTML = window.NewForHTML = Doh.NewForHTML = Doh.Globals.NewForHTML = function (pattern, idea) {
    //const phase = 'newforhtml_phase';
    if (LacksValue(idea)) idea = {};

    // create the object, but don't run the phases
    let object = New(pattern, idea, false);

    // replace the machine function with one that will run the newforhtml_phase explicitly
    object.machine = function () {
      const phase = 'newforhtml_phase';
      if (IsDefined(object.machine.completed[phase])) return object;
      object.machine.phase = phase;
      object.machine.completed[phase] = false;
      object[phase].apply(object);
      object.machine.completed[phase] = true;
      return object;
    };
    object.machine.completed = {};

    // Check for 'html' pattern
    if (InstanceOf(object, 'html')) {
      // this bespoke machine will only work if the object is an html pattern
      object.machine();
    }

    object.isForHTML = true;

    return object;
  };


  // AA:  A discussion of the interface between DOM elements and the html pattern should go here
  //MARK: html Pattern
  Pattern('html', ['parenting', 'control'], {
    moc: {
      // make classes unique during construction
      classes: 'array',
      // NOTE: css passed in by patterns will be sent to the pattern class
      css: 'object',
      attr: 'object',
      html_phase: 'phase',
      // this phase is not a real phase, but a replacement for phases during a NewForHTML call
      newforhtml_phase: 'method'
    },
    // e should be a jQuery [Element/Array]
    // or false for using a passed in selector
    e: false,
    // domobj will be the actual dom object
    domobj: false,
    // attr will be deep copied so it is safe to send in to any element modifier
    // this will become an observer-compatible Proxy system for traping .attr mechanics
    // currently implemented are: apply, get, set, has, ownKeys, getOwnPropertyDescriptor, defineProperty
    attr: {},
    // used when e = false and we are generating a new element
    tag: 'div',
    // provided for selectors
    // will be mimicked to .attr.id
    id: '',
    // should always be a number keyed array of classes, will be uniqued.
    // will be replaced with an array-like Proxy that sync's with the live DOM
    // most array operations are supported except sorting and splicing/slicing.
    // can be looped over, iterated, called as a function to add...
    classes: ['doh'],
    // this will become a .observe system that watches the value change to update the dom
    // it will have an additional getter added to it that always retrieves the latest value from the dom
    //style: '',
    // a link to the stylesheet class from $.stylesheet that controls pattern style classes.
    // needs to be false, since this is not available to instances
    //stylesheet_class: false,
    // css will be deep copied so it is safe to send in to any element modifier
    // this will become an observer-compatible Proxy system for traping .css mechanics
    // currently implemented are: apply, get, set, has, ownKeys, getOwnPropertyDescriptor, defineProperty
    css: {},
    // html content to be added before appending children
    // this will become a .observe system that watches the value change to update the dom
    // it will have an additional getter added to it that always retrieves the latest value from the dom
    //html: '',
    sizes: {},
    offsets: {},
    box: {},
    html_parent: false,

    //MARK: object_phase
    object_phase: function () {
      //let proto = Object.getPrototypeOf(this);
      const that = this;
      // ensure that the parent is a setting, already set,
      // or the body
      this.builder = this.builder || 'body';
      // convert to DohObject if we are a string selector
      if (IsString(this.builder)) {
        this.builder = Doh.get_dobj(this.builder);
      }
      // ensure that the element is a setting, already set, or a new jQuery element using this.tag
      this.e = this.e || $(document.createElement(this.tag));
      if (IsString(this.e)) {
        // if it's a string, then it's a jquery selector
        this.e = $(this.e);
      }

      // stash our dom object so we don't have to keep getting it over and over
      this.domobj = this.e[0];
      // stash ourself on the DOM object for the Doh.get_dobj() function later
      this.domobj.dobj = this;

      if (this.stylesheet_class) delete this.stylesheet_class;

      // patterns don't use css anymore, so this must be from the idea
      const idea_css = this.css,
        clist = this.domobj.classList,
        // create references for the proxies
        initial_classes = this.classes,
        _classes = function () { },
        _css = function () { },
        _attr = function () { };
      let initial_html = '';
      //initial_when = this.when || {},

      // store the css and attributes coming in from idea phase
      // css may already be there from the patterns converting css to classes
      if (NotEmptyObject(idea_css)) {
        this.initial_css = Doh.meld_objects(this.initial_css || {}, idea_css);
      }
      // store the initial attr's set by the patterns and idea
      if (NotEmptyObject(this.attr)) {
        this.initial_attr = this.attr;
      }

      //MARK: classes proxy
      // make our new .classes property into a proxy that handles all our different use cases
      /**
       *  Classes can be added in the following ways:
       *    idea.classes[newClass1] = true;
       *    idea.classes[0] = newClass1;
       *    idea.classes(newClass1, newClass2, etc...);
       *    idea.classes.push(newClass1, newClass2, etc...);
       *    idea.classes.unshift(newClass1, newClass2, etc...);
       *  
       *  Classes can be checked in the following ways:
       *    if(newClass1 in idea.classes))
       *    if(idea.classes.indexOf(newClass1) > -1)
       *    if(idea.classes[newClass1] == true)
       *  
       *  Classes can be removed in the following ways:
       *    delete idea.classes[newClass1];
       *    delete idea.classes[0 (or index of class you want to delete)];
       *    delete idea.pop();
       *    delete idea.shift();
       *  
       *  Classes can be serialized in the following ways:
       *    serialized = idea.classes.toString();
       *    serialized = idea.classes + '';
       */
      this.classes = new Proxy(_classes, {
        apply: function (target, thisArg, argumentsList) {
          for (let i in argumentsList) {
            _classes[argumentsList[i]] = argumentsList[i];
            //Object.defineProperty(_classes, classname, {enumerable:true,configurable:true});
          }
          return clist.add(...argumentsList);
        },
        get: function (target, prop, receiver) {
          // this Symbol needs us to tell it what kind of thing this is
          // this needs to return 'Object' to be compatible with .observe and .mimic
          switch (prop) {
            case 'is_doh_proxy_property': return true;
            case Symbol.toStringTag:
              // trap the class toStringTag symbol and identify as an Object
              return 'Object';
              break;
            case Symbol.iterator:
              return clist.values();
              break;
            case 'prototype':
            case '__proto__':
              return [][prop];
              break;
            case 'push':
            case 'unshift':
              // trap the push/unshift and do our own:
              return function (...args) {
                that.classes(...args);
                return clist.length;
              };
              break;
            case 'pop':
              // trap the toString and do our own:
              return function () {
                const token = clist[clist.length - 1];
                delete that.classes[token]
                //clist.remove(token);
                return token;
              };
              break;
            case 'shift':
              // trap the toString and do our own:
              return function () {
                delete that.classes[clist[0]]
                //clist.remove(token);
                return clist[0];
              };
              break;
            case 'toString':
            case Symbol.toPrimitive:
              // trap the toString and do our own:
              return function () {
                return clist.value;
              };
              break;
          }
          // otherwise, get the value from the dom
          if (clist[prop]) {
            return clist[prop];
          }
          // or pass it through to the array
          if (IsFunction(Array[prop])) return Array[prop].bind(clist);

          // or we are asking about a class?
          if (clist.contains(prop)) {
            return true;
          }
          // or just let it bubble
          return Reflect.get(...arguments);
        },
        set: function (obj, prop, value) {
          // only actually set if the property is a number, everything else is not a value, but a property
          if (IsOnlyNumbers(prop)) {
            that.classes(value);
            return true;
          }
          // if the prop is a string with value, then add that
          if (IsStringAndHasValue(prop)) {
            // if the value is truthy, then we add
            if (value) that.classes(prop);
            // but if it's falsey, then we remove.
            else {
              _classes[prop] = undefined;
              clist.remove(prop);
            }
            return true;
          }
          return Reflect.set(obj, prop, value);
        },
        ownKeys: function (target) {
          // ownKeys wants an array with our properties and 'prototype'
          const rtn = Object.keys(Doh.meld_into_objectobject(clist));
          // custom ownKeys on anonymous functions need to passthrough the prototype but...
          // the engine seems to clip it off though, when we do things like iterate for loops
          rtn.push('length');
          rtn.push('prototype');
          return rtn;
        },
        getOwnPropertyDescriptor: function (target, prop) { // called for every property
          if (prop !== 'prototype' && prop !== 'length') {
            // detect forwarded properties from _classes and retrieve them instead
            if (IsStringAndHasValue(prop)) {
              const prop_desc = Object.getOwnPropertyDescriptor(_classes, prop);
              if (prop_desc) if (prop_desc.set) {
                return prop_desc;
              }
            }
            // otherwise our shortcut will work
            return {
              enumerable: true,
              configurable: true,
              value: clist[prop]
            };
          }
          // prototype is special and needs to match up with the original or it complains
          else return Reflect.getOwnPropertyDescriptor(target, prop);
        },
        defineProperty: function (target, prop, descriptor) {
          // forward property setters to _classes
          if (IsStringAndHasValue(prop)) {
            const rtn = Object.defineProperty(_classes, prop, descriptor);
            if (descriptor.set) {
              // defining the setter means Doh is setting up the handlers for the first time
              Doh.observe(_classes, prop, function (object, prop_name, new_value) {


                if (new_value) {
                  // if _css is different from the dom, try to change it once
                  // use the .e.css because we are inside .css already
                  clist.add(prop);
                } else {
                  clist.remove(prop);
                }

              });
            }
            return rtn;
          }
        },
        has: function (target, prop) {
          return clist.contains(prop);
        },
        deleteProperty: function (target, prop) {
          let classname;
          if (IsOnlyNumbers(prop)) {
            classname = clist[Number(prop)];
          }
          else if (IsStringAndHasValue(prop)) {
            classname = prop;
          }
          _classes[classname] = undefined;
          clist.remove(classname);
          return target;
        },
        getPrototypeOf: function (target) {
          return Array;
        }
      });

      Doh.meld_arrays(this.classes, initial_classes);



      const reserved_object_props = [
        'length',
        'prototype',
        'name',
        'apply',
        'call',
        'bind',
        'toString',
        'valueOf',
        'constructor',
        'hasOwnProperty',
        'is_doh_proxy_property',
        'isPrototypeOf',
        'propertyIsEnumerable',
        'toLocaleString'
      ];

      const reservedObjectPropToProxy = (prop) => {
        if (reserved_object_props.includes(prop)) return `__${prop}`;
        return prop;
      };

      const proxyToReservedObjectProp = (prop) => {
        if (prop.startsWith('__') && reserved_object_props.includes(prop.slice(2))) return prop.slice(2);
        return prop;
      };

      //MARK: css proxy
      // make our new .css property into a proxy that handles all our different use cases
      this.css = new Proxy(_css, {
        is_doh_proxy_property: true,
        // since we proxy a function, we can be used as one.
        // css({prop:val}) OR css(prop, val) OR css("prop:val;") or
        apply: function (target, thisArg, argumentsList) {
          if (argumentsList.length) {
            // we need to correct for the setters being affected by this call
            let prop = argumentsList[0], value = argumentsList[1];
            if (IsEmptyString(value)) {
              // an empty string means delete the property
              // update our cache to match this
              _css[prop] = undefined;
            }
            // a value indicates a set, tell our setters
            if (value) _css[prop] = value;
            // a string means that:
            //    we want it converted to a setter object first
            //    or we want to get the value
            else if (typeof prop === 'string') {
              if (prop.indexOf(':') > 0) {
                argumentsList[0] = prop = that.get_css_from_style(prop);
              }
              // if we don't convert prop above, then it won't be iterated below, which is correct for a get.
            }
            // if prop is enumerable, then it's a setter object
            if (typeof prop === 'object') {
              for (let prop_name in prop) {
                // trigger setters for everything inside, they do their own comparing.
                if (IsEmptyString(prop[prop_name])) {
                  // an empty string means delete the property
                  // update our cache to match this
                  _css[prop_name] = undefined;
                } else {
                  _css[prop_name] = prop[prop_name];
                }
              }
            }
            // finally call css and apply the args
            // jQuery still does so much for us, we just can't get away from it.
            return that.e.css.apply(that.e, argumentsList);
          } else return;
        },
        get: function (target, prop, receiver) {
          // this Symbol needs us to tell it what kind of thing this is
          // this needs to return 'Object' to be compatible with .observe and .mimic
          if (prop === Symbol.toStringTag) return 'Object';
          if (prop === 'is_doh_proxy_property') return true;
          // otherwise, get the computed value
          return that.e.css(prop);
        },
        set: function (obj, prop, value) {
          // call our own .css handler so setters will be triggered
          that.css(prop, value);
          return true;
        },
        ownKeys: function (target) {
          // ownKeys wants an array with our properties and 'prototype'
          const rtn = Object.keys(that.get_css_from_style());
          // custom ownKeys on anonymous functions need to passthrough the prototype but...
          // the engine seems to clip it off though, when we do things like iterate for loops
          rtn.push('prototype');
          return rtn;
        },
        getOwnPropertyDescriptor: function (target, prop) { // called for every property
          if (prop !== 'prototype') {
            // detect forwarded properties from _css and retrieve them instead
            const prop_desc = Object.getOwnPropertyDescriptor(_css, prop);
            if (prop_desc) if (prop_desc.set) {
              return prop_desc;
            }
            // otherwise our shortcut will work
            return {
              enumerable: true,
              configurable: true,
              value: that.domobj.style[prop]
            };
          }
          // prototype is special and needs to match up with the original or it complains
          else return Reflect.getOwnPropertyDescriptor(target, prop);
        },
        defineProperty: function (target, prop, descriptor) {
          // forward property setters to _css
          const rtn = Object.defineProperty(_css, prop, descriptor);
          if (descriptor.set) {
            // defining the setter means Doh is setting up the handlers for the first time
            Doh.observe(_css, prop, function (object, prop_name, new_value) {
              if (that.e.css(prop) == new_value) return;
              // if _css is different from the dom, try to change it once
              // use the .e.css because we are inside .css already
              that.e.css(prop, new_value);
            });
          }
          return rtn;
        },
        has: function (target, prop) {
          return (prop in that.get_css_from_style());
        },
        deleteProperty: function (target, prop) {
          that.css(prop, '');
          return target;
        },
      });

      //MARK: attr proxy
      this.attr = new Proxy(_attr, {
        is_doh_proxy_property: true,
        apply: function (target, thisArg, argumentsList) {
          if (argumentsList.length) {
            let prop = reservedObjectPropToProxy(argumentsList[0]), value = argumentsList[1];

            if (IsEmptyString(value) || value === null) {
              // an empty string means delete the property
              // update our cache to match this
              _attr[prop] = undefined;
              // attr needs null, so we fix it
              value = argumentsList[1] = null;
            }
            if (value) _attr[prop] = value;
            else if (typeof prop === 'object') {
              for (let prop_name in prop) {
                prop_name = reservedObjectPropToProxy(prop_name);
                // trigger setters for everything inside, they do their own comparing.
                if (IsEmptyString(prop[prop_name]) || value === null) {
                  // an empty string means delete the property
                  // update our cache to match this
                  _attr[prop_name] = undefined;
                } else {
                  _attr[prop_name] = prop[prop_name];
                }
              }
            }
            return that.e.attr.apply(that.e, argumentsList);
          } else return;
        },
        get: function (target, prop, receiver) {
          if (prop === Symbol.toStringTag) return 'Object';
          if (prop === 'is_doh_proxy_property') return true;
          if (reserved_object_props.includes(prop)) return Reflect.get(target, prop, receiver);
          return that.e.attr(prop);
        },
        set: function (obj, prop, value) {
          // set _attr so setters will be triggered
          // call our own .attr handler so setters will be triggered, fixes reserved object props for us
          return that.attr(prop, value);
        },
        ownKeys: function (target) {
          const domobj = that.domobj, rtn = [];
          if (domobj.hasAttributes()) {
            const attrs = domobj.attributes;
            for (let attribute of attrs) {
              rtn.push(attribute.name)
            }
          }
          // custom ownKeys on anonymous functions need to passthrough the prototype but...
          // the engine seems to clip it off though, when we do things like iterate for loops
          rtn.push('prototype');
          return rtn;
        },
        getOwnPropertyDescriptor: function (target, prop) { // called for every property
          if (prop !== 'prototype') {
            let prop_name = reservedObjectPropToProxy(prop);
            // detect forwarded properties from _attr and retrieve them instead
            const prop_desc = Object.getOwnPropertyDescriptor(_attr, prop_name);
            if (prop_desc) if (prop_desc.set) {
              return prop_desc;
            }
            // otherwise our shortcut will work
            return {
              enumerable: true,
              configurable: true,
              writable: true,
              value: that.e.attr(prop)
            };
          }
          // prototype is special and needs to match up with the original or it complains
          else return Reflect.getOwnPropertyDescriptor(target, prop);
        },
        defineProperty: function (target, prop, descriptor) {
          // forward property setters to _attr
          const fixed_prop = reservedObjectPropToProxy(prop);
          const rtn = Object.defineProperty(_attr, fixed_prop, descriptor);
          if (descriptor.set) {
            // defining the setter means Doh is setting up the handlers for the first time
            Doh.observe(_attr, fixed_prop, function (object, prop_name, new_value) {
              // we need to watch for changes and do something?
              if (that.e.attr(prop) == new_value) return;
              // if _attr is different from the dom, try to change it once
              // use the .e.attr because we are inside .attr already
              that.e.attr(prop, new_value);
            });
          }
          return rtn;
        },
        has: function (target, key) {
          return that.domobj.hasAttribute(key);
        },
        deleteProperty: function (target, prop) {
          that.attr(prop, null);
          return target;
        },
      });


      //MARK: style handler
      // stash any initial style
      if (this.style) {
        //initial_style
        this.initial_style = this.style;
      }
      // clear the property so it will trigger the new setter and actually set our initial styles
      this.style = '';
      // style is an old idea, lets fix it so that it's more useful
      // turn style into a getter/setter so it can be more handy for us
      Doh.observe(this, 'style', function (object, prop, new_value) {
        // we *could* just set the value, but we want to update our cache and
        // trigger .css setters for each property in the string.
        if (typeof new_value === 'string') that.css(new_value);
      });
      Object.defineProperty(this, 'style', {
        // if we have a setter, then we must have a getter
        // our fancy getter retrieves the original value storage, which
        // is the thing that gets updated.
        get: function () {
          return that.domobj.style.cssText;
        },
        // make this not enumerable because the data is technically duplicated from .css which is more reliable and useful
        enumerable: false,
        configurable: true,
      });
      // set style before css so it doesn't blow the css away
      if (this.initial_style) {
        // now use our super useful property
        this.style = this.initial_style;
      }

      // merge in idea css ( Don't move this, it needs to be after style is set )
      if (idea_css) this.css(idea_css);
      // apply initial attributes
      if (this.initial_attr) this.attr(this.initial_attr);

      // if we made it this far and still have no id, then we need to assign a new one
      if (this.e.length === 1 && !this.id) {
        // get the id from attributes
        this.id = this.attr.id;
        Doh.mimic(this, 'id', this.attr, 'id');
        // otherwise give it a new one
        if (!this.id) {
          this.id = 'dobj_' + Doh.new_id();
          // if we have to give it a new one, then we need to set the domobj too
          //this.attr('id', this.id);
          // now that the id is linked to the attr id, we don't need to update anything.
        }
      }

      //MARK: .html='' handler
      // stash initial html, if any
      if (this.html) initial_html = this.html;
      // clear the property so it will trigger the new setter and actually set our initial html
      this.html = '';
      // .html is an old idea, lets fix it so that it's more useful
      // turn style into a getter/setter so it can be more handy for us
      Doh.observe(this, 'html', function (object, prop, new_value) {
        // only try and set html if it's actually set to something
        if (NotEmptyString(new_value)) {
          if (that.e.html() != new_value) that.e.html(new_value);
        }
      });
      Object.defineProperty(this, 'html', {
        // if we have a setter, then we must have a getter
        // our fancy getter retrieves the original value storage, which
        // is the thing that gets updated.
        get: function () {
          return that.e.html();
        },
        // techincally this is duplicate data, but that's for you to figure out.
        enumerable: false,
        configurable: true,
      });
      // now use our super useful property
      if (initial_html) this.html = initial_html;

      Doh.mimic(this, 'attrs', this, 'attr');

      Object.defineProperty(this, 'attrs', {
        enumerable: false,
      });
    },

    get_css_from_style: function (style) {
      style = style || this.domobj.style.cssText;
      const rtn = {};
      if (typeof style === 'string') {
        style = style.trim();
        style.split(';').forEach((statement) => {
          if (statement) {
            const part = statement.split(':');
            if (part[0] && part[1]) {
              // pretrim part 1 (the value)
              part[1] = part[1].trim();
              // if the value is only a number or float, convert it to that, so it can be converted later if numbers are allowed
              rtn[part[0].trim()] = (IsOnlyNumbers(part[1]) ? Number(part[1]) : part[1]);
            }
          }
        });
      }
      return rtn;
    },

    //MARK: pre_builder_phase
    pre_builder_phase: function () {
      // we rely on children waiting to be appended,
      // stash the intended machine state and use 'control_phase'
      if (this.machine_built_to !== 'control_phase') {
        //let proto = Object.getPrototypeOf(this);
        this._machine_built_to = this.machine_built_to;
        this.machine_built_to = 'control_phase';
      }
    },
    //MARK: builder_phase
    builder_phase: function () {
      if (HasValue(this._machine_built_to)) {
        // if we stashed the intended state, restore it here
        this.machine_built_to = this._machine_built_to;
        // if this is already past then we need to be append phase
      } else {
        // tell the append to machine children to html_phase
        //let proto = Object.getPrototypeOf(this);
        this.machine_built_to = 'html_phase';
      }
    },
    //MARK: html_phase
    html_phase: function () {
      // convert the parent to a doh object if not already one
      if (typeof this.builder === 'string' || this.builder instanceof jQuery) {
        //Doh.warn('html_phase found a builder:',this.builder,'that was a string or jQuery instance');
        this.builder = Doh.get_dobj(this.builder);
      }

      // if this is a string, convert it to a jQuery object
      if (typeof this.e === 'string') {
        Doh.error('html_phase found a e:', this.e, 'that is a string');
        // it's too late for us to still have a string e. 
        // lots of stuff happens in object_phase that we missed now.
      }

      if (!this.builder?.e) {
        Doh.warn('html_phase found a parent:', this.builder, 'that has no .e:');
        this.builder = Doh.get_dobj(this.builder);
      }
      if (this.html_parent && this.html_parent instanceof jQuery) {
        this.html_parent.append(this.e);
      } else {
        // put in parent (can be used to relocate as well)
        this.builder.e.append(this.e);
      }

      if (this.built) this.machine_built(this.machine_built_to);

      if (this.control && !this.attr.title) {
        Doh.UntitledControls = Doh.UntitledControls || {};
        Doh.UntitledControls[this.id] = this;
      }

      if (Doh.ApplyFixes) {
        this.machine.completed.append_phase = true;
      }
    },
    is_visible: function () {
      return this.e.is(":visible");
    },


    //MARK: sizes and boxes
    // cache the sizes of the object for the current moment
    sizes: function () {
      //let proto = Object.getPrototypeOf(this);
      // jQuery outerWidth and outerHeight give us padding and border, but not margin
      // since doh is absolute position, only margin does NOT affect the layout
      // therefore, we must use the outer measurements to get acurate positions
      const s = this.size = { w: this.e.outerWidth(), h: this.e.outerHeight() };
      // store pre-halved values, so we can easily center
      s.w2 = s.w * 0.5;
      s.h2 = s.h * 0.5;

      // cache the internal size for containers
      const i_s = this.inner_size = { w: this.e.width(), h: this.e.height() };
      i_s.w2 = i_s.w * 0.5;
      i_s.h2 = i_s.h * 0.5;
      return this;
    },
    offsets: function () {
      //let proto = Object.getPrototypeOf(this);
      // cache the current jQuery offsets
      this.offset = this.e.offset();
      return this;
    },
    // cache the boxes of the object for the current moment
    boxes: function () {
      //let proto = Object.getPrototypeOf(this);
      //ensure that we have sizes and offsets
      this.sizes();
      this.offsets();
      const s = this.size, o = this.offset;
      // calculate the box against it's actual coords
      // cache a jQuery friendly set of targeted box offsets for use in .css calls
      this.box = {
        t: o.top,
        l: o.left,
        r: o.left + s.w,
        b: o.top + s.h,
        css: {
          top: o.top,
          left: o.left,
          width: s.w,
          height: s.h,
        }
      };
      return this.box;
    },

    get_style: function () {
      Doh.warn('.get_style is deprecated. Use this.style instead.', this.idealize());
      return this.style;
    },
    set_style: function (style) {
      Doh.warn('.set_style is deprecated. Use this.style instead.', this.idealize());
      this.style = style;
    },
    // set_css({prop:val}) OR set_css(prop, val) OR set_css("prop:val;")
    set_css: function (o, p = undefined) {
      if (!Doh.ReduceWarnings || !Doh.HasReported['set_css']) Doh.warn('.set_css(', o, ',', p, ') is deprecated. Use .css(', o, ',', p, ') instead', this.idealize());
      Doh.HasReported['set_css'] = true;
      return this.css(...arguments);
    },

    //MARK: pre_newforhtml
    pre_newforhtml_phase: function () {
      // object's object_phase is crucial as it fixes the moc, melded, and static properties
      this.inherited.object.object_phase.apply(this);
      // parenting's object_phase fixes the parent and builder references
      this.inherited.parenting.object_phase.apply(this);
      // parenting's pre_builder_phase fixes the .children array and builds the initial .children list
      this.inherited.parenting.pre_builder_phase.apply(this);
    },
    newforhtml_phase: function () {
      // iterate over `this`, 
      // using `this.moc` as the moc, 
      // assign `this` as the `builder`, blank reference from `builder` because the first layer is directly attached to builder
      //                          obj,  moc,      builder, parsable_reference_from_builder
      Doh.collect_buildable_ideas(this, this.moc, this, '');

      // we are building stuff, we need to be able to support it:
      // if we are in a built-chain, we need these
      if (this.built || this.builder) {
        // walk from me up the builder chain to find the method
        this.builder_method = function (method_name) {
          let bld = this.builder;
          while (bld) {
            if (IsFunction(bld[method_name]))
              return bld[method_name].bind(bld);
            bld = bld.builder;
          }
          return function () { Doh.warn('no builder method:', method_name) };
        };
        // walk from me up the builder chain to find the property
        this.builder_property = function (prop_name) {
          let bld = this.builder;
          while (bld) {
            if (IsDefined(bld[prop_name]))
              return bld[prop_name];
            bld = bld.builder;
          }
          return function () { Doh.warn('no builder property:', prop_name) };
        };
      }

      // now do the actual building
      if (this.built) {
        // me as a builder phase
        this.machine_built = function (phase) {
          // loop through the built and attempt to machine them
          let deep_this, deep_prop_name;
          for (let prop_name in this.built) {
            if (prop_name === 'length') continue;

            if (NotUndefined(this[prop_name])) {
              // if we have a property that is a valid value, attempt to build it
              this[prop_name] = this.built[prop_name] = NewForHTML(this[prop_name], phase);
            } else if (prop_name.indexOf('.') !== -1) {
              // parse ref
              ({ container: deep_this, prop: deep_prop_name } = Doh.parse_ref(this, prop_name));
              //                              obj,  deep ref,  count_back from the last reference
              //deep_this = Doh.parse_reference(this, prop_name, -1);
              // true to get back the last reference in prop_name
              //deep_prop_name = Doh.parse_reference(true, prop_name);
              // the above lets us alter the deep reference to our newly built/machined value
              // TODO: check to see if we already new'd this property
              deep_this[deep_prop_name] = this.built[prop_name] = NewForHTML(this.built[prop_name], phase);
            } else {
              throw Doh.error('this.built found no idea to build for supposed auto-built property:', prop_name);
            }

          }
        };
        this.machine_built(false);
      }

      // Generate or sync ID
      if (!this.id) {
        this.id = generateUniqueId();
      }
      this.inherited.idea.id = this.id;
      this.attr.id = this.id;
    },

    //MARK: toHTML
    toHTML: function () {
      // Generate minimal HTML
      let attrs = '';
      for (const attr in this.attr) {
        attrs += ` ${attr}="${this.attr[attr]}"`;
      }
      let classes = '';
      for (const class_name of this.classes) {
        classes += ` ${class_name}`;
      }
      // add a class for the doh-automatic-class
      classes += ' doh-' + this.pattern;
      let html = `<${this.tag || 'div'}${attrs}${classes ? ` class="${classes}"` : ''}>`;
      html += this.html || '';

      if (HasValue(this.built)) {
        for (const child_ref in this.built) {
          const child = this.built[child_ref];
          if (InstanceOf(child, 'html')) {
            html += child.toHTML();
          }
        }
      }

      html += `</${this.tag || 'div'}>`;
      return html;
    }
  });


  //MARK: Basic Patterns
  // AA:  It's a small thing, but I would move these html primitive upwards, so they are directly below 'html' itself.
  Pattern('span', 'html', { tag: 'span' });
  Pattern('input', 'html', {
    tag: 'input'
  });
  Pattern('input_value', {
    pre_builder_phase: function () {
      if (typeof this.value !== 'undefined') this.attr.value = this.value;
    }
  });
  Pattern('text', ['input', 'input_value'], {
    attr: { type: 'text' },
  });
  Pattern('password', ['input', 'input_value'], {
    placeholder: '',
    object_phase: function () {
      this.attr = { type: 'password', placeholder: this.placeholder };
    }
  });
  Pattern('hidden', ['input', 'input_value'], {
    attr: { type: 'hidden' }
  });
  Pattern('textarea', ['input'], {
    tag: 'textarea',
    attr: { spellcheck: 'false' },
    html_phase: function () {
      if (typeof this.value !== 'undefined')
        this.e.val(this.value);
    }
  });
  Pattern('click', 'html', {
    wait_for_mouse_up: false,
    css: { 'cursor': 'default', 'user-select': 'none' },
    html_phase: function () {
      if (this.click) {
        const that = this;
        if (this.wait_for_mouse_up) {
          this.e.mouseup(function () {
            return that.click.apply(that, arguments);
          });
        } else {
          this.e.mousedown(function () {
            return that.click.apply(that, arguments);
          });
        }
        // CHRIS -- test this
        // if the click function returns false, the click doesn't propagate
      }
    }
  });
  Pattern('button', ['click', 'disableable'], {
    tag: 'button',
    moc: { button_options: 'object' },
    button_options: {},
    pre_builder_phase: function () {
      if (typeof this.value !== 'undefined' && typeof this.button_options.label == 'undefined') this.button_options.label = this.value;
    },
    html_phase: function () {
      this.e.button(this.button_options);
    },
    change_title: function (wut) {
      this.html = wut;
      this.attr.title = wut;
    },
  });
  Pattern('disabled', 'html', {
    attr: { disabled: 'disabled' }
  });
  Pattern('disableable', 'html', {
    disable: function (aBool) {
      if (this.e)
        if (aBool) {
          //this.e.prop('disabled',true).css('opacity',0.3);
          this.e.addClass('ui-state-disabled');
        } else {
          //this.e.prop('disabled',false).css('opacity',1.0);
          this.e.removeClass('ui-state-disabled');
        }
    }
  });
  Pattern('disabled_text', ['text', 'disabled']);
  Pattern('select', ['input', 'disableable'], {
    tag: 'select',
    // special melding will handle special building too.
    options: {},
    html_phase: function () {
      if (this.value) {
        this.e.find("[value='" + this.value + "']").attr({
          selected: 'selected'
        });
      }
      if (this.change) {
        var that = this;
        this.e.bind('change', function () { that.change.apply(that, arguments) });
        //window.setTimeout(this.change, 0);
      }
    },
  });
  Pattern('option', 'element', {
    tag: 'option',
    html_phase: function () {
      if (typeof this.value !== 'undefined') this.e.val(this.value);
    }
  });
  Pattern('checkbox', ['input', 'input_value'], {
    attr: { type: 'checkbox' },
  });
  Pattern('field', 'element', {
    tag: 'span'
  });
  Pattern('label', 'element', {
    tag: 'span',
    set_html: function (s) {
      this.html = s;
      if (this.e.children().length < 1) {
        // set inner text
        // WARNING: this will overwrite children
        this.e.html(this.html);
      } else {
        Doh.warn(`set_html would have overwritten children with: "${this.html}"`, '\n', this);
      }
    }
  });
  Pattern('html_image', 'span', {
    src_path: false,
    tag: 'img',
    html_phase: function () {
      if (this.src_path)
        this.set_src(this.src_path);
    },
    set_src: function (src_path) {
      this.src_path = src_path;
      console.log('set_src', this.src_path);
      this.domobj.setAttribute('src', this.src_path);
    }
  });
  Pattern('fieldset', 'element', {
    tag: 'fieldset',
    pre_builder_phase: function () {
      var new_children = {};
      new_children.push({
        tag: 'legend',
        html: this.legend
      });
      for (var i in this.children) {
        if (i == 'length') continue;
        new_children[i] = this.children[i];
      }
      this.children = new_children;
    }
  });

  if (IsBrowser()) {
    $(window).resize(function (e) {
      Doh.refresh_win();
      for (var id in Doh.OnWindowResizeListeners) {
        Doh.OnWindowResizeListeners[id].window_resize.call(Doh.OnWindowResizeListeners[id], e);
      }
    });

    const jBody = $('body');
    Doh.body = New('html', { tag: 'body', e: jBody, builder: jBody.parent() }, 'object_phase');
  }
});


//MARK: jquery_patterns
Doh.Module('html_jquery_patterns', ['html_patterns', 'jqueryui'], function () {
  // AA: because this is my favorite pattern, can we move it up closer to a place of honor near 'html'?
  Pattern('dragX', 'element', {
    moc: {
      drag_start: 'method',
      drag_drag: 'method',
      drag_stop: 'method'
    },

    css: {
      cursor: "move"
    },

    is_dragging: false,
    dragOrTouchStart: function (event) {
      event.preventDefault();
      var offsetX, offsetY;

      if (event.type === 'touchstart') {
        offsetX = event.touches[0].clientX - this.e.offset().left;
        offsetY = event.touches[0].clientY - this.e.offset().top;
      } else {
        offsetX = event.clientX - this.e.offset().left;
        offsetY = event.clientY - this.e.offset().top;
      }

      this.is_dragging = true;

      this.drag_start(event, offsetX, offsetY);
    },

    dragOrTouchMove: function (event) {
      if (!this.is_dragging) return;
      event.preventDefault();
      var offsetX, offsetY;

      if (event.type === 'touchmove') {
        var touch = event.touches[0];
        offsetX = touch.clientX - this._startX;
        offsetY = touch.clientY - this._startY;
      } else {
        offsetX = event.clientX - this._startX;
        offsetY = event.clientY - this._startY;
      }

      this.drag_drag(event, offsetX, offsetY);
    },

    dragOrTouchEnd: function (event) {
      if (!this.is_dragging) return;
      event.preventDefault();
      this.drag_stop(event);
      this.is_dragging = false;
    },

    drag_start: function (event, offsetX, offsetY) {
      this._original_z_index = parseInt(this.e.css("z-index")) || 0;
      this.e.css({ 'z-index': 110 });
      this._startX = offsetX;
      this._startY = offsetY;
      console.log('drag start');
    },

    drag_drag: function (event, offsetX, offsetY) {
      this.e.css({
        left: offsetX + 'px',
        top: offsetY + 'px'
      });
      console.log('drag move');
    },

    drag_stop: function (event) {
      this.e.css({ 'z-index': this.css['z-index'] });
      this.e.css({ 'z-index': this._original_z_index });
      this._was_gedragged = true;
      console.log('drag end');
    },


    html_phase: function () {
      this.e.on({
        touchstart: this.dragOrTouchStart.bind(this),
        touchmove: this.dragOrTouchMove.bind(this),
        touchend: this.dragOrTouchEnd.bind(this),
        mousedown: this.dragOrTouchStart.bind(this),
        mousemove: this.dragOrTouchMove.bind(this),
        mouseup: this.dragOrTouchEnd.bind(this)
      });
    },

    enableDrag: function () {
      this.e.css({ 'touch-action': 'none' });
    },

    disableDrag: function () {
      this.e.css({ 'touch-action': 'auto' });
    }
  });


  Pattern('drag', 'element', {
    moc: {
      drag_start: 'method',
      drag_drag: 'method',
      drag_stop: 'method',
      contained: 'IsBoolean'
    },
    css: { cursor: "move" },
    contained: true,

    drag_start: function (event, ui) {
      // Store original z-index
      this._original_z_index = parseInt(this.e.css("z-index")) || 0;
      // Temporarily boost z-index by 1000 to hopefully make it sit above its peers
      this.e.css({ 'z-index': this._original_z_index + 1000 });
    },

    drag_drag: function (event, ui) {
      if (this.contained) {
        // Prevent browser viewport scrolling
        requestAnimationFrame(() => window.scrollTo(0, 0));
      }
    },

    drag_stop: function (e, f) {
      // Restore original z-index
      this.e.css({ 'z-index': this._original_z_index });
      // Flag that this element was dragged
      this._was_gedragged = true;
    },

    html_phase: function () {
      this.e.draggable({
        start: this.drag_start.bind(this),
        drag: this.drag_drag.bind(this),
        stop: this.drag_stop.bind(this),
      });
    },

    enableDrag: function () {
      this.e.draggable('enable');
    },

    disableDrag: function () {
      this.e.draggable('disable');
    }
  });


  Pattern('draggable', 'drag', {});
  Pattern('resizable', 'element', {
    moc: {
      resize_start: 'method',
      resize: 'method',
      resize_stop: 'method'
    },
    handles: 'e, s, se',
    minWidth: null,
    minHeight: null,
    maxWidth: null,
    maxHeight: null,
    grid: false,
    aspectRatio: false,
    resize_start: function (event, ui) {
    },
    resize: function (event, ui) {
    },
    resize_stop: function () {
    },
    html_phase: function () {
      if (InstanceOf(this, 'html_image') || this.tag == 'img') Doh.warn('resizable behaves oddly with <img> elements, it would be better to wrap it in a generic element and let THAT do the resizing (setting width and height of the nested <img> to 100%.')
      this.e.resizable({
        start: this.resize_start.bind(this),
        resize: this.resize.bind(this),
        stop: this.resize_stop.bind(this),
        handles: this.handles,
        minWidth: this.minWidth,
        minHeight: this.minHeight,
        maxWidth: this.maxWidth,
        maxHeight: this.maxHeight,
        grid: this.grid,
        aspectRatio: this.aspectRatio,
      });
    },
    enableResize: function () {
      this.e.resizable('enable');
    },
    disableResize: function () {
      this.e.resizable('disable');
    },
  });
  Pattern('hover', 'element', {
    moc: { hover_over: 'method', hover_out: 'method' },
    hover_over: function () { },
    hover_out: function () { },
    html_phase: function () {
      // make us hoverable
      this.e.hover(this.hover_over.bind(this), this.hover_out.bind(this));



      //window.setTimeout(this.hover_over, 0); // this fixes a race issue at launch but means hover will get called at launch one time
    },
  });
  Pattern('hover_delayed', 'element', {
    delay_time_ms: 600,
    moc: { hover_over: 'method', hover_out: 'method' },
    _timer: null,
    delays_hover_over: function () {
      let that = this;
      this._timer = setTimeout(function () {
        that.hover_over();
      }, this.delay_time_ms);
    },
    hover_over: function () {

    },
    hover_out: function () {
      clearTimeout(this._timer);
    },
    html_phase: function () {
      // make us hoverable
      this.e.hover(this.delays_hover_over.bind(this), this.hover_out.bind(this));
      //window.setTimeout(this.delays_hover_over, 0); // this fixes a race issue at launch but means hover will get called at launch one time
    },
  });
  Pattern('dialog', 'element', {
    moc: { dialog_options: 'object' },
    dialog_options: { height: 'auto', width: 'auto' },
    html_phase: function () {
      /*
        see https://api.jqueryui.com/dialog/ 

        position: {
            my: 'left',
            at: 'left',
            of: this.domobj
          },
         title: 'foo',
         classes: {
          "ui-dialog": "disrupter_site",
          "ui-dialog-titlebar": "disrupter_site",
          "ui-dialog-title": "disrupter_site",
          "ui-dialog-buttonpane": "disrupter_site",
        }
         Note:  there is a deprecated "dialogClass" option which should be avoided

      */
      this.e.dialog(this.dialog_options);
    }
  });
  Pattern('modal_dialog', 'dialog', {
    tag: 'pre',
    is_controller: true,
    on_close: function () { },
    perform_close: function () {
      this.e.dialog('close');
      this.on_close();
    },
    object_phase: function () {
      var aDialog = this;
      this.dialog_options = Doh.meld_objects(this.dialog_options || {}, {
        modal: 'true',
        buttons: {
          "OK": function () {
            aDialog.perform_close();
          }
        },

      });
    },
    html_phase: function () {
      var aDialog = this;
      this.e.keypress(
        function (event) {
          var keycode = (event.keyCode ? event.keyCode : event.which);
          if (keycode == 13) {
            aDialog.perform_close();
          }
        }
      );
    },
  });
  Pattern('slider', 'element', {
    moc: { slider_options: 'object' },
    slider_options: {},
    html_phase: function () {
      this.e.slider(this.slider_options);
    }
  });
});


//MARK: html_patterns
Doh.Module('html_patterns', ['object_utils'], function () {

  //TODO: FIL:
  Pattern('element', 'html');

  // AA:  we never use this.  is it the future or is it further entanglement with jquery?

  Pattern('HTMLPosition', 'html', {
    moc: { position: 'object' },
    position: {},
    place: function (opts) {
      opts = opts || this.position;
      let newOpts = {};
      if (InstanceOf(opts.of)) newOpts.of = opts.of.e;
      if (InstanceOf(opts.within)) newOpts.within = opts.within.e;
      this.e.position({ ...opts, ...newOpts });
    }
  });

  // AA:  This needs some explanation

  Doh.AnimationQueues = { doh: [] };
  Doh._AnimationQueues = {};
  Doh.animation_functionalizer = function (oThat, oAnim) {
    var that = oThat, anim = oAnim;

    var opts = Doh.meld_objects({}, { duration: 400 }, that.animation_options);

    if (typeof anim === 'string') {
      if (anim === 'delay') return function (next) { that.machine('animation_phase'); setTimeout(next, opts.duration) };
      return function (next) { that.machine('animation_phase'); that.e[anim]($.extend({}, opts, { complete: next })); };
    }

    if (typeof anim === 'function') {
      return function (next) { that.machine('animation_phase'); anim.apply(that); next(); };
    }

    return function (next) {
      that.machine('animation_phase');
      that.e.animate(anim, $.extend({}, opts, { complete: next }));
    };
  }
  Doh.run_animation_queue = function (queue_name) {
    if (!queue_name) {
      Doh.warn('Tried to start a "false" animation queue. (i.e.: Doh.run_animation_queue(). A queue_name is required)');
      return;
    }
    let queue = Doh.AnimationQueues[queue_name];
    if (Doh._AnimationQueues[queue_name]) {

      if (!Doh._AnimationQueues[queue_name][0]) {
        Doh._AnimationQueues[queue_name] = false;
        return;
      }
      var next = Doh._AnimationQueues[queue_name][0];
      Doh._AnimationQueues[queue_name] = Doh._AnimationQueues[queue_name].slice(1);
      next(Doh.run_animation_queue.bind(this, queue_name));

    } else {
      Doh._AnimationQueues[queue_name] = [];
      var q = false, j = 0;
      if (queue)
        for (var i = 0; i < queue.length; i++) {
          if (InstanceOf(queue[i])) {
            // it's a doh object,
            // the animation is either an array of animations,
            // or a single animation
            q = queue[i].animation;
            if (!Array.isArray(q)) q = [q];
            // its an array of animations
            j = 0;
            for (j; j < q.length; j++) {
              Doh._AnimationQueues[queue_name].push(Doh.animation_functionalizer(queue[i], q[j]));
            }
          }
        }
      Doh.run_animation_queue(queue_name);
    }
  }
  Pattern('animation_queue', 'object', {
    queue: false,
    animation: [],
    animation_options: {},
    moc: {
      animation_phase: 'phase',
      animation_options: 'object'
    },
    animation_phase: function () {
      this.queue = this.queue || 'doh';
      if (!Doh.AnimationQueues[this.queue]) Doh.AnimationQueues[this.queue] = [];
      Doh.AnimationQueues[this.queue].push(this);
    }
  });

  Pattern('animated_element', ['html', 'animation_queue'], {
    machine_built_to: 'animation_phase'
  });

  // AA: As we discussed, this guy should be migrated out of core
  Pattern('animated_next_button', ['animated_element', 'button', 'scenario_queue_stepper'], {
    animation: ['fadeIn'],
    click_queue: false,
    click_animation: ['fadeOut', function () { if (this.next_queue) Doh.run_animation_queue(this.next_queue); }],
    next_queue: false,
    moc: { click: 'method' },
    html_phase: function () {
      this.click_queue = this.click_queue || this.id + '_click';
      this.original_queue = this.queue;
      this.original_animation = this.animation;

      this.queue = this.click_queue;
      this.inherited.animation_queue.animation_phase.apply(this);
      this.queue = this.original_queue;
    },
    pre_click: function () {
      this.animation = this.click_animation;
    },
    click: function () {
      Doh.run_animation_queue(this.click_queue);
      this.animation = this.original_animation;
    }
  });


  // AA: As we discussed, this guy should be migrated out of core
  Pattern('select_with_other_field', 'select', {
    required_properties: {
      other_value: 'value of the option that shows "other" field when selected',
      other_selector: 'jquery selector for "other" field'
    },
    html_phase: function () {
      var that = this;
      var chg = function () {
        var form_dobj = that.e.parentsUntil('.form').parent()[0].dobj;
        var container = that.e.parent().parent();
        var other_field = container.find(that.other_selector);
        var value = that.e.val();
        if (value == that.other_value) {
          // if the select is on the "other" value, show the "other" field
          other_field.show();
        } else {
          // otherwise, clear the "other" field and hide it
          if (form_dobj.clear_fields) form_dobj.clear_fields(other_field);
          other_field.hide();
        }
      };
      this.e.bind('change', chg);
      window.setTimeout(chg, 0);
    }
  });
  Pattern('checkbox_click', 'checkbox', {
    html_phase: function () {
      //  this.e.button(this.button_options);
      if (this.click) {
        const that = this;
        this.e.click(function () { that.click.apply(that, arguments); });
      }
    },
  });
  Pattern('date', 'text', {
    available_properties: { 'value': 'string of the option value that should be default selected' },
    html_phase: function () {
      const that = this;
      this.e.removeClass('hasDatepicker');
      this.date_format = this.date_format || 'yy-mm-dd';
      this.e.datepicker({
        showOn: "focus",
        dateFormat: this.date_format,
        constrainInput: true,
        changeMonth: true,
        changeYear: true,
        minDate: '01/01/1900',
        yearRange: this.year_range || 'c-100:c',
        onClose: function (date_str) {
          if (date_str) that.e.val(date_str);
          that.e.trigger('input');
        }
      });
    }
  });
  Pattern('date_range_from', 'date', {
    html_phase: function () {
      const that = this;
      this.e.on('change', function () {
        $(that.date_range_to).datepicker("option", "minDate", date_range_get_date(this, that.date_format));
      });
    }
  });
  Pattern('date_range_to', 'date', {
    html_phase: function () {
      const that = this;
      this.e.on('change', function () {
        $(that.date_range_from).datepicker("option", "maxDate", date_range_get_date(this, that.date_format));
      });
    }
  });
  function date_range_get_date(e, dateFormat) {
    let date;
    try {
      date = $.datepicker.parseDate(dateFormat, e.value);
    } catch (error) {
      date = null;
    }
    return date;
  }
  //TODO: refactor for pre_builder_phase
  Pattern('form_messages', 'element', {
    pre_builder_phase: function () {
      var that = this;
      for (var i in this.messages) {
        this.children.push({
          pattern: 'form_msg',
          html: this.messages[i]
        });
      }
      setTimeout(function () {
        that.e.slideUp();
      }, 10000);
    }
  });
  Pattern('form_msg', 'element',);
  //TODO: refactor for pre_builder_phase
  Pattern('tabs', 'element', {
    tabs: {},
    required_properties: {
      'tabs': 'Object containing tabs, keyed by tab label, value is tab content'
    },
    pre_builder_phase: function () {
      var tab_labels = {}, tab_content = {}, active = '';
      for (var i in this.tabs) {
        this.tabs[i].css = { clear: 'both' };
        if (i === 'Normal') {
          active = 'active'
        } else {
          active = '';
          this.tabs[i].css.display = 'none';
        }
        this.tabs[i].id = 'tab_' + i + '_content';
        tab_content[i] = this.tabs[i];
        tab_labels[i] = {
          pattern: 'button',
          value: i,
          classes: [active],
          css: { float: 'left' },
          id: 'tab_' + i + '_button',
          name: i,
          html_phase: function () {
            var that = this;
            //var tab_labels_inner = tab_labels, tab_content_inner = tab_content;
            this.e.click(function () {
              //console.log(that);
              var cur_button, cur_content;
              for (var k in tab_content) {
                cur_button = $('#tab_' + k + '_button');
                cur_content = $('#tab_' + k + '_content');
                if (that.name == k) {
                  cur_button.addClass('active');
                  cur_content.show();
                } else {
                  cur_button.removeClass('active');
                  cur_content.hide();
                }
              }

            });
          }
        };
      }
      this.children = tab_labels;
      for (var j in tab_content) {
        this.children['tab_' + j + '_content'] = tab_content[j];
      }
    }
  });
});