// CLI implementation for cloud anchoring commands
let [p, {fsp}, YAML] = await Doh.load([
  'nodejs?? import * as p from "@clack/prompts"',
  'nodejs?? import { promises as fsp } from "fs"',
  'nodejs?? import YAML from "yaml"',
  'managed_site' // To access anchoring functions
]);

const DohTools = Doh.Globals.DohTools;
const runCoreCommand = new DohTools().runCoreCommand;

const args = process.argv.slice(2);
const command = args[1]; // 'anchor', 'anchor-as', or 'endpoint' in 'doh cloud anchor', 'doh cloud anchor-as', or 'doh cloud endpoint'
const url = args[2]; // Optional URL parameter or target user email for anchor-as

// Access cloud anchoring functions from global scope
const { performCloudAnchoring, performCloudAnchoringAs, isInstanceAnchored, clearSiteAuthToken } = Doh.CloudAnchoring || {};

if (!performCloudAnchoring) {
  console.error('❌ Cloud anchoring functionality not available. Make sure managed_site module is loaded.');
  process.exit(1);
}

// Function to update cloud endpoint in boot.pod.yaml
async function updateCloudEndpoint(endpoint) {
  try {
    const bootPodPath = DohPath('/boot.pod.yaml');
    
    // Read existing boot.pod.yaml
    let podContent;
    try {
      podContent = await fsp.readFile(bootPodPath, 'utf8');
    } catch (error) {
      if (error.code === 'ENOENT') {
        podContent = '';
      } else {
        throw error;
      }
    }
    
    let podYaml = YAML.parse(podContent) || {};
    
    // Ensure cloud section exists
    if (!podYaml.cloud) {
      podYaml.cloud = {};
    }
    
    // Set the endpoint
    podYaml.cloud.endpoint = endpoint;
    
    // Write back to file
    await fsp.writeFile(bootPodPath, YAML.stringify(podYaml));
    console.log(`✅ Cloud endpoint set to: ${endpoint}`);
    console.log('Updated /boot.pod.yaml');
    
    // Validate the setting actually took effect by recompiling pod and checking compiled result
    console.log('🔄 Recompiling pod to validate settings...');
    try {
      // Use direct pod compilation instead of full packager for efficiency
      await Doh.compile_host_pod();
      
      // Read the compiled pod to check if our setting took effect
      const compiledPodPath = DohPath('/.doh/compiled.pod.yaml');
      const compiledPodContent = await fsp.readFile(compiledPodPath, 'utf8');
      const compiledPod = YAML.parse(compiledPodContent);
      
      const actualEndpoint = compiledPod.cloud?.endpoint;
      
      if (actualEndpoint === endpoint) {
        console.log('✅ Setting validation passed - endpoint is active in compiled pod');
      } else {
        console.log('❌ Setting validation failed - endpoint was overridden!');
        console.log(`📋 Expected: ${endpoint}`);
        console.log(' ');
        await (new Doh.Globals.DohTools()).analyzePodSetting('cloud.endpoint');
        return false;
      }
    } catch (packagerError) {
      console.warn(`⚠️  Could not validate setting (packager error): ${packagerError.message}`);
      console.log('   The setting was written to boot.pod.yaml but validation failed.');
      console.log('   You may want to run "doh update" manually to check if it takes effect.');
    }
    
    return true;
  } catch (error) {
    console.error(`❌ Failed to update cloud endpoint: ${error.message}`);
    return false;
  }
}

if (Doh.logger) {
  Doh.logger.restoreConsole();
}

