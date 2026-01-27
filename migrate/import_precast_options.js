const admin = require('firebase-admin');
const csv = require('csv-parser');
const fs = require('fs');
const path = require('path');

// Init Firebase
var serviceAccount = require("./serviceAccountKey.json");
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();

const CSV_FILE_PATH = path.join(__dirname, 'fix_csv.csv'); // Changed to fix_csv.csv

async function migrate() {
    const dataMap = {}; // { Project: { Category: { floors: Set, rooms: Set, codeNoteMap: Map } } }

    // 1. Read CSV
    console.log('Reading CSV from fix_csv.csv...');
    await new Promise((resolve, reject) => {
        fs.createReadStream(CSV_FILE_PATH)
            .pipe(csv())
            .on('data', (row) => {
                const project = row['Project'] ? row['Project'].trim() : '';
                const category = row['Category'] ? row['Category'].trim() : '';
                const floor = row['ชั้น'] ? row['ชั้น'].trim() : '';
                const room = row['ห้อง'] ? row['ห้อง'].trim() : '';
                const codeNote = row['Code note'] ? row['Code note'].trim() : '';

                if (project && category) {
                    if (!dataMap[project]) dataMap[project] = {};
                    if (!dataMap[project][category]) {
                        dataMap[project][category] = {
                            floors: new Set(),
                            rooms: new Set(),
                            roomToCodeNote: {} // Map: RoomName -> CodeNoteString
                        };
                    }

                    if (floor) dataMap[project][category].floors.add(floor);
                    if (room) {
                        dataMap[project][category].rooms.add(room);
                        if (codeNote) {
                            // Map Room to Code Note directly
                            dataMap[project][category].roomToCodeNote[room] = codeNote;
                        }
                    }
                }
            })
            .on('end', resolve)
            .on('error', reject);
    });

    // 1.1 [NEW] Clone Floor 4 to Floors 5-30
    // Since Room options and Code Notes are reused (Room 1 is Room 1 on every floor),
    // we just need to make sure "Floor 5" to "Floor 30" are available in the options.
    for (const project in dataMap) {
        for (const category in dataMap[project]) {
            const hasFloor4 = dataMap[project][category].floors.has('ชั้น 4');
            if (hasFloor4) {
                console.log(`Cloning floors 5-30 for ${category}...`);
                for (let i = 5; i <= 30; i++) {
                    dataMap[project][category].floors.add(`ชั้น ${i}`);
                }
            }
        }
    }

    // 2. Update Firestore
    for (const projectName in dataMap) {
        console.log(`Processing Project: ${projectName}`);

        // Find Project ID
        let projectQuery = await db.collection('projects').where('projectName', '==', projectName).limit(1).get();
        if (projectQuery.empty) {
            projectQuery = await db.collection('projects').where('name', '==', projectName).limit(1).get();
        }

        if (projectQuery.empty) {
            console.warn(`Project not found: ${projectName}`);
            continue;
        }

        const projectId = projectQuery.docs[0].id;
        console.log(`Found Project ID: ${projectId}`);

        for (const categoryName in dataMap[projectName]) {
            // Find SubCategory
            let subCatQuery = await db.collection(`projectConfig/${projectId}/subCategories`)
                .where('name', '==', categoryName).limit(1).get();

            if (subCatQuery.empty) {
                console.warn(`Category not found: ${categoryName}`);
                continue;
            }

            const catDoc = subCatQuery.docs[0];
            const catData = catDoc.data();
            const newData = dataMap[projectName][categoryName];

            const floorOptions = Array.from(newData.floors).sort();
            const roomOptions = Array.from(newData.rooms).sort(); // Sort rooms naturally if possible, currently string sort

            // Prepare Dynamic Fields
            const fieldsKey = catData.dynamicFields ? 'dynamicFields' : 'fields';
            let currentFields = catData[fieldsKey] || [];

            // Convert string fields to objects if needed
            if (currentFields.length > 0 && typeof currentFields[0] === 'string') {
                currentFields = currentFields.map(label => ({ label, type: 'text', options: [] }));
            }

            let isUpdated = false;
            const updatedFields = currentFields.map(field => {
                let newField = { ...field };

                if (newField.label === 'ชั้น') {
                    newField.options = floorOptions;
                    newField.type = 'autocomplete';
                    isUpdated = true;
                } else if (newField.label === 'ห้อง') {
                    newField.options = roomOptions;
                    newField.type = 'autocomplete';
                    isUpdated = true;
                } else if (newField.label === 'Code note' || newField.label === 'Code Note') {
                    // Start with empty options for Code note, as it will be auto-populated
                    // Or we could populate ALL unique code notes if manual selection is still allowed as fallback
                    // For now, let's keep it empty or maybe just a text field?
                    // User said "selected automatically", implies it fills in.
                    // Let's keep type 'text' or 'autocomplete' but no static options needed if 1:1 mapped
                    // But to be safe, let's make it autocomplete.
                    newField.options = [];
                    newField.type = 'autocomplete';
                    isUpdated = true;
                }
                return newField;
            });

            // Prepare Field Dependencies
            const fieldDependencies = {
                // When 'ห้อง' changes...
                "ห้อง": {
                    targetField: "Code note",
                    mapping: newData.roomToCodeNote
                }
            };

            // Update Firestore
            await catDoc.ref.update({
                [fieldsKey]: updatedFields,
                fieldDependencies: fieldDependencies
            });

            console.log(`✅ Updated SubCategory: ${categoryName}`);
            console.log(`   - Floor options: ${floorOptions.length}`);
            console.log(`   - Room options: ${roomOptions.length}`);
            console.log(`   - Dependency Mapped (Room -> CodeNote): ${Object.keys(newData.roomToCodeNote).length} entries`);
        }
    }
    console.log('Migration Complete.');
}

migrate().catch(console.error);