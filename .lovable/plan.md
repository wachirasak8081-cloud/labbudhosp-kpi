# แผน: Dashboard ตาม mockup (visual reference) พร้อมคำนวณ derived

## ข้อตกลงเบื้องต้น
- สถานะ `target_condition = 'eq'` (เป้า 100%) จะผ่านเมื่อค่า == เป้าเป๊ะ (ตามภาพต้นแบบ) ไม่มีช่วงเหลือง
- แท่งปี 2569 ในกราฟเปรียบเทียบ คำนวณจากค่าเฉลี่ยรายเดือนของปีปัจจุบัน ส่วนปี 2566-2568 ใช้ `annual_objective_summary`
- Tooltip รายเดือนบนกราฟจะใช้ได้กับปีปัจจุบันที่มี `measurements` ปีย้อนหลังแสดงค่าเฉลี่ยรายปี

## 1. Design tokens / โทนสี / ฟอนต์
- เปลี่ยน font ใน `src/routes/__root.tsx` เป็น `Noto Sans Thai` (weight 400-800)
- อัปเดต CSS variables ใน `src/styles.css` ให้ตรง mockup:
  - พื้นหลัง `#F7F9FC`, card `#FFFFFF`, border `#E7EBF0`, text `#1E293B`, muted `#94A3B8`
  - success `#16A34A` / success-bg `#ECFDF3`, destructive `#DC2626` / destructive-bg `#FEF2F2`, warning `#D97706` / warning-bg `#FFFBEB`, accent `#2563EB` / accent-bg `#EFF4FF`
- ปรับ `src/routes/_authenticated/route.tsx` ให้ header เป็น topbar สีขาว มุมโค้ง 16px แบบ mockup (hamburger, ชื่อหน้า, ปีงบประมาณ, ปุ่ม +, โปรไฟล์)
- เปลี่ยนพื้นหลัง main content เป็น `#F7F9FC`

## 2. Derived calculation engine (ใหม่)
- สร้าง `src/lib/indicator-calc.ts`
- `calculateIndicatorValue({ indicator, allIndicators, measurements, fiscalMonths })` คำนวณแบบ recursive:
  - leaf: ใช้ `calculated_value` ของเดือน (yearly ใช้ carry-forward ค่าล่าสุดในปี)
  - KPI4: `100 - avg(QI4.1, QI4.2)`
  - KPI/Objective/QI อื่น ๆ: average ของ children (subQI → QI → KPI → Objective)
- `getMonthlyValues(...)` สำหรับสร้าง 12 ค่าเดือน (fiscal) รองรับ sparkline / tooltip

## 3. Status rule
- แก้ `src/lib/indicator-status.ts` ให้ `target_condition === 'eq'` แสดง green เฉพาะเมื่อ `|value - target| < 0.001` (เหมือนภาพต้นแบบ) ไม่มีช่วง yellow
- เกณฑ์ gte/lte/eq อื่น ๆ ยังคงเดิม (green/yellow/red)

## 4. Filter & state
- เปลี่ยน filter เป็น `ทั้งปี | รายไตรมาส | รายเดือน`
- เพิ่ม dropdown รองสำหรับเลือก Q1-Q4 หรือ เดือน (ต.ค. – ก.ย.)
- เก็บ filter ใน URL search params ผ่าน `validateSearch` ของ dashboard route (`src/routes/_authenticated/dashboard.tsx`)
- เมื่อเปลี่ยน filter ทุกส่วน (Objective cards, KPI cards, chart, table) อัปเดตทันที

## 5. Dashboard layout (`src/routes/_authenticated/dashboard.tsx`)
- ดึงข้อมูล: indicators, measurements, annual_objective_summary, corrective_actions
- คำนวณค่าทุกระดับด้วย `calculateIndicatorValue` แทนที่จะอ่านค่า parent ที่เก็บไว้โดยตรง
- **Objective cards**: 4-col grid (4→2→1), ชื่อ, ค่า, ลูกศร trend, เป้า, เทียบกับช่วงก่อนหน้า
- **Yearly bar chart**: Recharts BarChart แสดง 4 ปีต่อ 1 Objective, legend ด้านบน, label ค่าบนแท่ง, custom tooltip แสดงรายเดือน (ปีปัจจุบัน)
- **KPI cards**: 3-col grid (3→1), มี border-top สี green/red, badge สถานะ, ปุ่ม "รายละเอียด", ชื่อ KPI, หมวดที่, ค่าใหญ่, สถานะ, เป้า, gradient slider, info boxes (เป้า/เฉลี่ย, ส่วนต่าง), trend sparkline, footer "เดือนที่ผ่านเกณฑ์ X/Y"
- **Non-conforming table**: leaf indicators (QI/subQI) ที่ไม่ผ่านเกณฑ์ เรียงตามส่วนต่าง, แสดงสถานะ CAPA badge
- **Recording stats**: progress bars แบบ mockup
- คลิกการ์ด/ปุ่มรายละเอียด → ไป `/dashboard/indicator/$id`

## 6. KPI detail page
- ปรับ `src/routes/_authenticated/dashboard.indicator.$id.tsx` ให้ใช้ card style / สี / ระยะห่างเดียวกับ mockup
- ยังคงแสดง trend line, ตารางรายเดือน, children comparison, CAPA list

## 7. รองรับ responsive
- Objective cards: 4 → 2 → 1
- KPI cards: 3 → 1
- ตารางและกราฟ scroll-x เมื่อจอแคบ

## 8. ตรวจสอบ
- รัน `tsgo --noEmit` ตรวจสอบ type
- ทดสอบ filter ทั้ง 3 โหมดแล้วค่าทุกส่วนอัปเดต
- ตรวจ KPI4 / QI4.x แสดง 4 ทศนิยม
- ตรวจสี / ระยะห่าง / มุมโค้งให้ตรง mockup

## ไฟล์ที่แก้ไข/สร้าง
- `src/routes/__root.tsx` (font link)
- `src/styles.css` (design tokens)
- `src/routes/_authenticated/route.tsx` (topbar)
- `src/lib/indicator-calc.ts` (ใหม่)
- `src/lib/indicator-status.ts` (eq rule)
- `src/routes/_authenticated/dashboard.tsx` (redesign)
- `src/routes/_authenticated/dashboard.indicator.$id.tsx` (styling)