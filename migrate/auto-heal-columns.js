const admin = require('firebase-admin');
const fs = require('fs');
const csv = require('csv-parser');

const DRY_RUN = false; // 🚨 ปลดล็อกรันจริงแล้ว จะทำการเขียนทับข้อมูลลง Database
const PROJECT_ID = 'project-001';

// 1. Initialize Firebase
const serviceAccount = require('./serviceAccountKey.json');
if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}
const db = admin.firestore();

// 2. Load and Parse Master CSV
function loadMasterCSV(filePath) {
    return new Promise((resolve, reject) => {
        const columnMap = {}; // column -> [{ zone, gridline }]
        
        fs.createReadStream(filePath)
            .pipe(csv({ headers: ['project', 'category', 'colName', 'zone', 'gridline'], skipLines: 1 }))
            .on('data', (row) => {
                const colName = (row['colName'] || '').trim().toUpperCase();
                const rawZone = (row['zone'] || '').trim(); 
                const rawGridline = (row['gridline'] || '').trim(); 
                
                if (!colName) return;
                
                // Format Zone to "โซน X"
                let cleanZone = rawZone;
                if (/zone/i.test(cleanZone)) {
                    cleanZone = cleanZone.replace(/zone/i, 'โซน').trim();
                } else if (/^\d+/.test(cleanZone)) {
                    cleanZone = `โซน ${cleanZone}`;
                }

                if (!columnMap[colName]) columnMap[colName] = [];
                columnMap[colName].push({ zone: cleanZone, gridline: rawGridline });
            })
            .on('end', () => resolve(columnMap))
            .on('error', reject);
    });
}

function cleanFloorName(floor) {
    if (!floor) return null;
    let text = String(floor).trim();
    
    // 🚨 หั่นคำว่า โซน หรือ Zone พร้อมตัวเลขทิ้งไปเลย
    text = text.replace(/\s*(โซน|zone)\s*[a-zA-Z0-9-]+\s*/ig, ' ').trim();

    if (!/^ชั้น/i.test(text) && /[0-9A-Z]/i.test(text)) {
        if (text.toLowerCase() !== 'ใต้ดิน' && text.toLowerCase() !== 'หลังคา') {
            text = `ชั้น ${text}`;
        }
    }
    
    return text.trim();
}

function cleanZoneName(zone) {
    if (!zone) return 'ไม่มีโซน';
    let text = String(zone).trim().toLowerCase();
    if (text === '-' || text === 'none' || text === 'ไม่มี' || text === 'ไม่มีโซน') return 'ไม่มีโซน';
    if (text.includes('zone')) text = text.replace('zone', 'โซน');
    if (!text.includes('โซน') && /^[0-9a-z]+$/.test(text)) text = `โซน ${text}`;
    return text.trim();
}

