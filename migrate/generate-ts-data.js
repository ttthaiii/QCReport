const fs = require('fs');
const csv = require('csv-parser');

const inputFile = './Column_options.csv';
const outputFile = '../src/utils/columnData.ts';

const columnMap = {};

fs.createReadStream(inputFile)
    .pipe(csv({ headers: ['project', 'category', 'colName', 'zone', 'gridline'], skipLines: 1 }))
    .on('data', (row) => {
        const colName = (row['colName'] || '').trim().toUpperCase();
        const rawZone = (row['zone'] || '').trim();
        const gridline = (row['gridline'] || '').trim();

        if (!colName) return;

        let cleanZone = rawZone;
        if (/zone/i.test(cleanZone)) {
            cleanZone = cleanZone.replace(/zone/i, 'โซน').trim();
        } else if (/^\d+/.test(cleanZone)) {
            cleanZone = `โซน ${cleanZone}`;
        }

        if (!columnMap[colName]) {
            columnMap[colName] = [];
        }
        
        // Prevent pure duplicates in mapping
        const isDuplicate = columnMap[colName].some(c => c.zone === cleanZone && c.gridline === gridline);
        if (!isDuplicate) {
            columnMap[colName].push({ zone: cleanZone, gridline: gridline });
        }
    })
    .on('end', () => {
        const fileContent = `// Auto-generated from Column_options.csv
export interface ColumnOption {
  zone: string;
  gridline: string;
}

export const COLUMN_OPTIONS: Record<string, ColumnOption[]> = ${JSON.stringify(columnMap, null, 2)};
`;
        fs.writeFileSync(outputFile, fileContent, 'utf8');
        console.log(`✅ Passed. Generated src/utils/columnData.ts with ${Object.keys(columnMap).length} columns.`);
    });
