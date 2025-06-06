// this effectively deprecates the allforge module
Doh.Package('allforge', {
  load: 'dataforge'
});
Doh.Module('dataforge', [

  'dataforge_core',

  'YAML_dataforge',

  'nodejs?? nodejs_fs_dataforge',
  'browser?? __secret_browser_fs_dataforge',

  'nodejs?? db_dataforge',

  'HTML_dataforge',
],
function (allforge) {
  let inherits;
  if (Doh.nodejs) {
    inherits = allforge.nodejs_compatible;
  } else {
    inherits = allforge.browser_compatible;
  }
  Pattern('Dataforge', inherits);

  Pattern('AsyncDataforge', Doh.meld_arrays(['async_dataforge'], inherits));

});

Doh.Module('dataforge_core', [
  'dataforge_handlebars',
], async function (allforge) {
  allforge.nodejs_compatible = [];
  allforge.browser_compatible = [];
  /*
  let grammarFile, grammarSource, parser;
  if(Doh.nodejs){
    // Read the PEG.js grammar from a file
    grammarFile = 'utils/dataforge/dataforge.pegjs';
    grammarSource = fs.readFileSync(grammarFile, 'utf8');
    
    // Generate the parser from the grammar
    parser = peg.generate(grammarSource);
  }
  */


  /**
   * Dataforge Core Pattern
   * 
   * The core pattern that provides the foundation for data manipulation pipelines.
   * Implements the command registry, branch management, and mode handling systems.
   * 
   * Key Features:
   * - Command registry for operation definitions
   * - Branch management with local and global scopes
   * - Mode system (Replace/Append/Prepend) for data updates
   * - Handlebar template variable storage
   * - Reserved branch names protection
   * 
   * @see README.md for detailed documentation on commands and usage
   */
  Pattern('dataforge_core', {
    moc: {
      //EMPTY_VALUES: 'array',
      // special meld (using the `{}` meld type) causes each property to be melded individually
      // effectively adding 2 levels of depth to the meld
      reservedBranchNames: 'array',
      operationRegistry: {},
      modeUpdateMethods: {},
      globals: 'static',
      handlebars: 'object',
    },
    debug: false,
    forging: false,
    anonIdCounter: 0,
    defaultMode: "Replace",
    handlebars: {},
    branches: {},
    reservedBranchNames: [
      'main',
      'data',
      'handlebarsUsed',
      'branch',
      'branch.data',
      'branch.tempMode',
      'branch.currentMode',
      'branch.defaultMode',
      'branch.isGlobal',
      'outer',
      'outer.data',
      'outer.tempMode',
      'outer.currentMode',
      'outer.defaultMode',
      'outer.isGlobal'
    ],
    globals: {},
    outerBranch: 'main',
    currentBranch: 'main',
    //EMPTY_VALUES: ['', ' ', null, '[]', '{}', 'null', 'undefined', '\n'],
    ops: {},
    // the operationRegistry is a list of commands that have a method
    operationRegistry: {
      Import: {
        description: 'Put a value into data.',
        method: function (data) {
          return data;
        }
      },
      Debug: {
        description: 'Activate the debugger.',
        method: function () {
          debugger;
        }
      },
      Debugger: {
        description: 'Activate the debugger.',
        method: function () {
          debugger;
        }
      },
      DebugStepping: {
        description: 'Toggle the forge\'s stepping mode.',
        method: function () {
          this.debug = !this.debug;
        }
      },
      ConsoleLog: {
        description: 'Log the current data and any arguments to the console.',
        method: function (...args) {
          if (args.length === 0) {
            console.log('Dataforge data:', this.branches[this.currentBranch].data);
          } else {
            console.log('Dataforge Log:', ...args);
          }
        }
      },
      Mode: {
        description: 'Change the mode until `Mode` is called again.',
        method: function (newMode) {
          let branch = this.branches[this.currentBranch];
          if (newMode) {
            branch.currentMode = newMode;
            branch.tempMode = newMode;
          } else {
            branch.currentMode = branch.defaultMode;
            branch.tempMode = branch.defaultMode;
          }
        }
      },
      Replace: {
        description: 'Change the mode to "Replace" for the next command -only-.',
        method: function (withData) {
          let branch = this.branches[this.currentBranch];
          let previousMode = branch.tempMode;
          branch.tempMode = 'Replace';
          if (HasValue(withData)) {
            this.updateData(withData);
            branch.tempMode = previousMode;
            return;
          } // otherwise, leave the temp mode for the next command
        }
      },
      Append: {
        description: 'Change the mode to "Append" for the next command -only-.',
        method: function (withData) {
          let branch = this.branches[this.currentBranch];
          let previousMode = branch.tempMode;
          branch.tempMode = 'Append';
          if (HasValue(withData)) {
            this.updateData(withData);
            branch.tempMode = previousMode;
            return;
          } // otherwise, leave the temp mode for the next command
        }
      },
      Prepend: {
        description: 'Change the mode to "Prepend" for the next command -only-.',
        method: function (withData) {
          let branch = this.branches[this.currentBranch];
          let previousMode = branch.tempMode;
          branch.tempMode = 'Prepend';
          if (HasValue(withData)) {
            this.updateData(withData);
            branch.tempMode = previousMode;
            return;
          } // otherwise, leave the temp mode for the next command
        }
      },
      Empty: {
        description: 'Set the current branch data to an empty string.',
        method: function () { this.branches[this.currentBranch].data = ''; }
      },
      Exit: {
        description: 'Exit this forge entirely.',
        method: function () {
          let currentBranch = this.branches[this.currentBranch];
          currentBranch.ShouldExit = true;
        }
      },
      ExitIfEmpty: {
        description: 'Exit this forge process if the data is empty.',
        method: function () {
          let currentBranch = this.branches[this.currentBranch];
          currentBranch.ShouldExit = LacksValue(currentBranch.data);
        }
      },
      Branch: {
        async: false,
        description: 'Execute a command set on a branch and return to main. If the branch does not exist, initialize it.',
        method: function () {
          // figure out the arguments (branchName and commands) based on the type.
          // branchName is a string and commands is an array.
          // they can be passed in any order, or not at all.
          let branchName, commands, rtn;
          for (let arg of arguments) {
            if (IsStringAndHasValue(arg)) {
              branchName = arg;
            } else if (IsArray(arg)) {
              commands = arg;
            }
          }
          //console.log('branchName', branchName);
          // if the branchName is empty, make it up
          if (!branchName) {
            branchName = 'anon' + this.anonIdCounter++;
          }
          // Check if the branch exists, if not, initialize it
          // this will populate it with the current data
          if (!(branchName in this.branches)) {

            this.initializeBranch(branchName);
          }
          // call the process method with the commands
          if (commands) {
            // Switch to the specified branch
            // we need to stash the current branch and the outer branch so that we can return to them
            let previousOuterBranch = this.outerBranch;
            this.outerBranch = this.currentBranch;
            this.currentBranch = branchName;

            rtn = this.process(commands);

            // Switch back to the previous branch
            this.currentBranch = this.outerBranch;
            this.outerBranch = previousOuterBranch;
          }

          return rtn;
        }
      },
      Return: {
        description: 'Return to the outer branch with current data or optional provided value. Returning from "main" exits the forge.',
        method: function (value) {
          let currentBranch = this.branches[this.currentBranch];
          if (this.currentBranch === 'main') {
            currentBranch.ShouldExit = true;
            return;
          } else {
            currentBranch.ShouldReturn = true;
            // send the current data back to the outer branch using the outer branch's mode
            let data = undefined;
            // if an argument was passed, use it to update the outer branch instead of the current data
            if (arguments.length === 1) {
              data = value;
            } else {
              data = currentBranch.data;
            }
            currentBranch.ShouldReturnValue = data;
            return data;
          }
        }
      },
      From: {
        description: 'Update the current variable with data from the named variable. Ignore if the named variable is empty or does not exist.',
        method: function (branchName) {
          // Check if the branch exists and has data
          let branch = this.branches[branchName];
          if (branchName in this.branches && HasValue(branch.data)) {
            // Update the current branch's data with the data from the named branch
            return branch.data;
          }
        }
      },
      To: {
        description: 'Export the current data to the specified branch using the current branch mode. DOES NOT switch to the specified branch but will initiallize the branch if needed.',
        method: function (branchName) {
          if (!branchName) {
            throw Doh.error('ToBranch: branchName is required.');
          }
          // stash the current value of the real branch
          let realBranch = this.branches[this.currentBranch],
            realValue = realBranch.data,
            namedBranch = this.branches[branchName];
          // Check if the branch exists, if not, initialize it
          // this will populate it with the current data
          if (!(branchName in this.branches)) {
            this.initializeBranch(branchName);
          }
          // now that we are sure the branch exists, stash the current mode
          let stashed_mode = namedBranch.tempMode;
          // use the mode from the real branch since we aren't supposed to be switching to the branch
          namedBranch.tempMode = realBranch.tempMode;
          // update the branch with the real value
          this.updateData(realValue, namedBranch);
          // set the tempMode back to the stashed mode so the branch metadata is restored
          namedBranch.tempMode = stashed_mode;
          // switch back to the real branch
          //this.ops.Branch(realBranch);
        }
      },
      Global: {
        asnyc: false,
        description: 'Switch to or create a global branch, or make a local branch into a global one. Except main.',
        method: function () {
          // figure out the arguments (branchName and commands) based on the type.
          // branchName is a string and commands is an array.
          // they can be passed in any order, or not at all.
          let branchName, commands;
          for (let arg of arguments) {
            if (IsStringAndHasValue(arg)) {
              branchName = arg;
            } else if (IsArray(arg)) {
              commands = arg;
            }
          }
          //console.log('branchName', branchName);
          // if the branchName is empty, make it up
          if (!branchName) {
            branchName = 'anon' + this.anonIdCounter++;
          }
          // if we are trying to globalize the main branch, fail.
          if (branchName === 'main') {
            throw Doh.error('Cannot switch the main branch to a global branch.');
          }

          if (branchName) {
            // initializeBranch will create a global branch if it doesn't exist
            this.initializeBranch(branchName, null, true);
          } else {
            // if we don't specify a branch, try to globalize the current branch, unless it's the main branch
            if (this.currentBranch === 'main') {
              throw Doh.error('Cannot switch the main branch to a global branch.');
            }
            this.initializeBranch(this.currentBranch, null, true);
          }
          // run the branch
          if (branchName && commands) {
            return this.ops.Branch(branchName, commands);
          }
        }
      },
      ToGlobal: {
        description: 'Export the current data to the specified *global* branch using the current branch mode. DOES NOT switch to the specified *global* branch but will initiallize the branch if needed.',
        method: function (branchName) {
          if (!branchName) {
            throw Doh.error('ToGlobal: branchName is required.');
          }
          // all we need to do is ensure that the branch is global, then call the To method
          // initializeBranch will create a global branch if it doesn't exist
          this.initializeBranch(branchName, null, true);
          this.ops.To(branchName);
        }
      },
      Delete: {
        description: 'Delete the specified branch.',
        method: function (branchName) {
          if (branchName in this.reservedBranchNames) {
            throw Doh.error('Cannot delete a reserved branch name: ', branchName);
          }
          // branches and globals are the same object in multiple collections, so we only need to delete from both
          if (branchName in this.globals) {
            delete this.globals[branchName];
          }
          if (branchName in this.branches) {
            delete this.branches[branchName];
          }
          // if the current branch is the one we are deleting, switch to the main branch
          if (this.currentBranch === branchName) {
            this.currentBranch = 'main';
          }
        }
      },
      If: {
        async: false,
        description: 'Allow a complex set of conditions, a set of commands, and a branch(scope) name.',
        method: function (conditions, branchName, commands) {
          let currentData = this.branches[this.currentBranch].data;
          // ensure that conditions is an array
          if (IsStringAndHasValue(conditions) || IsFunction(conditions)) {
            //if(SeeIf(conditions, [IsStringAndHasValue, Or, IsFunction])){
            conditions = [conditions];
          }
          if (NotArray(conditions)) {
            conditions = [conditions];
          }
          let conditionString = SeeIf.Stringify(conditions); // TODO: 
          // replace handlebar templates (returns an array of the args sent in, but with handlebars replaced)
          conditionString = this.replace_handlebars(conditionString)[0];
          // parse the string into a conditions array
          conditions = SeeIf.Parse(conditionString);

          if (IsArray(branchName)) {
            commands = branchName;
            branchName = '';
          }
          // if branchName is empty, use short random name
          if (!branchName) {
            branchName = 'anon' + this.anonIdCounter++;
          }
          // ensure that commands is an array if it starts as a string
          if (IsStringAndHasValue(commands)) {
            commands = [commands];
          }
          if (NotArray(commands) && HasValue(commands)) {
            commands = [commands];
          }

          // Evaluate the conditions, if none, then it's false
          let that = this,
            If = null,
            result = false;
          if (conditions.length !== 0) {
            const evaluateCondition = (value, condition) => {
              let args;
              switch (SeeIf.TypeOf(condition)) {
                case 'IsArray':
                  // If the condition is an array, recursively evaluate it
                  If(value, condition);
                case 'IsString':
                  // our assignment allows SeeIf methods to be sent directly as functions or as strings
                  // detect if the condition is a string and if it is, convert it to a function
                  condition = SeeIf[condition];
                  break;
                case 'IsObjectObject':
                  // if the condition is an object, it should be a single key/value pair
                  // the key is the SeeIf method to use and the value is the argument(s) to pass to it
                  let method = Object.keys(condition)[0];
                  args = condition[method];
                  if (IsString(args)) args = [args];
                  // if the method is a string, convert it to a function
                  if (IsString(method)) method = SeeIf[method];
                  condition = method;
                  break;
              }
              let result = false;
              if (IsFunction(condition)) {
                // If the condition is a function, call it with the current data
                if (args) result = condition(value, ...args);
                else result = condition(value);
              }
              result = !!result;
              return result;
            };
            // the conditions is an array of conditionals and operators like so:
            // ['IsTrue', 'And', IsFalse, Or, 'IsString']
            // it should be nestable like:
            // ['IsTrue', 'And', ['IsFalse', 'Or', 'IsString']]
            // evaluate the conditions and return the result
            If = function (value, conditions, commands, branchName) {
              let result = evaluateCondition(value, conditions[0]);
              for (let i = 1; i < conditions.length; i += 2) {
                const operator = conditions[i];
                const nextCondition = conditions[i + 1];
                switch (operator) {
                  case 'And':
                    result = result && evaluateCondition(value, nextCondition);
                    break;
                  case 'Or':
                    result = result || evaluateCondition(value, nextCondition);
                    break;
                  // Add more operators here
                  default:
                    throw Doh.error(`If: Unknown operator '${operator}'.`);
                }
                // If the result is false, we can stop evaluating the conditions
                if (!result) break;
              }
              if (result && commands) {
                // run the commands
                return that.ops.Branch(branchName, commands);
              }
            };
          }
          return If(currentData, conditions, commands, branchName);
        }
      },
      Each: {
        async: false,
        description: 'Iterate over an array or object and execute a set of commands for each item.',
        method: function (branchName, commands) {
          // allow the branchName to be optional
          if (arguments.length === 2) {
            commands = branchName;
            branchName = 'anon' + this.anonIdCounter++;
          }
          let currentData = this.branches[this.currentBranch].data;
          if (IsArray(currentData)) {
            for (let i = 0; i < currentData.length; i++) {
              currentData[i] = this.ops.Branch(branchName + '_' + i, commands);
            }
          } else if (IsObjectObject(currentData)) {
            for (let key in currentData) {
              currentData[key] = this.ops.Branch(branchName + '_' + key, commands);
            }
          }
        }
      },
      ConvertToArray: {
        description: 'Convert the current data from a value into an array containing that value (optionally at the specified key).',
        method: function (key = 0) {
          let currentData = this.branches[this.currentBranch].data;

          if (key === 0) {
            return [currentData];
          } else {
            let result = [];
            result[key] = currentData;
            return result;
          }
        }
      },
      ConvertFromArray: {
        description: 'Convert the current data from an array into the first (or specified) key from within that array.',
        method: function (key = 0) {
          let currentData = this.branches[this.currentBranch].data;
          return currentData[key] ?? null;
        }
      },
      ConvertToObject: {
        description: 'Convert the current data from a value into an object with the specified key containing that value.',
        method: function (keyName) {
          let currentData = this.branches[this.currentBranch].data;
          return { [keyName]: currentData };
        }
      },
      ConvertFromObject: {
        description: 'Convert the current data from an object into the value of the specified key within that object.',
        method: function (keyName) {
          let currentData = this.branches[this.currentBranch].data;
          return currentData[keyName] ?? null;
        }
      },
      FromRef: {
        description: 'Pass the first argument to Doh.parse_reference and return the result.',
        method: function (reference) {
          return Doh.parse_reference(this.branches[this.currentBranch].data, reference);
        }
      },
      ConvertToJSON: {
        description: 'Stringify the current data to JSON format.',
        method: function () {
          let currentData = this.branches[this.currentBranch].data;
          return JSON.stringify(currentData);
        }
      },
      ConvertFromJSON: {
        description: 'Parse the current data as JSON into an object.',
        method: function () {
          let currentData = this.branches[this.currentBranch].data;
          if (IsStringAndHasValue(currentData)) {
            try {
              return JSON.parse(currentData);
            } catch (e) {
              Doh.debug('ConvertFromJSON: error parsing JSON:', e);
            }
          } else {
            Doh.debug('ConvertFromJSON: currentData is empty or not a string in commands:', this.commands);
          }
        }
      },
      ApplyHandlebars: {
        description: 'Apply the forge\'s handlebars to the current data.',
        method: function (handlebars) {
          if (IsObjectObjectAndNotEmpty(handlebars)) {
            Doh.meld_deep(this.handlebars, handlebars);
          }
          let currentData = this.branches[this.currentBranch].data;
          currentData = this.replace_handlebars(currentData)[0];
          return currentData;
        }
      },
      EscapeHandlebars: {
        description: 'Escape any handlebars in the current data.',
        method: function () {
          let currentData = this.branches[this.currentBranch].data;
          return currentData.replace(/{{/g, '\\{{');
        }
      },
      ToHandlebar: {
        description: 'Import the current data into the specified handlebar.',
        method: function (handlebar) {
          // Import implies that the value should be "merged" according to the current mode of the current branch
          let realBranch = this.branches[this.currentBranch],
            // stash the current value of the real branch
            realValue = realBranch.data,
            // create a fake branch that has the same tempMode as the real branch
            //  and the data is the handlebar template value
            fakeBranch = { tempMode: realBranch.tempMode, data: this.handlebars[handlebar] };
          // update the fake branch with the real value
          this.updateData(realValue, fakeBranch);
          // update the handlebars with the fake branch data
          this.handlebars[handlebar] = fakeBranch.data;
        }
      },
      EmptyHandlebar: {
        description: 'Make the specified handlebar replace with an empty string.',
        method: function (handlebar) {
          this.handlebars[handlebar] = '';
        }
      },
      RemoveHandlebar: {
        description: 'WARNING: This is not encouraged. Delete the handlebar entirely.',
        method: function (handlebar) {
          delete this.handlebars[handlebar];
        }
      },
      CloneTo: {
        description: 'Clone the current branch to the specified branch.',
        method: function (branchName) {
          // if the branchName is empty, make it up
          if (!branchName) {
            Doh.debug('CloneTo: empty branch name is not allowed.');
            return;
          }
          // Check if the branch exists, if not, initialize it
          // this will populate it with the current data
          if (!(branchName in this.branches)) {
            this.initializeBranch(branchName);
          }
          // CloneTo is a forced Replace
          this.branches[branchName].data = '';
          // update the branch with the real value
          this.updateData(JSON.parse(JSON.stringify(this.branches[this.currentBranch].data)), this.branches[branchName]);
        }
      },
      MeldDeep: {
        description: 'Meld objects deeply.',
        method: function (obj) {
          let currentData = this.branches[this.currentBranch].data;
          Doh.meld_deep(currentData, obj);
        }
      },
      MeldDeepFrom: {
        description: 'Meld objects deeply from the named branch.',
        method: function (branchName) {
          let currentData = this.branches[this.currentBranch].data,
            branch = this.branches[branchName];
          Doh.meld_deep(currentData, branch.data);
        }
      },
      MeldDeepFromGlobal: {
        description: 'Meld objects deeply from the named global branch.',
        method: function (branchName) {
          let currentData = this.branches[this.currentBranch].data,
            branch = this.globals[branchName];
          Doh.meld_deep(currentData, branch.data);
        }
      },
      // string operations
      Trim: {
        description: 'Trim the current data of whitespace.',
        method: function () {
          let currentData = this.branches[this.currentBranch].data;
          return currentData.trim();
        }
      },
      LTrim: {
        description: 'Trim the current data of whitespace from the left.',
        method: function () {
          let currentData = this.branches[this.currentBranch].data;
          return currentData.replace(/^\s+/, '');
        }
      },
      RTrim: {
        description: 'Trim the current data of whitespace from the right.',
        method: function () {
          let currentData = this.branches[this.currentBranch].data;
          return currentData.replace(/\s+$/, '');
        }
      },
      ToTitleCase: {
        description: 'Convert the current data to title case.',
        method: function () {
          let currentData = this.branches[this.currentBranch].data;
          return currentData.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
        }
      },
      ToUpperCase: {
        description: 'Convert the current data to uppercase.',
        method: function () {
          let currentData = this.branches[this.currentBranch].data;
          return currentData.toUpperCase();
        }
      },
      ToLowerCase: {
        description: 'Convert the current data to lowercase.',
        method: function () {
          let currentData = this.branches[this.currentBranch].data;
          return currentData.toLowerCase();
        }
      },
      ToCamelCase: {
        description: 'Convert the current data to camel case.',
        method: function () {
          let currentData = this.branches[this.currentBranch].data;
          return currentData.replace(/\s+(.)/g, (match, char) => char.toUpperCase()).replace(/\s/g, '').replace(/^./, (match) => match.toLowerCase());
        }
      },
      ToSnakeCase: {
        description: 'Convert the current data to snake case.',
        method: function () {
          let currentData = this.branches[this.currentBranch].data;
          return currentData.replace(/\s+/g, '_').toLowerCase();
        }
      },
      ToKebabCase: {
        description: 'Convert the current data to kebab case.',
        method: function () {
          let currentData = this.branches[this.currentBranch].data;
          return currentData.replace(/\s+/g, '-').toLowerCase();
        }
      },
      ToPascalCase: {
        description: 'Convert the current data to pascal case.',
        method: function () {
          let currentData = this.branches[this.currentBranch].data;
          return currentData.replace(/\s+(.)/g, (match, char) => char.toUpperCase()).replace(/\s/g, '').replace(/^./, (match) => match.toLowerCase());
        }
      },
      ConvertToString: {
        description: 'Convert the current data to a string.',
        method: function () {
          let currentData = this.branches[this.currentBranch].data;
          return currentData.toString();
        }
      },
      // input sanitization
      SanitizeAlphaNumeric: {
        description: 'Sanitize the current data to remove any non-alphanumeric characters.',
        method: function () {
          let currentData = this.branches[this.currentBranch].data;
          return currentData.replace(/[^a-zA-Z0-9]/g, '');
        }
      },
      SanitizeNumber: {
        description: 'Sanitize the current data to remove any non-numeric characters.',
        method: function () {
          let currentData = this.branches[this.currentBranch].data;
          return currentData.replace(/[^0-9]/g, '');
        }
      },
      SanitizeEmail: {
        description: 'Sanitize the current data to remove any non-email characters.',
        method: function () {
          let currentData = this.branches[this.currentBranch].data;
          // remove all characters that are not valid email characters
          return currentData.replace(/[^a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*/g, '');
        }
      },
      SanitizePhone: {
        description: 'Sanitize the current data to remove any non-phone characters.',
        method: function () {
          let currentData = this.branches[this.currentBranch].data;
          // remove all characters that are not part of a valid phone number +1(123)456-7890
          return currentData.replace(/[^0-9+\-()]/g, '');
        }
      },
      SanitizeURL: {
        description: 'Sanitize the current data to remove any non-URL characters.',
        method: function () {
          let currentData = this.branches[this.currentBranch].data;
          // remove all characters that are not valid URL characters
          return currentData.replace(/[^a-zA-Z0-9_\-@.:#/%?=&]/g, '');
        }
      },
      SanitizePath: {
        description: 'Sanitize the current data to remove any non-path characters.',
        method: function () {
          let currentData = this.branches[this.currentBranch].data;
          // remove all characters that are not valid path characters
          return currentData.replace(/[^a-zA-Z0-9_\-./:\\]/g, '');
        }
      },
      SanitizeFilename: {
        description: 'Sanitize the current data to remove any non-filename characters.',
        method: function () {
          let currentData = this.branches[this.currentBranch].data;
          // remove all characters that are not valid filename characters
          return currentData.replace(/[^a-zA-Z0-9_\-./:\\?*|"<>]/g, '');
        }
      },
      SanitizeUsername: {
        description: 'Sanitize the current data to remove any non-username characters.',
        method: function () {
          //let currentData = this.branches[this.currentBranch].data;
          // remove all characters that are not valid username characters
          return this.ops.SanitizeAlphaNumeric();
        }
      },
      SanitizePassword: {
        description: 'Sanitize the current data to remove any non-password characters.',
        method: function () {
          let currentData = this.branches[this.currentBranch].data;
          // remove all characters that are not valid password characters
          // passwords can include letters, numbers, and special characters
          return currentData.replace(/[^a-zA-Z0-9_\-!@#$%^&*()+=?|~]/g, '');
        }
      },
      SanitizeToken: {
        description: 'Sanitize the current data to remove any non-token characters.',
        method: function () {
          let currentData = this.branches[this.currentBranch].data;
          // remove all characters that are not valid characters for a token string
          // Include all characters that are typically valid in a token string
          return currentData.replace(/[^a-zA-Z0-9_\-\.!~*'()]/g, '');
        }
      },
      SanitizeCode: {
        description: 'Sanitize the current data to remove any non-code characters.',
        method: function () {
          let currentData = this.branches[this.currentBranch].data;
          // Allow a wide range of characters commonly used in code
          return currentData.replace(/[^\w\s!@#$%^&*()_+\-=\[\]{};':"\\|,.<>/?`~]/g, '');
        }
      },
      SanitizeHTML: {
        description: 'Sanitize the current data to remove any non-HTML characters.',
        method: function () {
          let currentData = this.branches[this.currentBranch].data;
          // Allow characters valid in HTML, including tags and entities
          return currentData.replace(/[^a-zA-Z0-9\s<>\/="'&;:_\-]/g, '');
        }
      },
      SanitizeSQL: {
        description: 'Sanitize the current data to remove any non-SQL characters.',
        method: function () {
          let currentData = this.branches[this.currentBranch].data;
          // Allow characters commonly used in SQL queries
          return currentData.replace(/[^a-zA-Z0-9_\s\-=<>!%(),.;]/g, '');
        }
      },
      SanitizeJSON: {
        description: 'Sanitize the current data to remove any non-JSON characters.',
        method: function () {
          let currentData = this.branches[this.currentBranch].data;
          // Allow only characters valid in JSON
          return currentData.replace(/[^a-zA-Z0-9_\s{}[\]:"',.-]/g, '');
        }
      },
      SanitizeXML: {
        description: 'Sanitize the current data to remove any non-XML characters.',
        method: function () {
          let currentData = this.branches[this.currentBranch].data;
          // Allow characters valid in XML, including tags and entities
          return currentData.replace(/[^a-zA-Z0-9\s<>\/="'&;:_\-]/g, '');
        }
      },
      SanitizeCSS: {
        description: 'Sanitize the current data to remove any non-CSS characters.',
        method: function () {
          let currentData = this.branches[this.currentBranch].data;
          // Allow characters commonly used in CSS
          return currentData.replace(/[^a-zA-Z0-9_\s\-:#.,%()]/g, '');
        }
      },
      SanitizeJS: {
        description: 'Sanitize the current data to remove any non-JS characters.',
        method: function () {
          let currentData = this.branches[this.currentBranch].data;
          // Allow characters commonly used in JavaScript
          return currentData.replace(/[^\w\s!@#$%^&*()_+\-=\[\]{};':"\\|,.<>/?`~]/g, '');
        }
      },
      SanitizeMarkdown: {
        description: 'Sanitize the current data to remove any non-Markdown characters.',
        method: function () {
          let currentData = this.branches[this.currentBranch].data;
          // Allow characters commonly used in Markdown
          return currentData.replace(/[^a-zA-Z0-9_\s\-#*[\]()!`>+=.]/g, '');
        }
      },
      SanitizeYAML: {
        description: 'Sanitize the current data to remove any non-YAML characters.',
        method: function () {
          let currentData = this.branches[this.currentBranch].data;
          // Allow characters commonly used in YAML
          return currentData.replace(/[^a-zA-Z0-9_\s\-:[\]{}#,.'"|]/g, '');
        }
      },
      SanitizeInput: {
        description: 'Sanitize the current data to remove any non-input characters.',
        method: function () {
          let str = this.branches[this.currentBranch].data;

          if (!IsString(str)) return str;

          return str
            // Convert various Unicode whitespace to regular spaces
            .replace(/[\u00A0\u1680\u180E\u2000-\u200B\u202F\u205F\u3000\uFEFF]/g, ' ')
            // Remove zero-width characters
            .replace(/[\u200B-\u200D\uFEFF]/g, '')
            // Remove control characters except newlines and tabs
            .replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F-\x9F]/g, '')
            // Remove RTL and LTR marks
            .replace(/[\u200E\u200F\u202A-\u202E]/g, '')
            // Remove joiners
            .replace(/[\u2060-\u2064\u206A-\u206F]/g, '')
            // Remove variation selectors
            .replace(/[\uFE00-\uFE0F\uDB40\uDB3C\uDB3D]/g, '')
            // Remove private use characters
            .replace(/[\uE000-\uF8FF]/g, '')
            // Remove combining characters
            .replace(/[\u0300-\u036F\u1AB0-\u1AFF\u1DC0-\u1DFF\u20D0-\u20FF\uFE20-\uFE2F]/g, '')
            // Remove ideographic description characters
            .replace(/[\u2FF0-\u2FFF]/g, '')
            // Normalize remaining whitespace
            .replace(/\s+/g, ' ').trim()
            // Remove byte order mark if present at start
            .replace(/^\uFEFF/, '');
        }
      },
      EscapeHTML: {
        description: 'Escape the current data to remove any non-HTML characters.',
        method: function () {
          let currentData = this.branches[this.currentBranch].data;
          // Allow characters valid in HTML, including tags and entities
          return currentData.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
        }
      },
      EscapeJSON: {
        description: 'Escape the current data to remove any non-JSON characters.',
        method: function () {
          let currentData = this.branches[this.currentBranch].data;
          // Allow characters valid in JSON
          return currentData.replace(/&/g, '\\&').replace(/</g, '\\<').replace(/>/g, '\\>').replace(/"/g, '\\"').replace(/'/g, '\\\'');
        }
      },
      StripHTML: {
        description: 'Strip the current data of HTML tags.',
        method: function () {
          let currentData = this.branches[this.currentBranch].data;
          // Remove all characters that are not valid HTML characters
          return currentData.replace(/<[^>]*>|&[^;]+;/g, '');
        }
      },
      RemoveColorCodes: {
        description: 'Remove color codes (ANSI or \\u001b) from the current data.',
        method: function () {
          let currentData = this.branches[this.currentBranch].data;
          // Remove color codes (ANSI or \\u001b) from the current data
          return currentData.replace(/\x1b\[[0-9;]*m|\u001b/g, '');
        }
      },
      // number operations
      RoundNumber: {
        description: 'Round the current data to the nearest integer.',
        method: function () {
          let currentData = this.branches[this.currentBranch].data;
          return Math.round(currentData);
        }
      },
      FloorNumber: {
        description: 'Round the current data down to the nearest integer.',
        method: function () {
          let currentData = this.branches[this.currentBranch].data;
          return Math.floor(currentData);
        }
      },
      CeilNumber: {
        description: 'Round the current data up to the nearest integer.',
        method: function () {
          let currentData = this.branches[this.currentBranch].data;
          return Math.ceil(currentData);
        }
      },
      TruncateNumber: {
        description: 'Truncate the current data to the nearest integer.',
        method: function () {
          let currentData = this.branches[this.currentBranch].data;
          return Math.trunc(currentData);
        }
      },
      ConvertToNumber: {
        description: 'Convert the current data to a number.',
        method: function () {
          let currentData = this.branches[this.currentBranch].data;
          return Number(currentData);
        }
      },
      IncrementNumber: {
        description: 'Increment the current data by 1.',
        method: function () {
          let currentData = this.branches[this.currentBranch].data;
          return currentData + 1;
        }
      },
      DecrementNumber: {
        description: 'Decrement the current data by 1.',
        method: function () {
          let currentData = this.branches[this.currentBranch].data;
          return currentData - 1;
        }
      },
    },
    modeUpdateMethods: {
      Replace: function (branch, newData) {
        branch.data = newData;
      },
      Append: function (branch, newData) {
        let branchType = SeeIf.TypeOf(branch.data),
          currentType = SeeIf.TypeOf(newData);
        if (branchType != currentType) {
          return 'Cannot append an ' + currentType + ' to an ' + branchType;
        }
        switch (branchType) {
          case 'IsString':
            branch.data += newData;
            break;
          case 'IsArray':
            branch.data = branch.data.concat(newData);
            break;
          case 'IsObjectObject':
            branch.data = { ...branch.data, ...newData };
            break;
        }
      },
      Prepend: function (branch, newData) {
        let branchType = SeeIf.TypeOf(branch.data),
          currentType = SeeIf.TypeOf(newData);
        if (branchType != currentType) {
          return 'Cannot prepend an ' + currentType + ' to an ' + branchType;
        }
        switch (branchType) {
          case 'IsString':
            branch.data = newData + branch.data;
            break;
          case 'IsArray':
            branch.data = newData.concat(branch.data);
            break;
          case 'IsObjectObject':
            branch.data = { ...newData, ...branch.data };
            break;
        }
      }
    },
    // object_phase is the Doh constructor for each Forge
    object_phase: function () {
      // make some aliases
      this.operationRegistry.FromKey = this.operationRegistry.ConvertFromObject;
      this.operationRegistry.ToKey = this.operationRegistry.ConvertToObject;
      this.operationRegistry.ConvertToObjectWithKey = this.operationRegistry.ConvertToObject;
      this.operationRegistry.ImportFromValue = this.operationRegistry.Import;
      this.operationRegistry.ImportFrom = this.operationRegistry.From;
      this.operationRegistry.ImportFromBranch = this.operationRegistry.From;
      this.operationRegistry.ExportTo = this.operationRegistry.To;
      this.operationRegistry.ExportToBranch = this.operationRegistry.To;
      this.operationRegistry.ExportToGlobal = this.operationRegistry.ToGlobal;
      this.operationRegistry.ImportFromRef = this.operationRegistry.FromRef;
      this.operationRegistry.ExportToHandlebar = this.operationRegistry.ToHandlebar;
      // walk the operationRegistry and bind each method to the ops object
      let ops = this.ops;
      for (let opName in this.operationRegistry) {
        let opRegistration = this.operationRegistry[opName];
        if (opRegistration.method) {
          ops[opName] = opRegistration.method.bind(this);
        }
      }
    },
    initializeBranch: function (branchName = 'main', defaultMode = null, asGlobal = false, ignoreReserved = false) {
      let didInitialize = false;
      if (!defaultMode) {
        defaultMode = this.defaultMode;
      }
      let blankBranch = {
        name: branchName,
        commands: [],
        defaultMode: defaultMode,
        currentMode: defaultMode,
        tempMode: defaultMode,
        data: '',
        ShouldReturn: false,
        ShouldReturnValue: null,
        ShouldExit: false,
        isGlobal: asGlobal
      };
      if (asGlobal && (!(branchName in this.reservedBranchNames) || ignoreReserved)) {
        // check to see if the global already exists
        if (branchName in this.globals) {
          // if it does, then ensure that it's on the branches
          this.branches[branchName] = this.globals[branchName];
          return;
        } else {
          // if it doesn't, are we converting a local branch?
          if (branchName in this.branches) {
            // if we are, then we need to copy the branch to the globals
            this.globals[branchName] = this.branches[branchName];
            this.branches[branchName].isGlobal = true;
            return;
          } else {
            // if we aren't, then we need to initialize the global and the local branch
            this.globals[branchName] = this.branches[branchName] = blankBranch;
            didInitialize = true;
          }
        }
      } else if (!(branchName in this.branches) && (!(branchName in this.reservedBranchNames) || ignoreReserved)) {
        // we only get here if we aren't messing with globals and
        //   the branch doesn't exist
        this.branches[branchName] = blankBranch;
        didInitialize = true;
      }
      // Copy current branch data to the new branch if we had to use a blank branch initialization
      if (didInitialize && this.currentBranch && this.branches[this.currentBranch]) {
        this.branches[branchName].data = this.branches[this.currentBranch].data;
      }
    },
    // replace the dynamically created operation with a new one that looks for handlebar templates
    replace_handlebars: function (...args) {
      // Create a regex that matches any handlebar template, but not escaped ones
      const handlebarRegex = /{{([^{}]+)}}/gs;
      // Create a regex that matches escaped handlebars
      const escapedHandlebarRegex = /\\{{([^{}]+)}}/gs;

      // Function to determine the replacement value for a given handlebar
      const getReplacement = (key) => {
        key = key.trim();
        // Check if the key matches dynamic handlebars first
        const dynamicHandlebars = {
          "data": this.branches[this.currentBranch].data,
          "branch.data": this.branches[this.currentBranch].data,
          "branch.tempMode": this.branches[this.currentBranch].tempMode,
          "branch.currentMode": this.branches[this.currentBranch].currentMode,
          "branch.defaultMode": this.branches[this.currentBranch].defaultMode,
          "branch.isGlobal": this.branches[this.currentBranch].isGlobal,
          "outer.data": this.branches[this.outerBranch].data,
          "outer.tempMode": this.branches[this.outerBranch].tempMode,
          "outer.currentMode": this.branches[this.outerBranch].currentMode,
          "outer.defaultMode": this.branches[this.outerBranch].defaultMode,
          "outer.isGlobal": this.branches[this.outerBranch].isGlobal
        };
        if (dynamicHandlebars.hasOwnProperty(key)) {
          return dynamicHandlebars[key];
        }

        if (key.includes(':')) {
          const [protocol, value] = key.split(':');
          if (Doh.Patterns.HandlebarProtocolHandler.handlers.hasOwnProperty(protocol)) {
            return Doh.Patterns.HandlebarProtocolHandler.handlers[protocol](value);
          }
        }

        // Check if the key is in handlebars or branches
        if (this.handlebars.hasOwnProperty(key)) {
          return this.handlebars[key];
        } else if (this.branches.hasOwnProperty(key) && this.branches[key].hasOwnProperty('data')) {
          return this.branches[key].data;
        }

        // Return the original handlebar if no replacement is found
        return `{{${key}}}`;
      };

      // Process each argument
      args = args.map(arg => {
        if (IsString(arg)) {
          // Pre-process: handle escaped handlebars first by replacing them with a temporary token
          const escapedHandlebars = [];
          let processedArg = arg.replace(escapedHandlebarRegex, (match, content) => {
            const token = `__ESCAPED_HANDLEBAR_${escapedHandlebars.length}__`;
            escapedHandlebars.push(`\\{{${content}}}`);
            return token;
          });

          // First phase: collect all handlebar keys
          const handlebarKeys = [];
          processedArg.replace(handlebarRegex, (match, key) => {
            handlebarKeys.push(key.trim());
            return match; // Keep original match for now
          });

          this.handlbarsUsed = Doh.meld_arrays(this.handlbarsUsed, handlebarKeys);

          this.handlebars['handlebarsUsed'] = JSON.stringify(this.handlbarsUsed);
          
          // Second phase: replace handlebars with values
          processedArg = processedArg.replace(handlebarRegex, (match, key) => getReplacement(key));

          // Final phase: restore escaped handlebars
          escapedHandlebars.forEach((content, i) => {
            processedArg = processedArg.replace(`__ESCAPED_HANDLEBAR_${i}__`, content);
          });

          return processedArg;
        }
        return arg;
      });

      return args;
    },
    unescape_handlebars: function (data) {
      return data.replace(/\\{{/g, '{{');
    },
    updateData: function (newData, branch = null) {
      if (HasValue(newData)) {
        newData = this.replace_handlebars(newData)[0];
        branch = branch || this.branches[this.currentBranch];
        let err = this.modeUpdateMethods[branch.tempMode](branch, newData);
        if (err) {
          Doh.debug(err);
        }
      }
    },
    forge: function (data = null, commands, handlebars) {
      // forges can only forge one set of commands at a time, currently
      if (this.forging) {
        throw Doh.error('This DataForge is already forging: ');
        return;
      }
      this.forging = true;

      // if there is only one argument, assume it is a DohCode script
      let script;
      if (arguments.legth === 1) {
        script = data;
      } else if (IsString(commands)) {
        script = commands;
        // if the commands are a string, then we need to interpret them as a DohCode script
        commands = parser.parse(script);
      }
      // stash the handlebars sent in, meld them into the current handlebars, noting any that already existed
      // meld the existing handlebars into a new object
      let oldHandlebars = Doh.meld_objects({}, this.handlebars);
      // meld the new handlebars into the existing handlebars
      if (HasValue(handlebars)) Doh.meld_objects(this.handlebars, handlebars);

      // clear the branches
      this.branches = {};
      // initialize the main branch
      this.initializeBranch('main', null, false, true);
      // Initialize local branches with references to global branches
      Object.assign(this.branches, this.globals);

      // clean up the forge
      this.debug = false;
      this.currentBranch = 'main';

      let rtn = this.process(data, commands);

      // reset the handlebars to the old handlebars
      this.handlebars = oldHandlebars;

      // return the result
      this.forging = false;
      return rtn;
    },
    process: function (data = null, commands = null) {
      let outerBranch = this.branches[this.outerBranch],
        currentBranch = this.branches[this.currentBranch];

      // if there is only one argument, assume it is the commands
      if (!commands && IsArray(data)) {
        commands = data;
        data = null;
      }

      // if commands were passed in, add them to the current branch
      if (commands) if (IsArray(commands)) {
        // assume the branch may already exist and has commands either way
        currentBranch.commands = currentBranch.commands.concat(commands);
      }

      // commands must be an array
      if (!IsArray(currentBranch.commands)) {
        throw Doh.error('commands must be an array: ');
        return;
      }
      // if there are no commands, throw an error
      if (currentBranch.commands.length === 0) {
        throw Doh.error('No commands to process: ');
        return;
      }

      // as long as there are commands, update the data so they can begin processing
      this.updateData(data);

      let commandName;
      // loop through the commands
      for (let command of currentBranch.commands) {
        if (this.debug)
          debugger;
        // if the command is a string, then it is a method on the forge with no arguments
        if (IsStringAndHasValue(command)) {
          commandName = command;
          let method = this.ops[commandName];
          let result;
          if (method) {
            try {
              result = method.apply(this);
            } catch (err) {
              Doh.error('Error in command: ', command, err);
            }
            // if (IsString(result)) {
            //   result = this.unescape_handlebars(result);
            // }
            // update the data with the result of the command
            this.updateData(result);
          } else {
            throw Doh.error('Unknown command: ', command);
          }
          // if the command is an object, then it should be an object who's key is the
          // command name and value is the arguments
        } else if (NotEmptyObject(command)) {
          // get the command name from the first key in the object
          commandName = Object.keys(command)[0];
          // args must be an array, and the command must allow arguments
          let args = command[commandName],
            // get the method from the forge
            method = this.ops[commandName];

          if (method) {
            if (IsStringAndHasValue(args)) {
              args = [args];
            }
            if (args === null) {
              args = [];
            }
            if (IsArray(args)) if (args.length > 0) {
              // replace handlebar templates in the arguments
              args = this.replace_handlebars(...args);
            }
            let result;
            try {
              result = method.apply(this, args);
            } catch (err) {
              Doh.error('Error in command: ', command, err);
            }
            // if (IsString(result)) {
            //   result = this.unescape_handlebars(result);
            // }
            this.updateData(result);
          } else {
            throw Doh.error('Unknown command: ', commandName);
          }
        }

        currentBranch = this.branches[this.currentBranch];

        // after the command, reset the mode to the current branch's current mode
        // unless the mode was changed by one of the special mode commands
        if (!(commandName in this.modeUpdateMethods)) {
          currentBranch.tempMode = currentBranch.currentMode;
        }

        if (currentBranch.ShouldReturn) {
          // if the current branch ShouldReturn, then we've sent a value that we want to return instead of the current data
          return currentBranch.ShouldReturnValue;
          break;
        }

        // after the command, check to see if the ShouldExit flag is set
        if (currentBranch.ShouldExit) {
          this.branches["main"].ShouldExit = true;  // if any branch ShouldExit, the main branch ShouldExit
          break;
        }
      }
      return currentBranch.data;
    },

  });

  Pattern('async_dataforge', 'dataforge_core', {
    operationRegistry: {
      Fetch: {
        async: true,
        description: 'Fetch data from a URL. Using a socket if available.',
        method: async function (url, ignoreSocket = false) {
          if (!url) url = this.branches[this.currentBranch].data;
          let response;
          if (IsNode()) {
            let axios = await Doh.load('axios');
            response = await axios.get(url);
          } else if (IsBrowser()) {
            await Doh.load('ajax');
            response = await Doh.ajaxPromise(url, null, { ignoreSocket: ignoreSocket });
          }
          return response.data;
        }
      },
      ImportFromURL: {
        async: true,
        description: 'Fetch data from a URL, ignoring the socket.',
        method: async function (url) {
          return this.ops.Fetch(url, true);
        }
      },
      Post: {
        async: true,
        description: 'Await a POST.',
        method: async function (url) {
          if (IsNode()) {
            // if the url starts with a /, then it's a local route
            let res = { isSocket: true }, req = this.branches[this.currentBranch].data;
            if (url.startsWith('/')) {
              let result,
                callbackPromise = new Promise((resolve, reject) => {
                  res.resolve = resolve;
                  res.reject = reject;
                });
              await window.Router.FollowRoute(url, req, res, res.resolve);
              result = await callbackPromise;
              return result;
            } else {
              let urlObj = new URL(url),
                requestData = IsObjectObjectAndNotEmpty(req) ? JSON.stringify(req) : null,
                requestOptions = {
                  url: urlObj.href,
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json'
                  },
                  responseType: 'stream',
                  ...(requestData ? { data: requestData } : {})
                };
              if (IsObjectObjectAndNotEmpty(requestData)) {
                requestOptions.headers['Content-Length'] = Buffer.byteLength(requestData.data);
              }
              try {
                let axios = await Doh.load('axios');
                let response = await axios(requestOptions);
                return await convertStreamToJson(response.data);
              } catch (e) {
                Doh.error('Dataforge Post: error:', e);
              }
            }
          } else {
            await Doh.load('ajax');
            let response = await Doh.ajaxPromise(
              url,
              this.branches[this.currentBranch].data,
            );
            return response.data;
          }
        }
      },
      ForgeOnServer: {
        async: true,
        description: 'Run a set of commands on the host dataforge.',
        method: async function (...commands) {
          if (IsNode()) {
            throw Doh.error('ForgeOnServer is not available in Node.js.');
            return;
          }
          await Doh.load('ajax');
          let response = await Doh.ajaxPromise(
            '/dataforge/forge',
            { data: this.branches[this.currentBranch].data, commands: commands },
          );
          return response.data;
        }
      },
      // make the branching methods async
      Branch: {
        asnyc: true,
        method: async function () {
          // figure out the arguments (branchName and commands) based on the type.
          // branchName is a string and commands is an array.
          // they can be passed in any order, or not at all.
          let branchName, commands, rtn;
          for (let arg of arguments) {
            if (IsStringAndHasValue(arg)) {
              branchName = arg;
            } else if (IsArray(arg)) {
              commands = arg;
            }
          }
          //console.log('branchName', branchName);
          // if the branchName is empty, make it up
          if (!branchName) {
            branchName = 'anon' + this.anonIdCounter++;
          }
          // Check if the branch exists, if not, initialize it
          // this will populate it with the current data
          if (!(branchName in this.branches)) {

            this.initializeBranch(branchName);
          }
          // call the process method with the commands
          if (commands) {
            // Switch to the specified branch
            // we need to stash the current branch and the outer branch so that we can return to them
            let previousOuterBranch = this.outerBranch;
            this.outerBranch = this.currentBranch;
            this.currentBranch = branchName;

            rtn = await this.process(commands);

            // Switch back to the previous branch
            this.currentBranch = this.outerBranch;
            this.outerBranch = previousOuterBranch;
          }

          return rtn;
        }
      },
      If: {
        asnyc: true,
        method: async function (conditions, branchName, commands) {
          let currentData = this.branches[this.currentBranch].data;
          // ensure that conditions is an array
          if (IsStringAndHasValue(conditions) || IsFunction(conditions)) {
            //if(SeeIf(conditions, [IsStringAndHasValue, Or, IsFunction])){
            conditions = [conditions];
          }
          if (NotArray(conditions)) {
            conditions = [conditions];
          }
          let conditionString = SeeIf.Stringify(conditions); // TODO: 
          // replace handlebar templates (returns an array of the args sent in, but with handlebars replaced)
          conditionString = this.replace_handlebars(conditionString)[0];
          // parse the string into a conditions array
          conditions = SeeIf.Parse(conditionString);

          if (IsArray(branchName)) {
            commands = branchName;
            branchName = '';
          }
          // if branchName is empty, use short random name
          if (!branchName) {
            branchName = 'anon' + this.anonIdCounter++;
          }
          // ensure that commands is an array if it starts as a string
          if (IsStringAndHasValue(commands)) {
            commands = [commands];
          }
          if (NotArray(commands) && HasValue(commands)) {
            commands = [commands];
          }

          // Evaluate the conditions, if none, then it's false
          let that = this,
            If = null;
          if (conditions.length !== 0) {
            const evaluateCondition = async function (value, condition) {
              let args;
              switch (SeeIf.TypeOf(condition)) {
                case 'IsArray':
                  // If the condition is an array, recursively evaluate it
                  await If(value, condition);
                case 'IsString':
                  // our assignment allows SeeIf methods to be sent directly as functions or as strings
                  // detect if the condition is a string and if it is, convert it to a function
                  condition = SeeIf[condition];
                  break;
                case 'IsObjectObject':
                  // if the condition is an object, it should be a single key/value pair
                  // the key is the SeeIf method to use and the value is the argument(s) to pass to it
                  let method = Object.keys(condition)[0];
                  args = condition[method];
                  if (IsString(args)) args = [args];
                  // if the method is a string, convert it to a function
                  if (IsString(method)) method = SeeIf[method];
                  condition = method;
                  break;
              }
              let result = false;
              if (IsFunction(condition)) {
                // If the condition is a function, call it with the current data
                if (args) result = condition(value, ...args);
                else result = condition(value);
              }
              result = !!result;
              return result;
            };
            // the conditions is an array of conditionals and operators like so:
            // ['IsTrue', 'And', IsFalse, Or, 'IsString']
            // it should be nestable like:
            // ['IsTrue', 'And', ['IsFalse', 'Or', 'IsString']]
            // evaluate the conditions and return the result
            If = async function (value, conditions, commands, branchName) {
              let result = await evaluateCondition(value, conditions[0]);
              for (let i = 1; i < conditions.length; i += 2) {
                const operator = conditions[i];
                const nextCondition = conditions[i + 1];
                switch (operator) {
                  case 'And':
                    result = result && await evaluateCondition(value, nextCondition);
                    break;
                  case 'Or':
                    result = result || await evaluateCondition(value, nextCondition);
                    break;
                  // Add more operators here
                  default:
                    throw Doh.error(`If: Unknown operator '${operator}'.`);
                }
              }
              if (result && commands) {
                // run the commands
                return await that.ops.Branch(branchName, commands);
              }
            };
          }
          return await If(currentData, conditions, commands, branchName);
        }
      },
      Each: {
        asnyc: true,
        method: async function (branchName, commands) {
          // allow the branchName to be optional
          if (arguments.length === 2) {
            commands = branchName;
            branchName = 'anon' + this.anonIdCounter++;
          }
          let currentData = this.branches[this.currentBranch].data;
          if (IsArray(currentData)) {
            for (let i = 0; i < currentData.length; i++) {
              currentData[i] = await this.ops.Branch(branchName + '_' + i, commands);
            }
          } else if (IsObjectObject(currentData)) {
            for (let key in currentData) {
              currentData[key] = await this.ops.Branch(branchName + '_' + key, commands);
            }
          }
        }
      },
    },
    forge_queue: [],
    // replace the base process with an async version
    forge: async function (data = null, commands, handlebars) {
      // If this is the first call, initialize the queue
      if (this.forge_queue.length === 0) {
        this.forging = false;
      }

      // Create a promise for this forge operation
      const forgePromise = new Promise((resolve, reject) => {
        // Add this operation to the queue
        this.forge_queue.push({ data, commands, handlebars, resolve, reject });
      });

      // If we're not already forging, start processing the queue
      if (!this.forging) {
        this.forging = true;
        while (this.forge_queue.length > 0) {
          let { data, commands, handlebars, resolve, reject } = this.forge_queue.shift();
          try {
            // if there is only one argument, assume it is the commands
            if (!commands && IsArray(data)) {
              commands = data;
              data = null;
            }

            // Stash the handlebars sent in, meld them into the current handlebars
            const oldHandlebars = Doh.meld_objects({}, this.handlebars);
            if (handlebars) Doh.meld_objects(this.handlebars, handlebars);

            // Reset forge state
            this.branches = {};
            this.initializeBranch('main', null, false, true);
            Object.assign(this.branches, this.globals);
            this.debug = false;
            this.currentBranch = 'main';

            // Process the forge operation
            const result = await this.process(data, commands);

            // Reset handlebars and resolve the promise
            this.handlebars = oldHandlebars;
            resolve(result);
          } catch (error) {
            reject(error);
          }
        }
        this.forging = false;
      }

      // Return the promise for this forge operation
      return forgePromise;
    },
    process: async function (data = null, commands = null) {
      let currentBranch = this.branches[this.currentBranch];

      // if there is only one argument, assume it is the commands
      if (!commands && IsArray(data)) {
        commands = data;
        data = null;
      }

      // if commands were passed in, add them to the current branch
      if (commands) if (IsArray(commands)) {
        // assume the branch may already exist and has commands either way
        currentBranch.commands = currentBranch.commands.concat(commands);
      }

      // commands must be an array
      if (!IsArray(currentBranch.commands)) {
        throw Doh.error('commands must be an array: ');
        return;
      }
      // if there are no commands, throw an error
      if (currentBranch.commands.length === 0) {
        throw Doh.error('No commands to process: ');
        return;
      }

      // as long as there are commands, update the data so they can begin processing
      this.updateData(data);

      let commandName;
      // loop through the commands
      for (let command of currentBranch.commands) {
        if (this.debug)
          debugger;
        // if the command is a string, then it is a method on the forge with no arguments
        if (IsStringAndHasValue(command)) {
          commandName = command;
          let method = this.ops[commandName];

          if (method) {
            let result = await method.apply(this);
            // update the data with the result of the command
            this.updateData(result);
          } else {
            throw Doh.error('Unknown command: ', commandName);
          }
          // if the command is an object, then it should be an object who's key is the
          // command name and value is the arguments
        } else if (NotEmptyObject(command)) {
          // get the command name from the first key in the object
          commandName = Object.keys(command)[0];
          // args must be an array, and the command must allow arguments
          let args = command[commandName],
            // get the method from the forge
            method = this.ops[commandName];

          if (method) {
            if (IsStringAndHasValue(args)) {
              args = [args];
            }
            if (args === null) {
              args = [];
            }
            if (IsArray(args)) if (args.length > 0) {
              // replace handlebar templates in the arguments
              args = this.replace_handlebars(...args);
            }
            if (NotArray(args)) args = [args];
            let result = await method.apply(this, args);
            this.updateData(result);
          } else {
            throw Doh.error('Unknown command: ', commandName);
          }
        }

        currentBranch = this.branches[this.currentBranch];

        // after the command, reset the mode to the current branch's current mode
        // unless the mode was changed by one of the special mode commands
        if (!(commandName in this.modeUpdateMethods)) {
          currentBranch.tempMode = currentBranch.currentMode;
        }

        if (currentBranch.ShouldReturn) {
          // if the current branch ShouldReturn, then we've sent a value that we want to return instead of the current data
          return currentBranch.ShouldReturnValue;
          break;
        }

        // after the command, check to see if the ShouldExit flag is set
        if (currentBranch.ShouldExit) {
          this.branches["main"].ShouldExit = true;  // if any branch ShouldExit, the main branch ShouldExit
          break;
        }
      }
      return currentBranch.data;
    },
  });
});