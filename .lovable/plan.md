# Phase 6 — Security, Test, Deploy

สถานะตอนนี้ (ตรวจจากฐานข้อมูลและโค้ดจริง)

- RLS เปิดครบทั้ง 8 ตาราง, Supabase linter ผ่าน 0 issues
- ช่องโหว่ 3 รายการที่เคยพบใน Phase 5 ปิดไปแล้ว (private schema, dept ไม่อ่านโดย anon, ล็อก self-update ของ profiles)
- Trigger ตรวจสอบ (audit) ทำงานครบบน indicators / measurements / corrective_actions / target_history แล้ว
- Cascade คำนวณ leaf → parent ทำงานผ่าน trigger ที่ฐานข้อมูล

ที่ยังขาดเทียบกับสเปก Phase 6 มี 2 จุด — เป็นเฉพาะ corrective_actions

## 1) แก้ RLS ของ corrective_actions ให้ครบสเปก

สเปก: staff INSERT ได้เฉพาะ indicator ของสาขาตน, UPDATE เฉพาะแถวที่ตนสร้าง; manager / admin / auditor เหมือนเดิม

ของจริงตอนนี้: มีแต่ admin (ทุกอย่าง), manager (insert/update), อ่านได้ทุก role — **ยังไม่มี policy ให้ staff เขียน**

จะเพิ่ม policy 2 ตัวผ่าน migration:

- `capa_staff_insert` — INSERT TO authenticated, WITH CHECK = staff role AND indicator.department_id = private.current_user_department() AND created_by = auth.uid()
- `capa_staff_update_own` — UPDATE TO authenticated, USING = staff role AND created_by = auth.uid() AND status ≠ 'closed', WITH CHECK เหมือนกัน

ไม่แตะ policy เดิมของ admin/manager/auditor — auditor ยังคงเป็น read-only ตามสเปก  อนุญาตให้เห็นทุกหน้า (ยกเว้นหน้าตั้งค่า)  แบบ read only ด้วย 

## 2) ตั้งค่า Auth Email templates เป็นภาษาไทย

จะเรียก scaffold auth email templates ของ Lovable (ครอบคลุมทั้ง 6 template: confirm signup, magic link, recovery, invite, email change, reauthentication) แล้วปรับเนื้อหาเป็นภาษาไทยพร้อม brand ของระบบ "ตัวชี้วัด KPI/QI กลุ่มงานเทคนิคการแพทย์ฯ"

ต้องมี email domain ของโปรเจกต์ก่อน — ถ้ายังไม่มีจะเปิด dialog ให้ตั้งค่า domain ก่อน

## 3) Testing — checklist ที่ทำได้อัตโนมัติ

ใช้ Playwright รันบนพรีวิว localhost (มี session admin ที่ Lovable เตรียมให้):

- Login → /dashboard เปิดได้, sidebar เห็นเมนูครบ
- เปิด /indicators, /data-entry, /reports, /capa, /targets, /settings/* แล้วจับ screenshot + console error
- หน้า /reports คลิก tab ทั้ง 4 และยืนยันว่า Export CSV / PDF / Excel ไม่ error (รัน flow คลิกปุ่ม จับ network response)
- หน้า /dashboard: ยืนยันมี KPI card, matrix 12 เดือน, line chart, alert panel ครบ
- Logout → กลับไป /auth

ส่วนที่ทดสอบอัตโนมัติไม่ได้ (ต้องใช้ user จริงคนละ role) จะสรุปเป็น manual checklist ให้ทำหลัง deploy: staff บันทึกเฉพาะสาขาตน, auditor ไม่มีปุ่มแก้ไข, การ login ของแต่ละ role

## 4) Deploy

- ตรวจ metadata หน้า root (title, description, OG, Twitter, favicon) ของระบบ — ถ้ายังเป็น default จะอัปเดตเป็นชื่อระบบจริงก่อน publish
- เรียก security scan ครั้งสุดท้ายเพื่อยืนยันไม่มี finding ระดับ critical
- Publish โปรเจกต์, ส่ง URL ให้ผู้ใช้

หมายเหตุ: VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY ตั้งไว้แล้วจาก Lovable Cloud, ไม่ต้องทำเพิ่ม

## เรื่องที่ขอตัดสินใจก่อนเริ่ม

1. **Seed ตัวชี้วัด 123 จุด** — สเปกขอให้ seed แต่ไฟล์ Excel template ของจริงต้องมาจากเอกสารผู้ใช้ ไม่มีในโปรเจกต์ ทางเลือก:
  - (ก) ข้ามขั้นนี้ ให้ admin import เองหลัง deploy ผ่านหน้า /indicators/import (มีอยู่แล้ว) — **แนะนำ**
  - (ข) สร้าง mock 123 รายการเอง (จะไม่ตรงตามเอกสารจริง)
    ตอบ (ก)
2. **profiles SELECT** — สเปกเขียนว่า "ทุก role อ่านเฉพาะของตน" แต่ของจริง manager/auditor อ่านได้ทุกคน (จำเป็นสำหรับหน้า dashboard ที่โชว์ผู้รับผิดชอบ) — เสนอ **คงไว้** เพราะถ้าตัดออกหน้า dashboard/reports จะแสดงชื่อผู้รับผิดชอบไม่ได้
   ตอบ คงไว้
3. **Auth email Thai templates** — ต้องตั้ง email domain ของโปรเจกต์ก่อน, ทำตอนนี้หรือเลื่อน?
  ตอบ เลื่อน

ตอบ 3 ข้อนี้แล้วผมเริ่มลงมือทันที (หรือบอก "ลุยเลย" ถ้ารับค่าเริ่มต้น: ก / คงไว้ / เลื่อน)