Doh.Module('HTML_dataforge', ['dataforge_core', 'html'], function (allforge) {

  if (allforge) {
    allforge.nodejs_compatible.push('HTML_dataforge');
    allforge.browser_compatible.push('HTML_dataforge');
  }

  Pattern('HTML_dataforge', 'dataforge_core', {
    operationRegistry: {
      ConvertToHTML: {
        arguments: false,
        description: 'Convert an html object to an HTML string.',
        method: function () {
          let currentData = this.branches[this.currentBranch].data;
          if (!InstanceOf(currentData, 'html')) Doh.debug('ConvertToHTML: currentData is not an html object', currentData);
          return currentData.toHTML();
        }
      }
    }
  });

  Pattern('html_forge', ['html'], {
    // this is a helper pattern that can be used to convert a mold with handlebars into the .html property of an html object
    mold: ``,
    handlebars: {},
    object_phase: function () {
      const df = New('Dataforge');
      this.html = df.forge(this.mold, ['ApplyHandlebars'], this.handlebars);
    },
    newforhtml_phase: function () {
      this.inherited.html_forge.object_phase.apply(this);
    }
  });
});

