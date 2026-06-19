# Phase 2 — จัดการตัวชี้วัด 4 ระดับ + นำเข้า Excel + Seed ข้อมูลจริง

## 1. Sidebar & Layout
- ปรับเมนูเป็น 6 รายการตามสเปก: แดชบอร์ดภาพรวม / ตัวชี้วัด (admin,manager) / บันทึกข้อมูล `/data-entry` (staff,manager) / CAPA-CQI / รายงาน / ตั้งค่า `/settings` (admin)
- มุมบนขวา: แสดงชื่อผู้ใช้ + บทบาท + สาขา + ปุ่ม Logout (เพิ่ม UserMenu ใน header ของ `_authenticated/route.tsx`)
- redirect `/measurements` → `/data-entry`, `/admin/*` ย้ายเข้าใต้ `/settings/*` (users, departments, audit-logs)

## 2. Departments seed (เพิ่ม code)
เพิ่มคอลัมน์ `code` ในตาราง `departments` (ถ้ายังไม่มี) เพื่อใช้ map กับ Excel/seed:
`general, bloodbank, bacteria, chemistry, immunology, hematology, microscopic, biomolecular` (+ คงชื่อไทยเดิม)
Migration: ALTER TABLE add code unique + UPDATE 8 แถวเดิม

## 3. หน้า `/indicators` ปรับปรุง
- Tree View แสดง: รหัส | ชื่อ | ระดับ | เป้า | ความถี่ | สาขา | สถานะ (Badge ใช้งาน/ปิด)
- Toolbar: `+ เพิ่มตัวชี้วัด` | `นำเข้า Excel` (link → `/indicators/import`) | `ส่งออก Excel`
- Per-node actions: แก้ไข | ลบ | toggle ปิด/เปิดใช้งาน
- Modal เพิ่ม/แก้ไข เพิ่มฟิลด์:
  - parent_id เป็น searchable Combobox (กรองตามระดับที่ valid)
  - assigned_user_id (searchable dropdown จาก profiles) — เพิ่มคอลัมน์ในตาราง indicators
  - หน่วยเป็น dropdown `%`/`ครั้ง`/`ชั่วโมง` (อนุญาตพิมพ์เอง)
  - ครบ field ตามสเปก

Migration: ALTER TABLE indicators ADD COLUMN assigned_user_id uuid REFERENCES profiles(id)

## 4. หน้า `/indicators/import` (Excel)
- ใช้ lib `xlsx` (SheetJS)
- ปุ่ม "ดาวน์โหลด Template" → สร้าง .xlsx ฝั่ง client พร้อม header 16 คอลัมน์ + 1 ตัวอย่าง
- Drag & drop / browse → parse → preview table + validate (level valid, parent_code มีอยู่จริงหรืออยู่ในไฟล์เดียวกัน, code ซ้ำ, target_condition ∈ {gte,lte,eq}, department_code map ได้)
- ปุ่ม `นำเข้าข้อมูล`: insert ไล่ลำดับ object→kpi→qi→subqi ผูก parent ด้วย code; ข้ามถ้า code ซ้ำในฐาน
- สรุปผล: success/skipped/error

## 5. ส่งออก Excel
ปุ่มใน `/indicators` → ดึง indicators ทั้งหมด + departments แล้ว download .xlsx ตาม schema เดียวกับ template

## 6. Seed ข้อมูลจริง (Migration)
Insert ผ่าน migration เดียว (idempotent ด้วย ON CONFLICT (code) DO NOTHING):
- Objects 4, KPIs 11
- QIs ทั้งหมดตามสเปก (1.1–11.2)
- Sub-QIs: 2.1.1–2.1.7, 2.2.1–2.2.7, 3.1.1–3.1.7, 3.2.1–3.2.7, 5.2.1–5.2.28, 5.3.1–5.3.28
- ผูก parent ผ่าน subquery `(SELECT id FROM indicators WHERE code='...')`
- ผูก department ผ่าน code
- ตั้ง target_value, target_condition, frequency, is_leaf, is_inverted, formula_description ตามสเปก
- KPI4 เก็บ formula_description "100-(เฉลี่ย QI4.1+QI4.2)" และมี note สำหรับการคำนวณพิเศษภายหลัง

## เทคนิค
- เพิ่ม dependency: `xlsx` (SheetJS) — รัน build ฝั่ง client เท่านั้น
- Combobox: ใช้ shadcn `command` + `popover` ที่มีอยู่แล้ว
- ใช้ `useAuth().hasAnyRole` ควบคุมการแสดงเมนู
- Seed ใช้ migration เดียว ขนาดใหญ่ แต่ idempotent

## หมายเหตุ
- การคำนวณค่าจริงของ parent (average จากลูก) และ logic พิเศษ KPI4 = 100 - avg(QI4.1, QI4.2) อยู่ใน Phase ถัดไป (หน้ารายงาน/dashboard) — Phase 2 เก็บเฉพาะ metadata/สูตรในฟิลด์ formula_description
- การมอบหมายผู้ใช้ใน seed เว้นว่าง (กำหนดภายหลังจาก /settings/users)
