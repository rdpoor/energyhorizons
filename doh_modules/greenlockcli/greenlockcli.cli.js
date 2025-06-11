import * as p from '@clack/prompts';
await Doh.load('doh_js');
Doh.pod.letsencrypt.force_renewal = true;
await Doh.load('greenlockcli');

// console.log('Waiting 60 seconds to ensure the certificates are renewed\nCtrl-C to cancel');
await p.spinner('Waiting 60 seconds to ensure the certificates are renewed, Ctrl-C to cancel', {
  interval: 1000,
  limit: 60,
});
await setTimeout(()=>{
  p.stop();
},60000);
