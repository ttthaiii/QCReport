const admin = require('firebase-admin');
const fs = require('fs');

const DRY_RUN = false; // Set to true to test without modifying DB
const PROJECT_ID = 'project-001';

// [1] Initialize Firebase
let serviceAccount;
try {
  serviceAccount = require('./serviceAccountKey.json');
} catch (error) {
  console.error('❌ ไม่พบไฟล์ serviceAccountKey.json');
  process.exit(1);
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function syncSharedJobs() {
  console.log(`[START] Running Sync SharedJobs (DRY_RUN=${DRY_RUN})`);
  let syncedCount = 0;
  let completedCount = 0;
  
  const jobsRef = db.collection('projects').doc(PROJECT_ID).collection('sharedJobs');
  const photosRef = db.collection('qcPhotos');

  // Fetch all pending 'งานเสา' jobs
  const jobsSnapshot = await jobsRef
    .where('status', '==', 'pending')
    .where('subCategory', '==', 'งานเสา')
    .get();

  console.log(`Found ${jobsSnapshot.size} pending 'งานเสา' jobs to check.`);

  // To avoid querying qcPhotos thousands of times, let's fetch all 'งานเสา' photos once 
  // and process matching in memory for blazing fast performance.
  console.log(`Fetching all 'งานเสา' photos for in-memory matching...`);
  const photosSnapshot = await photosRef
    .where('projectId', '==', PROJECT_ID)
    .where('category', '==', 'งานโครงสร้าง > งานเสา')
    .get();
    
  console.log(`Found ${photosSnapshot.size} qcPhotos for 'งานเสา'.`);
  
  const allPhotos = [];
  photosSnapshot.forEach(doc => {
      allPhotos.push({ id: doc.id, ...doc.data() });
  });

  // Loop through pending jobs
  for (const jobDoc of jobsSnapshot.docs) {
      const job = jobDoc.data();
      const jobDynamicFields = job.dynamicFields || {};
      const jobFilterKeys = Object.keys(jobDynamicFields);
      
      // Find matching photos
      const matchingPhotos = allPhotos.filter(photo => {
          const photoDynamicFields = photo.dynamicFields || {};
          // Must match every dynamic field exactly
          return jobFilterKeys.every(key => {
              const jobValue = String(jobDynamicFields[key]).trim().toLowerCase();
              const photoValue = String(photoDynamicFields[key] || '').trim().toLowerCase();
              return jobValue === photoValue;
          });
      });
      
      // Count unique topics
      const uniqueTopics = new Set();
      matchingPhotos.forEach(p => {
          if (p.topic) {
              uniqueTopics.add(p.topic);
          }
      });
      
      const realCompletedTopics = uniqueTopics.size;
      const totalTopics = job.totalTopics || 8; // Usually 8 for columns
      
      // Determine if it needs updating
      if (realCompletedTopics > (job.completedTopics || 0)) {
          console.log(`\nJob ID: ${jobDoc.id} (${Object.values(jobDynamicFields).join(' / ')})`);
          console.log(` - Cached Count: ${job.completedTopics}/${totalTopics}`);
          console.log(` - Real Count: ${realCompletedTopics}/${totalTopics}`);
          
          let updateData = {
              completedTopics: realCompletedTopics,
              lastUpdatedAt: new Date().toISOString()
          };
          
          if (realCompletedTopics >= totalTopics) {
              updateData.status = 'completed';
              console.log(` - Status Update: pending -> completed ✅`);
              completedCount++;
          }
          
          if (!DRY_RUN) {
              await jobDoc.ref.update(updateData);
          }
          syncedCount++;
      }
  }

  console.log(`\n[DONE] Finished Syncing.`);
  console.log(` - Total Jobs Updated: ${syncedCount}`);
  console.log(` - Jobs Marked as Completed: ${completedCount}`);
}

syncSharedJobs().catch(console.error);
