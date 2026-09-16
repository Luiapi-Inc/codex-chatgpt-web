# Transport Wrapper Remediation Plan

สถานะ: ออกแบบเพื่อแก้ไขและตรวจสอบ ยังไม่ได้ประกาศว่า release ผ่าน

เอกสารนี้กำหนดแนวทางปรับปรุง transport wrapper ที่ส่ง Codex task เข้า ChatGPT Web ให้รักษา intent, lifecycle, tool state และ acceptance evidence ได้อย่างตรวจสอบได้ โดยยอมรับข้อจำกัดว่า role ที่ฝังใน user message ไม่สามารถกลายเป็น native ChatGPT system/developer role ได้

## 1. ขอบเขตและเป้าหมาย

เป้าหมายคือให้ bridge:

- เลือก active user request ได้ถูกต้อง แม้มี skill และ operational context แทรกอยู่
- แยก task roles, skill reference, runtime metadata และ evidence ออกจากกัน
- ให้ runtime เป็นเจ้าของ session, turn, tool call และ token state
- หยุด no-progress loop และ retry ที่ไม่สร้างข้อมูลใหม่
- รองรับ model switch โดยไม่รอ browser/tool state ที่ค้างอยู่ก่อน
- ไม่ประกาศ completion จาก test pass เพียงอย่างเดียว

ไม่อยู่ในขอบเขตของเอกสารนี้คือการอ้างว่า simulated roles มี priority เทียบเท่า native roles หรือการเพิ่มสิทธิ์ให้ model ทำ external action โดยอัตโนมัติ

## 2. หลักฐานและข้อจำกัดจากเอกสารทางการ

การออกแบบยึด Apps SDK guidance ต่อไปนี้:

- MCP server ควรเปิดเผย tools ที่มีชื่อ คำอธิบาย input schema, output schema และ annotations ชัดเจน: <https://developers.openai.com/apps-sdk/build/mcp-server>
- UI เป็น optional และควรใช้ MCP Apps bridge เป็นพื้นฐาน ก่อนเพิ่ม ChatGPT-specific compatibility APIs: <https://developers.openai.com/apps-sdk/build/chatgpt-ui>
- Tool result ควรแยก `structuredContent`, `content` และ `_meta`; ข้อมูลลับหรือข้อมูลเฉพาะ component ไม่ควรปะปนกับ model-visible content
- Skill ที่ส่งจาก MCP เป็น static snapshot ตอน import จึงต้องผูก version/digest และ refresh เมื่อ skill เปลี่ยน

ข้อสรุปเชิงสถาปัตยกรรมคือ prompt ไม่ควรเป็น state store หลักของ bridge การยืนยันตัวตน, authorization, lifecycle และ idempotency ต้องอยู่ที่ runtime/server

## 3. Contract ใหม่

ใช้ envelope ที่แยกหน้าที่ดังนี้:

```json
{
  "version": 5,
  "role_fidelity": "best_effort_simulation",
  "task": {
    "system": [],
    "developer": [],
    "messages": []
  },
  "active_request": {
    "message_id": "immutable-id",
  },
  "skill_context": [
    {
      "name": "luiapi-agent",
      "authority": "reference_only",
      "digest": "sha256:...",
      "content": "..."
    }
  ],
  "runtime": {
    "session_id": "...",
    "turn_id": "...",
    "iteration": 0,
    "max_iterations": 12,
    "max_same_state_attempts": 2,
    "state": "RECEIVED"
  },
  "acceptance": {
    "required": true,
    "candidate_binding": true,
    "evidence_required": true
  }
}
```

`active_request` ต้องอ้างอิง `message_id` ที่ไม่เปลี่ยนตามการแทรกข้อความ ห้ามใช้ array index เป็น identity หลัก ส่วน `skill_context` เป็น execution reference ไม่ใช่ user instruction และไม่สามารถเปลี่ยน requirement, permission, ownership หรือ acceptance criteria ได้

## 4. Runtime state machine

สถานะหลัก:

```text
RECEIVED
  -> NORMALIZED
  -> INSPECTING
  -> PLANNED
  -> IMPLEMENTING
  -> VERIFYING
  -> ACCEPTED
```

สถานะหยุด:

```text
WAITING_FOR_EVIDENCE
WAITING_FOR_ACCESS
BLOCKED
FAILED_RETRY_LIMIT
```

ทุก tool iteration ต้องสร้างอย่างน้อยหนึ่งรายการ:

