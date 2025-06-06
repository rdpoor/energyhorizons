# Doh.Install Function

The Doh.Install function in Doh provides a powerful mechanism for defining installation instructions for modules, allowing server-side execution of setup tasks during various package management operations.

## Function Structure

Doh.Install takes the following form:

```javascript
Doh.Install(module_name, install_instructions);
```

- `module_name`: String identifying the module
- `install_instructions`: Object or Array specifying npm packages to install

## Installation Instructions

Install instructions can be provided in multiple formats:

1. As an object:
```javascript
Doh.Install('my-module', {
  'npm:package-name': '^1.2.3',
  'npm:another-package': '~2.0.0'
});
```

2. As an array:
```javascript
Doh.Install('my-module', [
  'npm:package-name',
  'npm:another-package'
]);
```

## Integration with Browser Files

Doh.Install can be included in browser-facing files, but its execution is server-side:

```javascript
// This file can be loaded in the browser
Doh.Module('my-module', ['dependency1'], function() {
  // Browser-side module code
});

Doh.Install('my-module', {
  // installed on the server
  'npm:server-package': '^1.0.0'
});
```