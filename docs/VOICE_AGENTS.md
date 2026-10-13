# Voice agents — PaintLead Pro

Verified from source on 2026-10-13. Env vars are listed by NAME only, never values.

## 1. Chloe: website voice scheduler (xAI)
| Item | Value |
|---|---|
| Platform | xAI Grok Voice realtime, model `grok-voice-latest`, voice `eve` (`js/chloe-voice.js`) |
| xAI account / console agent name | unknown, needs confirmation (prompt lives in code) |
| Wiring | `homeowner.html` loads `js/chloe-voice.js` → `POST /api/voice-token` (`api/voice-token.js`) mints an ephemeral token at `https://api.x.ai/v1/realtime/client_secrets` with `XAI_API_KEY` → browser connects straight to `wss://api.x.ai/v1/realtime` |
| Answers | Homeowners on the website. It does not place or receive phone calls. |
| Tool | `submit_lead` (name, phone, scope required; address, budget, color optional) → `POST /api/dispatch-lead` |

Prompt (quoted from `js/chloe-voice.js`):
> You are Chloe, PaintLead Pro's friendly scheduling assistant for house-painting projects in the Greenville, South Carolina area.
> Goals, in order:
> 1. Greet warmly, keep replies to 1-2 short sentences — this is a live voice call.
> 2. Learn the project: interior or exterior, rough size/scope, color ideas, timeline, budget range.
> 3. Get the homeowner's first name and mobile phone number, and street address if offered.
> 4. When you have at least name + phone + scope, call the submit_lead tool, then confirm: a certified local painting contractor will call to book their free on-site visit.
> Rules: never quote exact prices (site visit determines pricing); if asked something unrelated to painting, answer in one sentence and steer back; never claim to be human.

## 2. Outbound call: Vapi "chloe-receptionist"
| Item | Value |
|---|---|
| Platform | Vapi (`https://api.vapi.ai/call/phone`) in `api/voice-agent.js` |
| Env | `VAPI_API_KEY`, `VAPI_ASSISTANT_ID` (code fallback `chloe-receptionist-id`), `VAPI_PHONE_NUMBER_ID` |
| Who it calls | The homeowner's phone number from the request body (`customer.number`), with `customerName` passed as an assistant override. Triggered from `dashboard.html`. |
| Assistant prompt | Stored in Vapi, not in the repo: unknown, needs confirmation |
| Caller ID number | Set by `VAPI_PHONE_NUMBER_ID`: unknown, needs confirmation |

## 3. Lead dispatch SMS (Twilio)
| Item | Value |
|---|---|
| Endpoint | `api/dispatch-lead.js` |
| Env | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` (from), `PARTNER_NOTIFY_PHONE` (to). The code fallback for the latter is a 555 placeholder. |
| Message | "PaintLead Pro Exclusive Dispatch:" followed by Name, Phone, Address, Scope, Budget, Color, "Status: Confirmed - Ready for estimate." |
| Partner who receives it | unknown, needs confirmation |

## Other wiring
- CRM / lead storage: Supabase `leads` table (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `supabase/migrations/20260609000000_init_schema.sql`).
- Cron: `vercel.json` runs `/api/keepalive` at `0 9 * * *` (09:00 UTC daily) to keep Supabase from pausing.
- Other env: `ALLOWED_ORIGINS`, `NVIDIA_API_KEY` (surface analysis).

## Phone numbers
No real number is verified from repo, Vercel, Gmail or memory as of 2026-10-13. The site shows 555 placeholders (`index.html`, `dashboard.html`). Real Twilio, Vapi and partner numbers: unknown, needs confirmation.

## Known gaps
- An inbound phone line to Chloe is not wired.
- `PARTNER_NOTIFY_PHONE` falls back to a fake number when it is unset.
- The Vapi assistant prompt is not version-controlled.
