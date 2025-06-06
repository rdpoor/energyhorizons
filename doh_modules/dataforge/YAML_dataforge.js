Doh.Module('YAML_dataforge', ['dataforge_core', 'du_YAML'], function (du, allforge) {

  if (allforge) {
    allforge.nodejs_compatible.push('YAML_dataforge');
    allforge.browser_compatible.push('YAML_dataforge');
  }

  Pattern('YAML_dataforge', {
    // hard inherit from dataforge
    'dataforge_core': true,
  }, {
    operationRegistry: {
      ConvertToYAML: {
        arguments: false,
        description: 'Convert an object to YAML format.',
        method: function () {
          let currentData = this.branches[this.currentBranch].data;
          return du.toYaml(currentData);
        }
      },
      ConvertFromYAML: {
        arguments: false,
        description: 'Parse YAML string to an object.',
        method: function () {
          let currentData = this.branches[this.currentBranch].data;
          if (NotString(currentData)) Doh.debug('FromYAML: currentData is not a string', currentData);
          return du.fromYaml(currentData);
        }
      },
    }
  });
});