async function healData() {
    console.log(`[START] Running Auto-Heal (DRY_RUN=${DRY_RUN})`);
    
    console.log('Loading Master CSV...');
    const masterMap = await loadMasterCSV('./Column_options.csv');
    console.log(`Loaded ${Object.keys(masterMap).length} columns from Master Data.\n`);

    const collections = ['qcPhotos', 'sharedJobs', 'generatedReports'];
    const stats = {
        total: 0,
        skippedNoColumn: 0,
        skippedAmbiguous: 0,
        healedPerfectMatch: 0,
        healedFormatOnly: 0,
    };

    const backups = [];

    let logOutput = `สรุปผลการทำงาน AUTO HEAL (DRY RUN = ${DRY_RUN})\n=======================================================\n`;

    for (const collName of collections) {
        console.log(`Analyzing: /projects/${PROJECT_ID}/${collName}`);
        
        let path = collName === 'qcPhotos' ? 'qcPhotos' : `projects/${PROJECT_ID}/${collName}`;
        let query = db.collection(path);
        if (collName === 'qcPhotos') {
            query = query.where('projectId', '==', PROJECT_ID).where('category', '==', 'งานโครงสร้าง > งานเสา');
        }
        
        const snapshot = await query.get();
        console.log(` - Found ${snapshot.size} documents. Processing begins...`);
        
        let processedCount = 0;
        for (const doc of snapshot.docs) {
            processedCount++;
            if (processedCount % 100 === 0) {
                process.stdout.write(`\r   > ซ่อมแซมไปแล้ว... ${processedCount} / ${snapshot.size} รายการ`);
            }
            const data = doc.data();
            // qcPhotos has reportType undefined sometimes, relying on category query
            if (collName !== 'qcPhotos' && data.reportType !== 'QC') continue;
            
            stats.total++;
            const df = data.dynamicFields || {};
            
            const rawCol = df['เสาเบอร์'] || df['Column'] || '';
            const rawFloor = df['ชั้น'] || df['Floor'] || '';
            const rawZone = df['โซน'] || df['Zone'] || '';
            const rawGrid = df['Gridline'] || df['ระบุGridline'] || '';
            
            const col = rawCol.trim().toUpperCase();
            
            // 1. Skip if no column
            if (!col || col === 'ไม่มีชื่อเสา' || col === '-') {
                stats.skippedNoColumn++;
                continue;
            }

            const cleanFloor = cleanFloorName(rawFloor) || rawFloor;
            const cleanZone = cleanZoneName(rawZone);
            
            const masterRecords = masterMap[col];
            
            // 2. Cannot heal completely if not in master csv
            if (!masterRecords) {
                stats.skippedAmbiguous++;
                continue;
            }

            const newDf = { ...df };
            delete newDf['Floor']; delete newDf['Zone']; delete newDf['ระบุGridline']; delete newDf['Column'];
            
            newDf['เสาเบอร์'] = col;
            newDf['ชั้น'] = cleanFloor;

            let healed = false;
            let logDetail = '';

            // 3. Exactly 1 Match in CSV (Perfect Heal)
            if (masterRecords.length === 1) {
                const ideal = masterRecords[0];
                if (cleanZone !== ideal.zone || rawGrid !== ideal.gridline || rawCol !== col || rawFloor !== cleanFloor) {
                    newDf['โซน'] = ideal.zone;
                    newDf['Gridline'] = ideal.gridline;
                    healed = true;
                    stats.healedPerfectMatch++;
                    logDetail = `[PERFECT MATCH] ${col}\n   OLD: โซน=${rawZone}, Grid=${rawGrid}\n   NEW: โซน=${ideal.zone}, Grid=${ideal.gridline}`;
                }
            } 
            // 4. Multiple matches in CSV (Try to format or match existing zone)
            else {
                // Find if we can lock down by zone or gridline
                const matchedByZone = masterRecords.filter(r => r.zone === cleanZone);
                if (matchedByZone.length === 1) {
                    const ideal = matchedByZone[0];
                    if (rawGrid !== ideal.gridline || rawZone !== ideal.zone || rawCol !== col || rawFloor !== cleanFloor) {
                        newDf['โซน'] = ideal.zone;
                        newDf['Gridline'] = ideal.gridline;
                        healed = true;
                        stats.healedPerfectMatch++;
                        logDetail = `[ZONE MATCH] ${col} (Zone ${ideal.zone})\n   OLD: โซน=${rawZone}, Grid=${rawGrid}\n   NEW: โซน=${ideal.zone}, Grid=${ideal.gridline}`;
                    }
                } else if (cleanZone !== rawZone || cleanFloor !== rawFloor || col !== rawCol) {
                    // Just formatting heal
                    newDf['โซน'] = cleanZone;
                    healed = true;
                    stats.healedFormatOnly++;
                    logDetail = `[FORMAT ONLY] ${col}\n   OLD: ชั้น=${rawFloor}, โซน=${rawZone}\n   NEW: ชั้น=${cleanFloor}, โซน=${cleanZone}`;
                } else {
                    stats.skippedAmbiguous++;
                }
            }

            if (healed) {
                logOutput += `\n📄 ID: ${doc.id} (${collName})\n${logDetail}\n`;
                if (!DRY_RUN) {
                    backups.push({ 
                        collection: collName, 
                        id: doc.id, 
                        oldFields: df 
                    });
                    await doc.ref.update({ dynamicFields: newDf });
                }
            }
        }
        console.log(`\n - เสร็จสิ้นการประมวลผล ${collName} ✅\n`);
    }

    logOutput = `🔥 สรุปผลสรุป ( DRY_RUN = ${DRY_RUN} ) 🔥\n` + 
                `📌 เจอเอกสารงานเสาทั้งหมด: ${stats.total}\n` +
                `ข้าม (เพราะไม่มีชื่อเสา): ${stats.skippedNoColumn}\n` +
                `ข้าม (เพราะหาคู่ Match ไม่เจอ/Ambiguous): ${stats.skippedAmbiguous}\n` +
                `✅ ซ่อมแซมแบบ 100% (เจอคู่ Match เป๊ะ): ${stats.healedPerfectMatch}\n` +
                `✅ ซ่อมแซมแค่จัด Format คำ (Floor/Zone): ${stats.healedFormatOnly}\n` +
                `=======================================================\n\n` + logOutput;

    const logFileName = DRY_RUN ? 'AutoHeal_DryRun_Log.txt' : 'AutoHeal_Execution_Log.txt';
    fs.writeFileSync(logFileName, logOutput, 'utf8');
    
    if (!DRY_RUN && backups.length > 0) {
        fs.writeFileSync('AutoHeal_Backup.json', JSON.stringify(backups, null, 2), 'utf8');
        console.log(`\n[SAFE_BACKUP] Saved original data for ${backups.length} documents to AutoHeal_Backup.json`);
    }

    console.log(`\n[DONE] Finished. Results written to ${logFileName}`);
    console.log(`Healed ${stats.healedPerfectMatch + stats.healedFormatOnly} items.`);
}

healData().catch(console.error);
