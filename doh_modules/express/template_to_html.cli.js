await Doh.load('express_config');
const path = Doh.Globals.path;
const fs = Doh.Globals.fs;

const df = New('Dataforge');

// get args from the command line, assume the statement is `node doh t2h /path/to/html.template`
const args = process.argv.slice(2);
const templatePath = args[1];
const title = args[2];
const dependencies = args[3];
let remoteHost = args[4];

// if remoteHost is the path we are in, then just set to the empty string
if (!remoteHost) {
  remoteHost = '';
}

const DohPath = Doh.Globals.DohPath.Overload(Doh.Globals.DohPath(templatePath));

df.forge(remoteHost, [{ExportToGlobal: 'ClientLoadDohFrom'}]);

let importMapPath, importMapContents;
if (remoteHost) {
  importMapPath = remoteHost + '/dist/esm-bundles/remote-import-map.json';
  // fetch the import-map.json file from the remote host
  importMapContents = await fetch(importMapPath).then(response => response.text());
} else {
  importMapPath = DohPath('/doh_js/manifests/browser_esm_manifest.json');
  importMapContents = fs.readFileSync(importMapPath, 'utf8');
}
const templateFixed = df.forge(DohPath(templatePath), ['FromFile', 'ApplyHandlebars'], {
  // read in the import-map.json file from /dist/esm-bundles/
  importmap: importMapContents,
  title: title,
  ClientLoadDohFrom: remoteHost,
  "doh.js": `${remoteHost}/doh.js`,
  "deploy.js": `${remoteHost}/doh_js/deploy.js`,
  // doh_head: df.forge(null, [{ImportFrom: 'doh_head_template_path'}, 'FromFile']),
  head: '',
  dependencies: JSON.stringify(dependencies),
  // doh_body: df.forge(null, [{ImportFrom: 'doh_body_template_path'}, 'FromFile']),
  body: '',
});

// write the fixed template to the same folder as the template as filename.html
const outputPath = DohPath(path.join(path.dirname(DohPath.DohSlash(templatePath)), path.basename(templatePath, '.template') + '.html'));
fs.writeFileSync(outputPath, templateFixed);

console.log(`Template converted to ${outputPath}`);





