// Quick script to add orgCode and coachPasscode to existing organizations
// Run with: node add-org-codes.js

const admin = require('firebase-admin');
const serviceAccount = require('./firebase-service-account.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function addOrgCodes() {
  console.log('Adding orgCode and coachPasscode to existing organizations...');
  
  try {
    const orgsSnapshot = await db.collection('organizations').get();
    
    if (orgsSnapshot.empty) {
      console.log('No organizations found. Creating Demo High...');
      
      await db.collection('organizations').doc('DH').set({
        name: 'Demo High',
        abbr: 'DH',
        logo: '/assets/dragon.png',
        orgCode: 'DH2024',
        coachPasscode: 'COACH2024',
        primaryColor: '#8B1C21',
        secondaryColor: '#B9B9B9',
        loginPath: '/DH',
        createdAt: Date.now(),
      });
      
      console.log('✅ Created Demo High organization');
      return;
    }
    
    const batch = db.batch();
    let updateCount = 0;
    
    orgsSnapshot.forEach(doc => {
      const data = doc.data();
      const orgId = doc.id;
      
      // Only update if orgCode or coachPasscode is missing
      if (!data.orgCode || !data.coachPasscode) {
        const updates = {};
        
        if (!data.orgCode) {
          // Generate orgCode from abbr or id + year
          updates.orgCode = `${(data.abbr || orgId).toUpperCase()}2024`;
        }
        
        if (!data.coachPasscode) {
          // Default coach passcode
          updates.coachPasscode = 'COACH2024';
        }
        
        updates.updatedAt = Date.now();
        
        batch.update(doc.ref, updates);
        updateCount++;
        
        console.log(`  → ${orgId}: Adding orgCode=${updates.orgCode || data.orgCode}, coachPasscode=${updates.coachPasscode || data.coachPasscode}`);
      } else {
        console.log(`  ✓ ${orgId}: Already has orgCode and coachPasscode`);
      }
    });
    
    if (updateCount > 0) {
      await batch.commit();
      console.log(`\n✅ Updated ${updateCount} organization(s)`);
    } else {
      console.log('\n✅ All organizations already have orgCode and coachPasscode');
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
  
  process.exit(0);
}

addOrgCodes();
