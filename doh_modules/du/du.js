window.du = window.du || {};
Doh.Module('du', ['du_YAML', 'du_JSON'], function (du) {
  Doh.meld_objects(du, {
    // the purpose of 'du' is to provide a clean way to build utility functions that meet a number of different needs
    
  });
});
Doh.Module('du_YAML', ['yaml'], function (du, YAML) {
  Doh.meld_objects(du, {
    toYaml: data => YAML.stringify(data),
    fromYaml: data => YAML.parse(data),
  });
});
Doh.Module('du_JSON', function (du) {
  Doh.meld_objects(du, {
    toJson: data => JSON.stringify(data),
    fromJson: data => JSON.parse(data),
  });
});