console.log('Running Greenlock CLI: force-greenlock');

await Doh.load('doh_js');
Doh.pod.letsencrypt.force_renewal = true;
await Doh.load('greenlockcli');
process.exit(0);