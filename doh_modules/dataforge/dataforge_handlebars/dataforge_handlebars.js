Doh.Module('dataforge_handlebars', [
], async function (DohPath) {
  //MARK: HandlebarProtocol
  /**
   * Handlebar Protocol System
   * 
   * A handlebar protocol allows handlebars to dynamically call functions during template processing.
   * 
   * Format: {{protocol:value}}
   * 
   * How it works:
   * 1. When a handlebar with a protocol is encountered, the value is extracted
   * 2. The value is passed to the registered handler function for that protocol
   * 3. The handler function processes the value and returns a result
   * 4. The handlebar is replaced with the returned value in the final output
   * 
   * This system enables dynamic content generation and processing within handlebar templates.
   */
  Pattern('HandlebarProtocolHandler', {
    moc: {
      protocol: ['IsString', 'NotNull'], // must be a string and not null
      handler: ['IsFunction', 'NotNull'], // must be a function and not null
      handlers: 'Static', // this static collection is shared by all instances of this pattern
      enabled: 'IsBoolean',
    },
    enabled: true,
    handlers: {}, // Statics must be initialized in the plain object.
    object_phase: function(){
      // handlers is now synced and mimiced so we can set it and everyone will see it.
      if (this.enabled) {
        this.handlers[this.protocol] = this.handler;
      }
    },
  });

  Pattern('HandlebarDohPathProtocol', 'HandlebarProtocolHandler', {
    protocol: 'DohPath',
    handler: function(path) {
      return DohPath(path);
    }
  });
  Pattern('HandlebarDohPathDohSlashProtocol', 'HandlebarProtocolHandler', {
    protocol: 'DohPath.DohSlash',
    handler: function(path) {
      return DohPath.DohSlash(path);
    }
  });


  Pattern('HandlebarPackagePathProtocol', 'HandlebarProtocolHandler', {
    protocol: 'Package',
    handler: function(packageName) {
      if (Doh.Packages[packageName]) {
        return '/' + Doh.Packages[packageName].path;
      }
      return '';
    }
  });
  Pattern('HandlebarPackageReadmeProtocol', 'HandlebarProtocolHandler', {
    protocol: 'PackageReadme',
    handler: function(packageName) {
      if (Doh.Packages[packageName]) {
        return DohPath.Join('/', Doh.Packages[packageName].path, 'README.md');
      }
      return '';
    }
  });


  Pattern('HandlebarDohballDocsProtocol', 'HandlebarProtocolHandler', {
    protocol: 'DohballDocs',
    handler: function(packageName) {
      if (Doh.Packages[packageName]) {
        return DohPath.Join('/docs/dohballs/', Doh.Packages[packageName].path);
      }
      return '';
    }
  });

  if(IsBrowser()) {
    New('HandlebarProtocolHandler', {
      protocol: 'New',
      handler: function(patternName) {
        return New(patternName);
      }
    });
  }

  New('HandlebarDohPathProtocol');
  New('HandlebarDohPathDohSlashProtocol');
  New('HandlebarPackagePathProtocol');
  New('HandlebarPackageReadmeProtocol');
  New('HandlebarDohballDocsProtocol');
});