//MARK: HotFix
// fix old melders
Doh.HotFix(Doh.ApplyFixes, function () {
  /*
   * Fixes for changing meld_arrays, meld_objects, meld_methods, and phases to .moc
   */
  var fix_old_melders = function (old_melder, meld_type, idea) {
    // fix old meld_ melders to be new .moc style
    idea.moc = idea.moc || {};
    if (idea[old_melder]) {
      // if there are meld_arrays
      if (idea[old_melder].length) {
        // walk the old meld_arrays
        for (let i in idea[old_melder]) {
          // add them to the new moc system
          idea.moc[idea[old_melder][i]] = meld_type;
        }
      }
    }
  }
  Doh.meld_objects(Doh.WatchedKeys, {
    meld_arrays: {
      // we only get run if there is a meld_arrays key
      run: fix_old_melders.bind(window, 'meld_arrays', 'array'),
      remove: true
    },
    meld_objects: {
      run: fix_old_melders.bind(window, 'meld_objects', 'object'),
      remove: true
    },
    meld_methods: {
      run: fix_old_melders.bind(window, 'meld_methods', 'method'),
      remove: true
    },
    phases: {
      run: fix_old_melders.bind(window, 'phases', 'phase'),
      remove: true
    },
    melded: {
      rename: 'moc',
    }
  });
});


//MARK: object Module
Doh.Module('object', function () {
  //console.log('object module loaded');
 });


