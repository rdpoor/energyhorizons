import fs from "fs";
import DohTools from "../dohtools.js";

const dirsToRemove = [
  "libs/ace",
  "libs/chartjs",
  "libs/html2canvas",
  "libs/jsyaml",
  "libs/marked",
  "libs/prism",
  "libs/qrcode",
  "libs/roundslider",
  "libs/three",
  "modules/ajax",
  "modules/admin_dashboard",
  "modules/analytics_dashboard",
  "modules/banal",
  "modules/clear_empty_folders",
  "modules/crawlclone",
  "modules/dataforge",
  "modules/deploydoh_home",
  "modules/dlog",
  "modules/dohball_host",
  "modules/dohball_manager",
  "modules/du",
  "modules/export_browser",
  "modules/express",
  "modules/feedback",
  "modules/greenlockcli",
  "modules/html_differ",
  "modules/ide",
  "modules/manage_apps",
  "modules/managed_site",
  "modules/mcp",
  "modules/monaco_editor",
  "modules/package_manager",
  "modules/pages",
  "modules/pod_dashboard",
  "modules/prism",
  "modules/redbird",
  "modules/robotstxt",
  "modules/server_manager",
  "modules/sqlite3",
  "modules/tailwind",
  "modules/user"
];

let hadToRemove = [];

dirsToRemove.forEach(dir => {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
    hadToRemove.push(dir);
  }
});

function writeMigrationManifest() {
  const manifestPath = DohPath('/secrets/migrations/doh_js/0.2.46a.json');
  if (!fs.existsSync(manifestPath)) {
    fs.mkdirSync(DohPath('/secrets/migrations/doh_js'), { recursive: true });
    fs.writeFileSync(manifestPath, JSON.stringify({
      version: '0.2.46a',
      date: new Date().toISOString(),
      description: hadToRemove.length > 0 
        ? `Removed ${hadToRemove.length} director${hadToRemove.length === 1 ? 'y' : 'ies'} and ran 'doh clear-all -confirm-all'.`
        : 'No directories needed removal. Migration check complete.',
      directoriesRemoved: hadToRemove
    }, null, 2));
    console.log(`Migration manifest written to ${DohPath.Relative(manifestPath)}.`);
  } else {
    console.log(`Migration manifest ${DohPath.Relative(manifestPath)} already exists.`);
  }
}

if (hadToRemove.length > 0) {
  console.warn("Migration for 0.2.46a: Removed the following directories:");
  console.log(hadToRemove.join(", "));
  
  console.log("Running `doh clear-all -confirm-all`...");
  try {
    await (new DohTools()).clearAll(true);
  } catch (error) {
    console.error(`Error running 'doh clear-all -confirm-all': ${error.stack}`);
  }

  writeMigrationManifest();

} else {
  console.log("Migration for 0.2.46a: No directories required removal.");
  writeMigrationManifest();
}
