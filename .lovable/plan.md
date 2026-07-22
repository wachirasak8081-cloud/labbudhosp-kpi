# Plan: ปรับ Dashboard ตาม PDF และจัดลำดับการคำนวณให้ตรง Excel

## เป้าหมาย
- เปลี่ยน `Dashboard` ให้มีเลย์เอาต์ สี และข้อมูลตรงตามไฟล์ `Dash_KPI.pdf` (หน้า 1-3)
- ทำให้การคำนวณและแสดงตัวเลขทุกหน้าตรงกับโครงสร้าง/สูตรใน `indicators-export-2026-07-22.xlsx`
- รองรับตัวชี้วัดความถี่ `yearly` (กรอกครั้งเดียวต่อปี แล้วนำค่าเดิมมาเฉลี่ยกับรายเดือน)
- เมื่อชี้ (hover) ที่กราฟ Dashboard KPI ทุกเส้น ให้ Tooltip แสดงข้อมูลรายเดือน

## 1. Database / Schema (migration)

### 1.1 ตารางเก็บค่า Objective ย้อนหลังรายปี
สร้าง `public.annual_objective_summary`:
- `id` (uuid), `objective_id` (FK → indicators), `fiscal_year` (int), `value` (numeric), `created_at`, `updated_at`
- GRANT + RLS + `update_updated_at` trigger

เป้าหมาย: แยกค่าสรุปรายปีของ Objective (ที่ไม่ได้คำนวณจาก leaf ได้โดยตรง) ออกจาก `measurements` เพื่อแสดงตาราง 2566-2569 ในหน้า Dashboard

### 1.2 ปรับ backend function คำนวณ
แก้ไข `public.recompute_parent_measurement`:
- KPI4: `100 - AVG(QI4.1, QI4.2)` เก็บด้วย precision สูง (numeric ไม่ rounded)
- ตัวชี้วัด `frequency='yearly'`: ถ้าเดือนใดไม่มีค่า ให้ใช้ค่าล่าสุดในปีงบประมาณเดียวกันมาเฉลี่ย (carry-forward) แทนการถือเป็น 0/null
- คง logic อื่นไว้

แก้ไข `public.measurements_compute_leaf`:
- รับรอง QI4.1/QI4.2: `(numerator/denominator)*100` เก็บ precision สูง

## 2. Dashboard (`src/routes/_authenticated/dashboard.tsx`) — redesign

### 2.1 Header
- ชื่อหน้า: `แดชบอร์ดภาพรวม`
- ตัวกรอง: `ทั้งปี` / เดือน ตามลำดับเดือนงบประมาณ
- แสดงปีงบประมาณ + ผู้ใช้/สิทธิ์

### 2.2 Objective Cards (1-4)
จัดวางเป็นกริด 4 ใบ (ตาม PDF):
- ชื่อ Objective, ค่าปัจจุบัน, เป้าหมาย, ไฟกระพริบสี
- เทียบเดือนก่อน (ค่า + ส่วนต่าง)
- คำนวณจาก KPI/QI/sub-QI ที่เกี่ยวข้อง โดยรวมตัวชี้วัด `yearly` เข้าเฉลี่ยด้วย

### 2.3 ตารางเปรียบเทียบปี 2566-2569
แสดงตาราง 4 ปีย้อนหลัง (objective × ปี) ดึงจาก `annual_objective_summary`:
- ใช้ค่าจาก PDF หน้า 1:
  - 2566: 98.63 / 84.81 / 85.68 / 92.15
  - 2567: 97.85 / 86.45 / 93.27 / 91.36
  - 2568: 98.46 / 86.58 / 95.92 / 91.89
  - 2569 (ต.ค.68-มี.ค.69): 96.90 / 89.13 / 96.91 / 93.25

### 2.4 KPI Cards (KPI1-KPI11)
แสดงเป็น cards แบบ PDF (หน้า 2):
- ชื่อ KPI, หมวดที่, ค่า, สถานะผ่าน/ไม่ผ่าน, เป้าหมาย, ค่าเฉลี่ย, ส่วนต่างจากเป้า, trend รายเดือน, `เดือนที่ผ่านเกณฑ์: X/Y เดือน`
- Click card → ไป `/dashboard/indicator/$id` ซึ่งแสดง QI/Sub-QI ที่เกี่ยวข้อง