//MARK: object_utils
Doh.Module('object_utils', ['object'], function () {
  // the stuff that object adds, or may add, which must be removed from meach loops

  //console.log('object_utils module loaded');

  let getAllProperties = function (obj) {
    let props = {};
    let currentObj = obj;

    while (currentObj) {
      Object.getOwnPropertyNames(currentObj).forEach((prop) => {
        try {
          props[prop] = currentObj[prop];
        } catch (e) { }
      });
      currentObj = Object.getPrototypeOf(currentObj);
    }

    return props;
  };

  //MARK: UUID
  Pattern('UUID', {
    moc: {
      KIN: 'STATIC',
    },
    UUID: '',
    KIN: {},
    object_phase: function () {
      if (LacksValue(this.UUID)) this.UUID = Doh.NewUUID();
      this.KIN[this.UUID] = this;
    },
  });

  Pattern('stateful', {
    moc: {
      moc: 'PRIV',
      pattern: 'PUB',

      STATEFUL_GUID: 'PUB',
      // global list of all stateful objects
      stateful_objects: 'static',
      dehydration_inventory: 'static',
      // initiate an update of the state object to reflect the live state of properties
      update_state: 'method',
      expose_references: 'method',
      // initiate a dehydration process for me and mine
      dehydrate: 'chain',
      // initiate a rehydration process for me and mine
      rehydrate: 'method',
      // stitch the references back together?
      stateful_phase: 'phase',
    },
    dehydration_inventory: new Set(),
    // all stateful objects
    stateful_objects: {},
    // a snapshot of the state, live, with references active
    state: {},

    STATEFUL_GUID: '',

    dehydrate_property: function (prop_name, types) {
      switch (prop_name) {

      }
    },
    rehydrate_property: function (prop_name, types) {

    },

    object_phase: function () {
      // if we are here and don't yet have a guid, make one
      if (!this.STATEFUL_GUID) this.STATEFUL_GUID = Doh.NewUUID();
      // add this object to the list of stateful objects
      this.stateful_objects[this.STATEFUL_GUID] = this;
    },

    reset_inventory: function () {
      this.moc.__.base('dehydration_inventory').dehydration_inventory = new Set();
    },

    stringify: function () {

      this.moc.__.pub(['STATEFUL_GUID', 'pattern']);
      //this.moc.__.sync();

      // clear the inventory
      this.reset_inventory();
      this.expose_references();

      this.reset_inventory();
      this.update_state();

      this.reset_inventory();
      // dehydrate the state
      let dehydrated = this.dehydrate();

      this.reset_inventory();
      let string = JSON.stringify(dehydrated);

      return string;
    },

    // dehydrate the state
    expose_references: function () {
      // if we are not already dehydrating, start the process
      if (this.dehydration_inventory.has(this)) {
      } else {
        if (InstanceOf(this, 'stateful')) {
          this.moc.__.pub(['STATEFUL_GUID', 'pattern']);
          //this.moc.__.sync();
        }
        this.dehydration_inventory.add(this);
      }

      let prop_name, real_prop;
      for (prop_name in this.moc.__.all_properties()) {
        real_prop = this[prop_name];
        if (IsObjectObject(real_prop) && InstanceOf(real_prop, 'stateful')) {
          // if this property is already in the inventory, then we need to tell it to store it's guid
          if (this.dehydration_inventory.has(real_prop)) {
            continue;
            if (InstanceOf(real_prop, 'stateful')) {
              //real_prop.moc.__.pub(['STATEFUL_GUID','pattern']);
              //real_prop.moc.__.sync();
              //console.log('real_prop:',real_prop);
              //state_temp[prop_name] = 'STATEFUL_GUID:'+real_prop.guid;
              continue;
            } else {
              Doh.warn('stateful.dehydrate() found AND SKIPPED a circular AND non-stateful object in the state:', real_prop);
              continue;
            }
          }

          this.dehydration_inventory.add(real_prop);

          if (NotUndefined(real_prop.expose_references) && IsFunction(real_prop.expose_references)) {
            real_prop.expose_references();
          }
        }
      }
      //this.update_state();
    },
    // update the state object to reflect the live state of properties
    update_state: function () {
      let state = this.state = {};
      //if(IsObjectObject(state)){
      // make the state of the object reflect the state of the moc definitions
      this.moc.__.sync();
      // pub keys is a list of keys that re public
      let prop_name, this_prop;
      for (prop_name of this.moc.__.pub_keys()) {
        this_prop = this[prop_name];
        if (IsObjectObject(this_prop) && InstanceOf(this_prop, 'stateful')) {
          if (this.dehydration_inventory.has(this_prop)) {
            // just a simple ref copy keeps us from endless recursion
            state[prop_name] = this_prop;
            continue;
          }

          this.dehydration_inventory.add(this_prop);

          if (this_prop) if (IsFunction(this_prop.update_state)) {
            state[prop_name] = this_prop.update_state();
            continue;
          }
        }
        state[prop_name] = this_prop;
      }

      //}
    },
    dehydrate: function (state_temp = {}) {
      let real_prop;
      for (let prop_name in this.state) {
        real_prop = this[prop_name];
        if (IsObjectObject(real_prop) && InstanceOf(real_prop, 'stateful')) {
          // if this property is already in the inventory, then we need to tell it to store it's guid
          if (this.dehydration_inventory.has(real_prop)) {
            if (InstanceOf(real_prop, 'stateful')) {
              state_temp[prop_name] = 'STATEFUL_GUID:' + real_prop.STATEFUL_GUID;
              continue;
            } else {
              Doh.warn('stateful.dehydrate() found AND SKIPPED a circular AND non-stateful object in the state:', real_prop);
              continue;
            }
          } else {
            this.dehydration_inventory.add(real_prop);
          }
        }
        if (NotUndefined(real_prop.dehydrate) && IsFunction(real_prop.dehydrate)) {
          state_temp[prop_name] = real_prop.dehydrate();
          continue;
        }

        state_temp[prop_name] = real_prop;
      }
      return state_temp;
    },

    rehydrate: function (dehydrated_state) {
      //let state_temp = JSON.parse(dehydrated_state);
      let state_temp = dehydrated_state;
      let state_prop;
      for (let prop_name in state_temp) {
        state_prop = state_temp[prop_name];
        if (IsString(state_prop)) {
          if (state_prop.startsWith('STATEFUL_GUID:')) {
            state_prop = state_prop.replace('STATEFUL_GUID:', '');
            this[prop_name] = state_temp[prop_name] = this.stateful_objects[state_prop];
            //continue;
          }
          if (NotUndefined(this[prop_name]) && NotUndefined(this[prop_name].rehydrate) && IsFunction(this[prop_name].rehydrate)) {
            let closed_state = state_temp[prop_name];
            delete state_temp[prop_name];
            this[prop_name] = this[prop_name].rehydrate(closed_state);
            continue;
          }
        }
        this[prop_name] = state_temp[prop_name];
      }
      this.moc.__.sync();
    },



  });

  Pattern('stateful_history', 'stateful', {
  });

  Pattern('dict', 'stateful', {
    pre_update_state: function () {
      this.moc.__.sync_moc(Object.keys(this));
    },
  });

  // NOTE: DO NOT INHERIT THIS PATTERN
  Pattern('dict_filter', 'object', {
    // will be added by New()
    machine: true,
    inherits: true,
    inherited: true,
    // will be added by dict
    each: true,
    // may be added by object during object_phase
    built: true,
    builder: true,
    my_property_on_builder: true,
    machine_built: true,
    machine_built_to: true,
    // may be added by debug mode during New
    watch: true,
  });

  /**
   *  A place to house things that we no longer want in core, but don't yet have another home
   */
  Doh.meld_objects(Doh, {
    // USED BY: node (node is horribly named)
    /**
     *  @brief Get a new id
     *
     *  @return A new ephemeral id
     *  
     *  @details IDs are a simple way to get ephemeral indexes that reset on each page load
     */
    NewIdCounter: 0,
    new_id: function () {
      return this.NewIdCounter += 1;
    },

    // USED BY: doh inspector?
    /**
     *  @brief return the execution order of a melded method by name on an object
     *  
     *  @param [in] object [object] a DohObject to inspect
     *  @param [in] method [string] name of method to expose
     *  @return an array of 'inherited_pattern.pre_method/method' for each pattern that implements this method name
     *  
     *  @details [examples?]
     */
    get_melded_method_order: function (object, method) {
      const meld_method_order = [], pre_meld_method_order = [];
      for (const i in object.inherited) {
        if (object.inherited[i]['pre_' + method]) pre_meld_method_order.push(i + '.pre_' + method);
        if (object.inherited[i][method]) meld_method_order.push(i + '.' + method);
      }
      return pre_meld_method_order.concat(meld_method_order);
    },
    /**
     *  @brief return the execution order of all phases on an object
     *  
     *  @param [in] object [object] a DohObject to inspect
     *  @return an array of 'inherited_pattern.pre_method/method' for each pattern that implements each phase
     *  
     *  @details [examples?]
     */
    get_phase_method_order: function (object) {
      const phases_method_order = [];
      for (const melded_prop in object.moc) {
        if (object.moc[melded_prop] === 'phase') {
          phases_method_order.push(Doh.get_melded_method_order(object, melded_prop));
        }
      }
      return phases_method_order;
    },
    /**
     *  @brief return the execution order of all melded methods and phases on an object
     *  
     *  @param [in] object [object] a DohObject to inspect
     *  @return an array of 'inherited_pattern.pre_method/method' for each pattern that implements this method or phase
     *  
     *  @details [examples?]
     */
    get_all_melded_method_order: function (object) {
      const methods_order = [];
      let counter = 0, phase_methods = 0;
      for (const melded_prop in object.moc) {
        if (object.moc[melded_prop] === 'method' || object.moc[melded_prop] === 'phase') {
          methods_order.push(Doh.get_melded_method_order(object, melded_prop));
          counter += methods_order[methods_order.length - 1].length
        }
      }
      return methods_order;
    },
    /**
     *  @brief send the stringified code of a melded method to the Doh log
     *  
     *  @param [in] object [object] a DohObject to inspect
     *  @param [in] method [string] the name of a method to look for
     *  @return nothing
     *  
     *  @details This method is only meant for debugging, is it needed in core?
     */
    log_melded_method_string: function (object, method) {
      const method_array = Doh.get_melded_method_order(object, method);
      for (const i in method_array) {
        console.log(method_array[i], object.inherited[method_array[i].split('.')[0]][method].toString());
      }
    },
    /**
     *  @brief send a clickable list of the melded methods to the Doh log
     *  
     *  @param [in] object [object] a DohObject to inspect
     *  @param [in] method [string] the name of a method to look for
     *  @return nothing
     *  
     *  @details This method is only meant for debugging, is it needed in core?
     */
    log_melded_method_source: function (object, method) {
      const method_array = Doh.get_melded_method_order(object, method);
      for (const i in method_array) {
        console.log(method_array[i], object.inherited[method_array[i].split('.')[0]][method]);
      }
    },

    // USED BY: unsure? but i think these are used -CHRIS
    /**
     *  @brief 
     *  
     *  @param [in] idea Description for idea
     *  @param [in] args Description for args
     *  @return Return description
     *  
     *  @details args.exclude_methods, args.truncate_methods, args.exclude_children
     */
    idea_to_yaml: function (idea, args) {
      const ic = this.idea_to_ideacode(idea, args);
      return jsyaml.load(ic);
    },
    /**
     *  @brief 
     *  
     *  @param [in] idea Description for idea
     *  @param [in] args Description for args
     *  @return Return description
     *  
     *  @details args.exclude_methods, args.truncate_methods, args.exclude_children
     */
    idea_to_ideacode: function (idea, args) {

      let trailing_comma = '';

      let str = (Array.isArray(idea) ? '[' : '{');

      for (const i in idea) {
        if (i == 'prototype' || i == '__proto__') { continue; }
        if (idea[i] instanceof Doh.Globals.jQuery) { continue; }
        if (InstanceOf(idea[i])) { continue; }
        if (args) {
          if (args.exclude_methods) { if (typeof idea[i] == 'function') continue; }
          if (args.exclude_children) { if (i == 'children') continue; }
        }

        str = str + trailing_comma;
        trailing_comma = ',';

        if (!Array.isArray(idea)) str = str + '"' + i + '":';

        switch (typeof idea[i]) {
          case 'function':
            if (args) if (args.truncate_methods) {
              str = str + 'Function';
              break;
            }
          case 'number':
          case 'boolean': // ANDY added 11.30.19
            str = str + '' + idea[i];
            break;
          case 'object':
          case 'array':
            str = str + Doh.idea_to_ideacode(idea[i]);
            break;
          case 'string':
            if (i == 'children') {
              str = str + '' + idea[i];
              break;
            }
          default:
            str = str + '"' + idea[i] + '"';
            break;
        }
      }

      str = str + (Array.isArray(idea) ? ']' : '}');

      return str;
    },
    /**
     *  @brief 
     *  
     *  @param [in] idea   Description for idea
     *  @param [in] indent Description for indent
     *  @return Return description
     *  
     *  @details 
     */
    idea_to_pretty_ideacode: function (idea, indent) {
      var args = false;
      if (typeof indent == 'object') {
        args = indent;
        indent = args.indent || 1;
      } else indent = indent || 1;
      var indent_type = '  ', indent_str = indent_type.repeat(indent);

      var trailing_comma = '';

      var str = (Array.isArray(idea) ? '[\n' : '{\n');

      for (var i in idea) {
        if (i == 'prototype' || i == '__proto__') { continue; }
        if (idea[i] instanceof Doh.Globals.jQuery) { continue; }
        if (InstanceOf(idea[i])) { continue; }
        if (args) {
          if (args.exclude_methods) { if (typeof idea[i] == 'function') continue; }
          if (args.exclude_children) { if (i == 'children') continue; }
        }

        str = str + trailing_comma;
        trailing_comma = ',\n';

        if (!Array.isArray(idea)) str = str + indent_str + i + ':';
        else str = str + indent_str;

        switch (typeof idea[i]) {
          case 'function':
            if (args) if (args.truncate_methods) {
              str = str + 'Function';
              break;
            }
          case 'number':
            str = str + '' + idea[i];
            break;
          case 'object':
          case 'array':
            str = str + Doh.idea_to_ideacode(idea[i], indent + 1);
            break;
          case 'string':
            if (i == 'children') {
              str = str + '' + idea[i];
              break;
            }
          default:
            str = str + '"' + idea[i] + '"';
            break;
        }
      }

      str = str + indent_type.repeat(indent - 1 || 0) + (Array.isArray(idea) ? ']' : '}');

      return str;
    },
    /**
     *  @brief 
     *  
     *  @param [in] ideacode Description for ideacode
     *  @return Return description
     *  
     *  @details 
     */
    ideacode_to_source: function (ideacode) {
      return 'New(' + ideacode + ');\n';
    },

    // AA: general utility?
    // USED BY: we don't really seem to use these anymore...
    array_move: function (array, from_index, to_index) {
      array.splice(to_index, 0, array.splice(from_index, 1)[0]);
      return array;
    },
    /**
     *  @brief return items from array that pass (callback == !inverse)
     *  
     *  @param [in] array    [array] to search
     *  @param [in] callback [function] to call for each key in array
     *  @param [in] inverse  [bool] invert the result of each callback? defaults to false
     *  @return Return description
     *  
     *  @details Old method used by array_unique for meld_arrays. No longer in use in core.
     */
    grep: function (array, callback, inverse) {
      const ret = [];
      // Go through the array, only saving the items
      // that pass the validator function
      for (let i = 0, length = array.length; i < length; i++) {
        if (!inverse !== !callback(array[i], i)) {
          ret.push(array[i]);
        }
      }
      return ret;
    },
    /**
     *  @brief return an array filtered of duplicates
     *  
     *  @param [in] arr Description for arr
     *  @return Return description
     *  
     *  @details Old method used by meld_arrays. No longer in use in core.
     */
    array_unique: function (array) {
      // reduce the array to contain no dupes via grep/in_array
      return Doh.grep(array, function (value, key) {
        return Doh.in_array(value, array) === key;
      });
    },
    /**
     *  @brief transpose array values into the keys of a new object
     *  
     *  @param [in] array [array] to get values from
     *  @return new {} object with keys from the array values
     *  
     *  @details Very handy transposition tool, but currently unused in core
     */
    object_keys_from_array_values: function (array = []) {
      const object = {};
      for (let i = 0; i < array.length; i++) {
        object[array[i]] = true
      }
      return object;
    },

  });

});