if (command === 'endpoint') {
  if (!url) {
    console.error('❌ Please provide a cloud endpoint URL');
    console.log('Usage: doh cloud endpoint <url>');
    console.log('Example: doh cloud endpoint https://deploydoh.com');
    process.exit(1);
  }
  
  console.log('\n🌩️  Doh Cloud Endpoint Configuration');
  console.log('═══════════════════════════════════════');
  
  const success = await updateCloudEndpoint(url);
  if (success) {
    console.log('\n✅ Cloud endpoint updated successfully!');
    console.log('You can now use: doh cloud anchor');
    process.exit(0);
  } else {
    process.exit(1);
  }
  
} else if (command === 'anchor-as') {
  // New anchor-as command
  const targetUserEmail = url; // For anchor-as, the URL parameter is actually the target user email
  
  if (!targetUserEmail) {
    console.error('❌ Please provide target user email');
    console.log('Usage: doh cloud anchor-as <target-user@site.com>');
    console.log('Example: doh cloud anchor-as user@deploydoh.com');
    process.exit(1);
  }
  
  // Check if cloud endpoint is configured
  if (!Doh.pod.cloud || !Doh.pod.cloud?.endpoint) {
    console.error('❌ Cloud anchoring pod settings not found or endpoint is not set.');
    console.error('Please set the cloud endpoint first using: doh cloud endpoint <url>');
    console.error('Example: doh cloud endpoint https://deploydoh.com');
    process.exit(1);
  }
  
  console.log('\n🌩️  Doh Cloud Anchor-As');
  console.log('═══════════════════════════════════════');
  console.log(`This will anchor your local Doh instance to the account: ${targetUserEmail}`);
  console.log(`Your ${Doh.pod.cloud.endpoint} credentials will be used for authorization and then discarded.`);
  console.log(`Note: You must have 'manage:cloud_anchoring' permission on the cloud manager.\n`);
  
  try {
    // Check if already anchored
    const alreadyAnchored = await isInstanceAnchored();
    if (alreadyAnchored) {
      console.log('✅ This instance is already anchored to Doh Cloud.');
      
      const shouldReanchor = await p.confirm({
        message: `Do you want to re-anchor this instance to ${targetUserEmail}?`,
        initialValue: false
      });
      
      if (p.isCancel(shouldReanchor) || !shouldReanchor) {
        p.cancel('Cloud anchoring cancelled');
        process.exit(0);
      }
      
      // Clear existing token
      await clearSiteAuthToken();
      console.log('Previous anchoring cleared.');
    }
    
    // Get requesting user credentials (not target user)
    const username = await p.text({
      message: `Enter your ${Doh.pod.cloud.endpoint} username (for authorization):`,
      placeholder: 'your-username',
      validate: (value) => {
        if (!value || value.trim().length === 0) {
          return 'Username is required';
        }
        return undefined;
      }
    });
    
    if (p.isCancel(username)) {
      p.cancel('Cloud anchoring cancelled');
      process.exit(0);
    }
    
    const userPassword = await p.password({
      message: `Enter your ${Doh.pod.cloud.endpoint} password (for authorization):`,
      validate: (value) => {
        if (!value || value.length === 0) {
          return 'Password is required';
        }
        return undefined;
      }
    });
    
    if (p.isCancel(userPassword)) {
      p.cancel('Cloud anchoring cancelled');
      process.exit(0);
    }
    
    // Perform anchor-as operation
    const s = p.spinner();
    s.start(`Connecting to Doh Cloud ${Doh.pod.cloud.endpoint} and anchoring instance on behalf of ${targetUserEmail}...`);
    
    if (!performCloudAnchoringAs) {
      s.stop('❌ Anchor-as functionality not available');
      console.error('\n❌ performCloudAnchoringAs function not available. Please update the managed_site module.');
      process.exit(1);
    }
    
    const result = await performCloudAnchoringAs(username.trim(), userPassword, targetUserEmail);
    
    if (result.success) {
      s.stop('✅ Cloud anchor-as successful!');
      console.log(`\n${result.message}`);
      console.log(`\n🎉 Your Doh instance is now anchored to ${targetUserEmail}'s account on ${Doh.pod.cloud.endpoint}!`);
      console.log(`The instance owner (${targetUserEmail}) can now manage this instance remotely through ${Doh.pod.cloud.endpoint}/admin/cloud .\n`);
      process.exit(0);
    } else {
      s.stop('❌ Cloud anchor-as failed');
      console.error(`\n${result.message}\n`);
      process.exit(1);
    }
    
  } catch (error) {
    console.error('\n❌ Unexpected error during cloud anchor-as:');
    console.error(error.message);
    process.exit(1);
  }

} else if (command === 'anchor') {
  // If URL provided, set endpoint first, then run update, then proceed with anchoring
  if (url) {
    console.log('\n🌩️  Doh Cloud Setup & Anchoring');
    console.log('═══════════════════════════════════════');
    console.log(`Setting cloud endpoint to: ${url}`);
    
    const endpointSuccess = await updateCloudEndpoint(url);
    if (!endpointSuccess) {
      process.exit(1);
    }
    
    console.log('\nProceeding with cloud anchoring...\n');
  }
  
  // Check if cloud endpoint is configured
  if (!Doh.pod.cloud || !Doh.pod.cloud?.endpoint) {
    console.error('❌ Cloud anchoring pod settings not found or endpoint is not set.');
    console.error('Please set the cloud endpoint first using: doh cloud endpoint <url>');
    console.error('Example: doh cloud endpoint https://deploydoh.com');
    process.exit(1);
  }
  
  console.log('\n🌩️  Doh Cloud Anchoring');
  console.log('═══════════════════════════════════════');
  console.log('This will anchor your local Doh instance to your Doh Cloud account.');
  console.log(`Your ${Doh.pod.cloud.endpoint} credentials will be used once and then discarded.\n`);
  
  try {
    // Check if already anchored
    const alreadyAnchored = await isInstanceAnchored();
    if (alreadyAnchored) {
      console.log('✅ This instance is already anchored to Doh Cloud.');
      
      const shouldReanchor = await p.confirm({
        message: 'Do you want to re-anchor with different credentials?',
        initialValue: false
      });
      
      if (p.isCancel(shouldReanchor) || !shouldReanchor) {
        p.cancel('Cloud anchoring cancelled');
        process.exit(0);
      }
      
      // Clear existing token
      await clearSiteAuthToken();
      console.log('Previous anchoring cleared.');
    }
    
    // Get credentials
    const username = await p.text({
      message: `Enter your ${Doh.pod.cloud.endpoint} username:`,
      placeholder: 'username',
      validate: (value) => {
        if (!value || value.trim().length === 0) {
          return 'Username is required';
        }
        return undefined;
      }
    });
    
    if (p.isCancel(username)) {
      p.cancel('Cloud anchoring cancelled');
      process.exit(0);
    }
    
    const userPassword = await p.password({
      message: `Enter your ${Doh.pod.cloud.endpoint} password:`,
      validate: (value) => {
        if (!value || value.length === 0) {
          return 'Password is required';
        }
        return undefined;
      }
    });
    
    if (p.isCancel(userPassword)) {
      p.cancel('Cloud anchoring cancelled');
      process.exit(0);
    }
    
    // Perform anchoring
    const s = p.spinner();
    s.start(`Connecting to Doh Cloud ${Doh.pod.cloud.endpoint} and anchoring instance...`);
    
    const result = await performCloudAnchoring(username.trim(), userPassword);
    
    if (result.success) {
      s.stop('✅ Cloud anchoring successful!');
      console.log(`\n${result.message}`);
      console.log(`\n🎉 Your Doh instance is now anchored to your ${Doh.pod.cloud.endpoint} account!`);
      console.log(`You can now manage this instance remotely through ${Doh.pod.cloud.endpoint}/admin/cloud .\n`);
      process.exit(0);
    } else {
      s.stop('❌ Cloud anchoring failed');
      console.error(`\n${result.message}\n`);
      process.exit(1);
    }
    
  } catch (error) {
    console.error('\n❌ Unexpected error during cloud anchoring:');
    console.error(error.message);
    process.exit(1);
  }
  
} else {
  console.log('\n🌩️  Doh Cloud Commands');
  console.log('═══════════════════════════════════════');
  console.log('Available commands:');
  console.log('  doh cloud endpoint <url>           - Set the cloud endpoint URL in boot.pod.yaml');
  console.log('  doh cloud anchor                   - Anchor this instance to your Doh Cloud account');  
  console.log('  doh cloud anchor <url>             - Set endpoint, run update, then anchor to cloud');
  console.log('  doh cloud anchor-as <user@site.com> - Anchor this instance on behalf of another user');
  console.log('\nUsage: doh cloud <command> [url|user-email]\n');
  process.exit(0);
}

