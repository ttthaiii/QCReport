const admin = require('firebase-admin');
const fs = require('fs');

// 1. Initialize Firebase
const serviceAccount = require('./serviceAccountKey.json');
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}
const db = admin.firestore();
const PROJECT_ID = 'project-001';

async function exportData() {
    console.log('Fetching sharedJobs and generatedReports...');
    
    // 2. Fetch data
    const sharedJobsSnapshot = await db.collection('projects').doc(PROJECT_ID).collection('sharedJobs').get();
    const generatedReportsSnapshot = await db.collection('projects').doc(PROJECT_ID).collection('generatedReports').get();
    
    console.log(`Found ${sharedJobsSnapshot.size} sharedJobs and ${generatedReportsSnapshot.size} generatedReports.`);
    
    const combinedData = [];
    
    // Helper to extract
    const processDoc = (doc, source) => {
        const data = doc.data();
        if (data.reportType !== 'QC') return;
        
        const df = data.dynamicFields || {};
        const floor = df['ชั้น'] || df['Floor'] || 'ไม่มีชั้น (Unknown)';
        const column = df['เสาเบอร์'] || df['Column'] || 'ไม่มีชื่อเสา';
        const zone = df['โซน'] || df['Zone'] || 'ไม่มีโซน';
        const gridline = df['Gridline'] || df['ระบุGridline'] || 'ไม่มี Gridline';
        
        combinedData.push({ floor, column, zone, gridline, source, id: doc.id });
    };
    
    sharedJobsSnapshot.forEach(doc => processDoc(doc, 'sharedJobs'));
    generatedReportsSnapshot.forEach(doc => processDoc(doc, 'generatedReports'));
    
    // 3. Group Data
    // Structure: grouped[floor][column] = Set of "โซน: X | Gridline: Y (from Source)"
    const grouped = {};
    
    combinedData.forEach(item => {
        if (!grouped[item.floor]) grouped[item.floor] = {};
        if (!grouped[item.floor][item.column]) grouped[item.floor][item.column] = new Set();
        
        grouped[item.floor][item.column].add(`- โซน: ${item.zone} | Gridline: ${item.gridline} [${item.source}]`);
    });
    
    // 4. Format Output
    let outputData = 'รายงานประวัติการกรอกข้อมูล งานเสา (แบ่งตามชั้น)\n';
    outputData += 'ดึงข้อมูลจาก sharedJobs และ generatedReports\n';
    outputData += '=======================================================\n\n';

    // Sort floors naturally (approximate)
    const sortedFloors = Object.keys(grouped).sort((a, b) => {
        const numA = parseInt(a.replace(/[^0-9]/g, '')) || 0;
        const numB = parseInt(b.replace(/[^0-9]/g, '')) || 0;
        if (numA !== numB) return numA - numB;
        return a.localeCompare(b);
    });

    sortedFloors.forEach(floor => {
        outputData += `🏢 ${floor}\n`;
        const columns = grouped[floor];
        
        const sortedColumns = Object.keys(columns).sort();
        sortedColumns.forEach(col => {
            outputData += `   📌 เสา: ${col}\n`;
            const details = Array.from(columns[col]).sort();
            details.forEach(detail => {
                outputData += `       ${detail}\n`;
            });
        });
        outputData += '\n';
    });
    
    // 5. Write to File
    const outputPath = './SharedJobs_Reports_Floor_Columns.txt';
    fs.writeFileSync(outputPath, outputData, 'utf8');
    console.log(`\n✅ Report generated successfully at: ${outputPath}`);
}

exportData().catch(console.error);
