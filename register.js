const readline = require('readline');
const fs = require('fs');
const path = require('path');
const { register, authenticate } = require('./notification_app_be/registerAndAuth');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const defaultDetails = {
  email: 'jivanshumitt1052@gmail.com',
  name: 'Jivanshu Mittal',
  rollNo: '2315001034',
  githubUsername: 'Jivanshu-Mittal'
};

function askQuestion(query) {
  return new Promise((resolve) => rl.question(query, resolve));
}

async function main() {
  console.log('=== Affordmed Evaluation Server Registration Helper ===\n');
  console.log('Using student profile:');
  console.log(`  Name: ${defaultDetails.name}`);
  console.log(`  Email: ${defaultDetails.email}`);
  console.log(`  Roll No: ${defaultDetails.rollNo}`);
  console.log(`  GitHub Username: ${defaultDetails.githubUsername}\n`);

  const accessCode = await askQuestion('Enter your Access Code (from your email): ');
  if (!accessCode.trim()) {
    console.error('Error: Access Code is required.');
    rl.close();
    return;
  }

  const mobileNo = await askQuestion('Enter your Mobile Number (default: 9999999999): ');
  const finalMobileNo = mobileNo.trim() || '9999999999';

  rl.close();

  console.log('\nRegistering...');
  const regResponse = await register({
    ...defaultDetails,
    mobileNo: finalMobileNo,
    accessCode: accessCode.trim()
  });

  if (!regResponse) {
    console.error('\nRegistration failed. Please verify your access code.');
    return;
  }

  const clientID = regResponse.clientId || regResponse.clientID;
  const clientSecret = regResponse.clientSecret;

  console.log('\nRegistration Success!');
  console.log(`  Client ID: ${clientID}`);
  console.log(`  Client Secret: ${clientSecret}`);

  console.log('\nAuthenticating to obtain access token...');
  const authResponse = await authenticate({
    ...defaultDetails,
    accessCode: accessCode.trim(),
    clientID,
    clientSecret
  });

  if (!authResponse || !authResponse.access_token) {
    console.error('\nAuthentication failed.');
    return;
  }

  const token = authResponse.access_token;
  console.log('\nAuthentication Success!');
  console.log(`Token: ${token.substring(0, 30)}...`);

  // Write to .env.local for frontend
  const envPath = path.join(__dirname, 'notification_app_fe', '.env.local');
  const envContent = `# API Token for evaluation service\nNEXT_PUBLIC_API_TOKEN=${token}\n`;
  fs.writeFileSync(envPath, envContent, 'utf8');
  console.log(`\nSuccessfully wrote NEXT_PUBLIC_API_TOKEN to ${envPath}`);

  console.log('\nPlease run the backend with:');
  console.log(`  $env:API_TOKEN="${token}"`);
  console.log('  node notification_app_be/priorityInbox.js');
}

main().catch(console.error);