1. evidence ใหม่
2. repository/environment state change
3. verification ของ change ก่อนหน้า
4. blocker ใหม่ที่พิสูจน์ได้

หากไม่มีรายการใดเกิดขึ้น ห้ามเรียก tool รอบถัดไป ให้บันทึก state และเหตุผลหยุดแทน

## 5. Model switch และ tool lifecycle

ลำดับที่ runtime ต้องบังคับ:

```text
รับ model switch request
-> validate target model
-> finalize/interrupt current native turn safely
-> create or select target turn state
-> send normalized context
-> await target model result
-> call browser/tool only when the new turn requires it
```

`turn_token`, `session_id`, `turn_id` และ `call_id` ต้องถูกเติมและตรวจสอบโดย runtime ไม่ควรให้ model คัดลอกค่าเหล่านี้เอง การ reconnect ต้อง reconcile กับ persisted turn state ก่อนส่ง input ซ้ำ และ retry ต้องใช้ idempotency key เดิมเมื่อ API รองรับ

## 6. Acceptance evidence

การประกาศเสร็จต้องตรวจ chain นี้:

```text
Requirement
-> Source of Truth
-> Intended Result
-> Current State
-> Gap
-> Implementation
-> Test
-> Actual Result
-> Acceptance Evidence
```

หลักฐานทุกชิ้นต้องผูกกับ requirement ID, candidate SHA และ execution fingerprint เดียวกัน การที่ build, lint หรือ test ผ่านเป็นเพียง evidence บางส่วน ไม่ใช่ acceptance โดยตัวมันเอง

## 7. การเปลี่ยนแปลงในโค้ด

แบ่ง implementation เป็นชุดเล็กที่ตรวจได้:

### Phase A: Envelope และ normalization

- เพิ่ม schema สำหรับ `active_request`, `skill_context` และ `runtime`
- เปลี่ยนจาก `message_index` เป็น immutable `message_id`
- เพิ่ม validation ว่า active request ต้องเป็น human-authored user message
- เพิ่ม intent normalization เช่น `status`, `implement`, `verify`

### Phase B: Runtime ownership

- ย้าย token/session/turn/tool-call propagation ออกจาก prompt
- เพิ่ม iteration และ fingerprint guard
- เพิ่ม bounded retry และ explicit wait states
- แยก model-switch state จาก browser/tool wait state

### Phase C: Evidence และ regression

- เพิ่ม candidate-bound acceptance checker
- บันทึก evidence fingerprint และ state fingerprint
- เพิ่ม regression tests สำหรับ message insertion, compaction, reconnect และ repeated tool calls
- เพิ่ม model-switch test ที่พิสูจน์ว่า model ใหม่ถูกเลือกก่อน browser call

## 8. Test matrix

ต้องมีอย่างน้อย:

| กรณี | ผลที่ต้องได้ |
| --- | --- |
| แทรก skill message ก่อน active request | active request ยังชี้ message เดิม |
| skill มีคำสั่งขัดกับ requirement | requirement/authority เดิมยังชนะ |
| tool call ซ้ำโดย fingerprint เดิม | runtime ปฏิเสธหรือหยุดตาม policy |
| tool call สร้าง evidence ใหม่ | runtime อนุญาตรอบถัดไป |
| model switch ระหว่าง browser wait | target model ถูกยืนยันโดยไม่ deadlock |
| stream หลุดหลัง tool call | reconnect แล้ว reconcile ไม่ยิง action ซ้ำ |
| test ผ่านแต่ acceptance evidence ขาด | สถานะยังไม่เป็น `ACCEPTED` |
| candidate SHA ไม่ตรง evidence | acceptance check ล้มเหลว |

## 9. Acceptance gate ของงานแก้ไข

งานนี้ถือว่าผ่านเมื่อมีหลักฐานครบ:

- schema ใหม่ผ่าน validation
- active request ถูกเลือกถูกต้องจาก fixture ที่มี skill/context แทรก
- model switch ไม่รอ browser/tool ที่ไม่เกี่ยวข้อง
- no-progress guard หยุด loop ได้จริง
- retry/reconnect ไม่ทำให้ mutation ซ้ำ
- acceptance checker ปฏิเสธ stale หรือ mismatched evidence
- regression suite ผ่าน และมีรายงาน actual result

หากยังขาด production HTTPS, privacy policy, terms หรือ support URL ให้รายงานเป็น release blocker แยกต่างหาก และไม่ประกาศ submission readiness
