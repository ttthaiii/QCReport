const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const serviceAccountPath = path.join(__dirname, 'serviceAccountKey.json');
if (!fs.existsSync(serviceAccountPath)) {
    console.error('❌ Error: serviceAccountKey.json not found!');
    process.exit(1);
}

admin.initializeApp({
    credential: admin.credential.cert(require(serviceAccountPath))
});

const db = admin.firestore();

async function exportData() {
    console.log('🔍 Fetching database records...');
    const snapshot = await db.collection('latestQcPhotos')
        .where('reportType', '==', 'QC')
        .get();

    // Map: Floor -> Map<ColName, Set<Zone + Gridline>>
    const floorsMap = new Map();

    snapshot.forEach(doc => {
        const data = doc.data();
        if (data.category?.includes('เสา') || data.topic?.includes('เสา')) {
            const floorRaw = data.dynamicFields && data.dynamicFields['ชั้น'] ? data.dynamicFields['ชั้น'].trim() : 'ไม่มีชั้น (Unknown)';
            
            let floor = floorRaw;
            if (floorRaw.includes('โซน')) {
                floor = floorRaw.split(/ โซน |โซน/)[0].trim();
            }

            const rawColName = data.dynamicFields && (data.dynamicFields['เสาเบอร์'] || data.dynamicFields['เบอร์เสา'] || data.dynamicFields['ชื่อเสา']);
            const colName = rawColName ? rawColName.trim() : 'ไม่มีชื่อเสา';
            
            let zone = data.dynamicFields && data.dynamicFields['โซน'] ? data.dynamicFields['โซน'].trim() : '';
            if (!zone && floorRaw.includes('โซน')) {
                const parts = floorRaw.split(/ โซน |โซน/);
                if (parts.length >= 2) zone = `โซน ${parts[1].trim()}`;
            }

            const gridline = data.dynamicFields && data.dynamicFields['Gridline'] ? data.dynamicFields['Gridline'].trim() : '';
            
            const zoneDisplay = zone ? zone : 'ไม่มีโซน';
            const gridlineDisplay = gridline && gridline !== '-' ? gridline : 'ไม่มี Gridline';

            if (!floorsMap.has(floor)) {
                floorsMap.set(floor, new Map());
            }

            const colsMap = floorsMap.get(floor);
            if (!colsMap.has(colName)) {
                colsMap.set(colName, new Set());
            }

            colsMap.get(colName).add(`โซน: ${zoneDisplay} | Gridline: ${gridlineDisplay}`);
        }
    });

    console.log(`\n================ สร้างรายงานประวัติข้อมูล... ================`);
    let output = "รายงานประวัติการกรอกข้อมูล งานเสา (แบ่งตามชั้น)\n";
    output += "ดึงข้อมูลจาก latestQcPhotos\n=======================================================\n\n";

    // Sort floors loosely (e.g. ชั้น 1, ชั้น 2, ชั้น 10)
    const sortedFloors = Array.from(floorsMap.keys()).sort((a, b) => {
        const numA = parseInt(a.replace(/\D/g, '')) || 0;
        const numB = parseInt(b.replace(/\D/g, '')) || 0;
        if (numA !== numB) return numA - numB;
        return a.localeCompare(b);
    });

    for (const floor of sortedFloors) {
        output += `🏢 ${floor}\n`;
        const colsMap = floorsMap.get(floor);
        
        // Sort columns (e.g. C1, C2, C10)
        const sortedCols = Array.from(colsMap.keys()).sort((a, b) => {
            const numA = parseInt(a.replace(/\D/g, '')) || 0;
            const numB = parseInt(b.replace(/\D/g, '')) || 0;
            if (numA !== numB) return numA - numB;
            return a.localeCompare(b);
        });

        for (const col of sortedCols) {
            output += `   📌 เสา: ${col}\n`;
            const histories = Array.from(colsMap.get(col)).sort();
            for (const history of histories) {
                output += `       - ${history}\n`;
            }
        }
        output += `\n`;
    }

    const outputPath = path.join(__dirname, 'Database_Floor_Columns_Report.txt');
    fs.writeFileSync(outputPath, output, 'utf8');
    
    console.log(`✅ เขียนไฟล์สำเร็จ! สร้างไฟล์แจกแจงประวัติทุกชั้นไว้ที่:\n   -> ${outputPath}`);
    process.exit(0);
}

exportData();
