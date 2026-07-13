# แผนพัฒนา CAPA / PDCA ครบทั้ง Tab A–E

**ค่าเริ่มต้นที่ผมจะใช้** (ตอบแทนตามคำแนะนำในข้อความก่อน — บอกได้ถ้าอยากเปลี่ยน):
- Storage: **ส่วนตัว** (private bucket `capa-docs`) + signed URL 1 ชม.
- Kanban: **ลากได้** ด้วย `@dnd-kit/core`
- ข้อมูลเดิม: ตาราง `corrective_actions` ว่างอยู่แล้ว → เพิ่มฟิลด์ใหม่แบบ nullable ไม่ต้อง migrate

---

## 1. Database (migration เดียว)

**ขยาย `corrective_actions`** เพิ่มฟิลด์ (nullable):
- `severity` ('low'|'medium'|'high'|'critical'), `priority` ('P1'|'P2'|'P3'|'P4')
- `nc_source` ('kpi_below_target'|'iqa'|'eqa'|'complaint'|'audit'|'incident'|'manual')
- `nc_detected_date`, `nc_detected_by`
- `rca_method` ('5why'|'fishbone'|'pareto'|'other'), `rca_data` (jsonb — เก็บ 5-why steps / fishbone 6M categories)
- `containment_action` (text) — การแก้ไขทันที
- `pdca_phase` ('plan'|'do'|'check'|'act'), `approval_status` ('draft'|'pending_manager'|'approved'|'rejected')
- `approved_by`, `approved_at`, `rejection_reason`
- `verification_before`, `verification_1m`, `verification_3m` (numeric) — ค่า KPI ก่อน/หลัง
- `effectiveness` ('effective'|'partial'|'ineffective'), `closed_at`

**ตารางใหม่:**
- `capa_attachments` — id, capa_id (FK), file_name, storage_path, mime_type, size_bytes, uploaded_by, uploaded_at
- `capa_documents` (คลัง WI สำหรับ Tab E) — id, title, doc_code, related_indicator_id, tags text[], storage_path, version, updated_at
- `capa_comments` — id, capa_id, user_id, comment, created_at (สำหรับ approval flow)

**RLS:** staff อ่าน/เขียนเฉพาะสาขาตน, manager อนุมัติ, auditor อ่านอย่างเดียว, admin ทำได้ทุกอย่าง
**Storage:** bucket `capa-docs` (private) + policies ผูกกับ role
**Auto-populate trigger:** เมื่อ `measurements.calculated_value < target` และยังไม่มี CAPA เปิดอยู่ → insert row `nc_source='kpi_below_target'`, `approval_status='draft'`

---

## 2. UI — `src/routes/_authenticated/capa.tsx` (rebuild)

โครง: `<Tabs>` 5 แท็บด้านบน + FY/dept filter ด้านขวา

### Tab A — 📋 Nonconformity Log
- ตาราง auto-populated จาก KPI ที่ค่า < target ในเดือนล่าสุด
- คอลัมน์: KPI, ค่าจริง/เป้า, ช่องว่าง (gap), severity (auto: gap>10=critical, >5=high, >2=medium, else low), สาขา, วันตรวจพบ, สถานะ CAPA, ปุ่ม [เปิด RCA]
- Filter: FY, เดือน, severity, สาขา, มี/ยังไม่มี CAPA
- ปุ่ม "+ บันทึก NC manual" สำหรับ IQA/EQA/complaint

### Tab B — 🔍 Root Cause Analysis (RCA)
- รายการ CAPA ที่อยู่ในเฟส Plan
- คลิกเปิด Dialog ฟอร์ม RCA เต็มจอ:
  - ข้อมูล NC (readonly จาก Tab A)
  - **Containment action** (แก้ไขทันที)
  - เลือกวิธี RCA: **5-Why** (5 ช่อง why→because) หรือ **Fishbone** (6M: Man/Machine/Method/Material/Measurement/Environment แต่ละหมวดมี list สาเหตุ)
  - เก็บเป็น jsonb ใน `rca_data`
  - แผนแก้ไข (action_plan), ผู้รับผิดชอบ, กำหนดเสร็จ, priority
  - แนบไฟล์ (upload → `capa-docs` → บันทึกใน `capa_attachments`)
  - ปุ่ม "ส่งขออนุมัติ" → `approval_status='pending_manager'`, `pdca_phase='do'`

### Tab C — 📊 Action Tracking (Kanban)
- 4 คอลัมน์: **รออนุมัติ / กำลังดำเนินการ / รอตรวจสอบผล / เสร็จสิ้น**
- การ์ด: KPI code, ปัญหาย่อ, ผู้รับผิดชอบ, due date (แดงถ้าเลย), severity badge
- ลากข้ามคอลัมน์ด้วย `@dnd-kit` → update `pdca_phase`
- manager ลากไป "กำลังดำเนินการ" = อนุมัติ (auto set `approved_by/at`)
- คลิกการ์ด → drawer แก้ไข + comment thread

### Tab D — ✅ Verification & Effectiveness
- ตารางยืนยันประสิทธิผล: KPI | ก่อน | หลัง 1 เดือน | หลัง 3 เดือน | ผล (effective/partial/ineffective)
- Auto-populate `verification_before` จาก measurement ของเดือนที่พบ NC, `verification_1m/3m` จาก measurements ถัดมา
- ปุ่ม "ประเมินประสิทธิผล" → เลือก effective → auto close CAPA (`pdca_phase='act'`, `status='closed'`)

### Tab E — 📁 Knowledge Base
- ตาราง `capa_documents`: ชื่อ, รหัสเอกสาร, KPI ที่เกี่ยวข้อง, tags, version, updated_at, ปุ่มดาวน์โหลด (signed URL)
- Search + filter tags (chip): IQC, EQA, TAT, Safety, Blood Bank, ...
- ปุ่ม "+ อัปโหลดเอกสาร" (admin/manager)

---

## 3. Files

**New/edit:**
- migration (1 ครั้ง — schema + RLS + trigger auto-populate)
- storage bucket `capa-docs` (private)
- `src/routes/_authenticated/capa.tsx` (rewrite ครบ 5 tabs)
- `src/components/capa/` — `nc-log-tab.tsx`, `rca-tab.tsx`, `rca-dialog.tsx`, `kanban-tab.tsx`, `verification-tab.tsx`, `kb-tab.tsx`, `attachment-uploader.tsx`
- `src/lib/capa-helpers.ts` — severity calc, RCA schema types
- `bun add @dnd-kit/core @dnd-kit/sortable`

## 4. Technical notes
- Kanban drag → optimistic update + mutation
- ไฟล์แนบดึงผ่าน `supabase.storage.from('capa-docs').createSignedUrl(path, 3600)`
- ทุกฟิลด์ใหม่ nullable → หน้าเดิม (basic CAPA form) ยังใช้ได้
- ใช้ `has_role()` ใน RLS สำหรับ approval flow

## 5. ขอบเขตที่ **ไม่ทำ** ในรอบนี้
- ไม่ทำ email notification (แจ้งเตือนคนรับผิดชอบทาง email)
- ไม่ทำ audit trail แยกของ CAPA (ใช้ `audit_logs` เดิม)
- ไม่รองรับ collaborative real-time editing

---

**พอกด "อนุมัติแผน" ผมจะ:**
1. รัน migration + สร้าง bucket
2. เขียนหน้า UI ทั้ง 5 tabs + components
3. ทดสอบ build

ระบุถ้าอยากปรับส่วนไหน (เช่น ตัด Kanban เหลือ dropdown, หรือทำเฉพาะ Tab A+B ก่อน) ก่อนผมเริ่มลุย