### 2.5 KPI Matrix รายเดือน
ตาราง 12 เดือน × KPI11 (ตาม PDF หน้า 1) พร้อมสีพื้นหลังตามเงื่อนไขเป้าหมาย

### 2.6 กราฟเส้น KPI รายเดือน + Hover Tooltip
- ปรับ Recharts `<LineChart>` ให้มี Tooltip แสดงค่าทุก KPI ในเดือนนั้น
- เมื่อ hover ที่จุดบนเส้น แสดงชื่อ KPI, เดือน, ค่า, เป้าหมาย, สถานะผ่าน/ไม่ผ่าน
- ใช้ `formatIndicatorValue` เพื่อแสดง KPI4/QI4.1/QI4.2 4 ทศนิยม

### 2.7 Alert Panel + สถิติการบันทึก
คงส่วน “ตัวชี้วัดที่ไม่ผ่านเกณฑ์” และ “สถิติการบันทึก” ไว้ ปรับให้สอดคล้องกับ PDF หน้า 3

## 3. การคำนวณและฟอร์แมตตัวเลขในทุกหน้า

### 3.1 Utility ใหม่
สร้าง `src/lib/indicator-format.ts`:
```
formatIndicatorValue(code: string, value: number | null): string
```
- KPI4 / QI4.1 / QI4.2 → 4 ทศนิยม
- ตัวชี้วัดอื่น → 2 ทศนิยม

### 3.2 หน้าที่นำไปใช้
- Dashboard
- Reports (matrix, annual, recording, compare)
- Data Entry
- Indicator Detail (`dashboard/indicator/$id`)
- Targets
- CAPA

### 3.3 สถานะ/สี
ยึดตาม `src/lib/indicator-status.ts`:
- green = ผ่าน, yellow = ใกล้เกณฑ์ ±2%, red = ต่ำกว่า
- รองรับ `is_inverted` เช่น QI4.1/QI4.2 (ยิ่งน้อยยิ่งดี)

## 4. รองรับตัวชี้วัด `yearly`

### 4.1 ฝั่ง Backend
- ปรับ `recompute_parent_measurement` ให้เติมค่า `yearly` ที่เดือนอื่นโดยใช้ค่าเดียวกัน (carry-forward) ก่อนคำนวณค่าเฉลี่ย

### 4.2 ฝั่ง Data Entry
- ใน `src/routes/_authenticated/data-entry.index.tsx`:
  - ตัวชี้วัด `yearly` แสดงเฉพาะเดือนเริ่มต้นปีงบประมาณ (ต.ค.)
  - หรือแสดงทุกเดือนแต่ล็อกให้ใช้ค่าเดียวกัน (editable ที่เดือนแรก แล้วอัปเดตทุกเดือน)
  - คำนวณ/แสดงผลด้วยสูตรเดิม

## 5. ข้อมูลตัวอย่าง (seed)

### 5.1 Objective historical data
ใช้ `supabase--insert` เพิ่มค่า objective ปี 2566-2569 จาก PDF หน้า 1 ลง `annual_objective_summary` (หลัง migration สร้างตาราง)

### 5.2 ตรวจสอบ indicators ตรง Excel
ตรวจสอบว่า `indicators` ใน DB ตรงกับ Excel ทั้ง 144 รายการ (โดยเฉพาะ parent_code, formula, target, frequency, is_inverted) — ถ้าไม่ตรง ให้ปรับผ่าน insert/update

## 6. ไฟล์ที่แก้ไข/สร้าง
- `src/routes/_authenticated/dashboard.tsx` (redesign)
- `src/lib/indicator-format.ts` (ใหม่)
- `src/routes/_authenticated/reports.tsx`
- `src/routes/_authenticated/data-entry.index.tsx`
- `src/routes/_authenticated/dashboard.indicator.$id.tsx`
- `src/routes/_authenticated/targets.tsx`
- `src/routes/_authenticated/capa.tsx`
- migration: `annual_objective_summary` + แก้ functions

## 7. ตรวจสอบ
- Dashboard ตรง PDF ทุกส่วน
- Hover บนกราฟ KPI แสดง Tooltip รายเดือน
- ค่า KPI4/QI4.1/QI4.2 แสดง 4 ทศนิยมทุกหน้า
- ตัวชี้วัด `yearly` เฉลี่ยได้ถูกต้อง
- การเรียงลำดับ Objective → KPI → QI → sub-QI ยังคงใช้ `sortIndicators` อยู่
