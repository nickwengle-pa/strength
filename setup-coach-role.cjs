// Script to set up coach role for a user
// Run with: node setup-coach-role.cjs <uid>

const admin = require('firebase-admin');
const serviceAccount = require('./firebase-service-account.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function setupCoachRole() {
  const uid = process.argv[2];
  
  if (!uid) {
    console.log('Usage: node setup-coach-role.cjs <uid>');
    console.log('\nTo find your UID:');
    console.log('1. Sign in to the app');
    console.log('2. Open browser console');
    console.log('3. Run: firebase.auth().currentUser.uid');
    console.log('\nOr list all users with: node setup-coach-role.cjs --list');
    process.exit(1);
  }
  
  if (uid === '--list') {
    console.log('Fetching all users...\n');
    try {
      const listUsersResult = await admin.auth().listUsers(100);
      if (listUsersResult.users.length === 0) {
        console.log('No users found.');
      } else {
        listUsersResult.users.forEach((user) => {
          console.log(`UID: ${user.uid}`);
          console.log(`Email: ${user.email || 'N/A'}`);
          console.log(`Created: ${new Date(user.metadata.creationTime).toLocaleString()}`);
          console.log('---');
        });
      }
    } catch (error) {
      console.error('Error listing users:', error);
    }
    process.exit(0);
  }
  
  console.log(`Setting up coach role for UID: ${uid}`);
  
  try {
    // Check if user exists
    try {
      await admin.auth().getUser(uid);
    } catch (error) {
      console.error(`❌ User with UID ${uid} not found in Firebase Auth`);
      process.exit(1);
    }
    
    // Create or update roles document
    const roleRef = db.collection('roles').doc(uid);
    await roleRef.set({
      roles: ['coach', 'admin'],
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    
    console.log('✅ Coach and Admin roles set successfully!');
    console.log('\nYou can now:');
    console.log('1. Refresh your browser');
    console.log('2. Access /roster and /admin pages');
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
  
  process.exit(0);
}

setupCoachRole();
