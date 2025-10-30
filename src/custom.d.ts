// Filename: src/custom.d.ts (REFACTORED)

// 1. ประกาศสำหรับไฟล์ .css ทั่วไป (ถ้ายังมีใช้)
declare module '*.css';

// 2. [สำคัญ] เพิ่มการประกาศสำหรับไฟล์ .module.css
// บรรทัดนี้จะบอก TypeScript ว่าเมื่อ import ไฟล์ .module.css
// ให้ถือว่า 'styles' เป็น Object ที่มี key เป็น string
declare module '*.module.css' {
  const classes: { [key: string]: string };
  export default classes;
}