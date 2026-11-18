# Handover — Onboarding flow P1 (18 Nov 2026)

**For:** Arpan
**PR:** #16 · branch `feat/onboarding-flow-p1` → `main`
**Source:** "Client Onboarding Flow: Saare Bundles (India + Canada)" doc, build list ke P1 items (1–6)

Short mein: is PR mein onboarding flow ke 6 P1 kaam hain: manager role, consent (YES/NO), manager ka WhatsApp se customer add karna, QR codes, offers ka owner approval, aur auto-approve limits. Model ye hai: owner sirf WhatsApp pe approve karta hai, manager roz ka kaam karta hai, aur customer apni marzi se judta hai. Feature ki poori detail `docs/ONBOARDING-FLOW.md` mein hai. Ye file deploy aur testing ke liye hai.

- `tsc` clean, `next lint` clean, `next build` pass
- `npm test`: naye `test/onboarding-flow.test.ts` ke 9 tests pass. Sandbox mein Prisma engine download nahi ho saka, isliye 5 test files file-level pe "fail" dikhti hain (subtests sab pass). Main branch pe bhi yahi hota hai. **Server pe `npm test` chala ke confirm karna hai.**
- **Database schema change hai.** Deploy pe `prisma db push` zaroori hai (section 1).
- Nayi dependency: `qrcode` (+ `@types/qrcode`). `npm ci` se aa jaayegi.

---

## 1. Merge + deploy

1. PR review karke `main` mein merge karo.
2. Server pe: pull → `npm ci` → **`npx prisma db push`** → `npm run build` → restart.
3. Deploy ke baad **section 3 ke steps zaroor karo**. Templates aur cron ke bina consent requests aur offers nahi jaayenge.

Schema change sirf naye columns aur ek nayi table hai. Sab default ke saath hain, purana data waise hi chalega:

| Model | Naya field | Default / matlab |
|---|---|---|
| `User` | `phone`, `managedBusinessId` | Manager ka WhatsApp mobile aur uska business. `role` mein ab `MANAGER` bhi aata hai. Owner relation ka naam `BusinessOwner` rakha (DB pe koi asar nahi). |
| `Business` | `approvalMaxDiscount`, `approvalMaxAudience`, `approvalAutoFreebie` | 10, 200, false |
| `Location` | `joinCode` (unique), `whatsappDisplayNumber` | QR pehli baar kholne pe code banta hai |
| `Customer` | `consentStatus`, `consentSource`, `consentAt`, `consentRequestedAt`, `joinTag` | `consentStatus = IMPLIED`, yaani purane saare customers ke liye behaviour pehle jaisa |
| `Offer` (nayi table) | — | Manager/owner ke offers, approval number, status, sent count |

Koi naya env var nahi hai. Cron `CRON_SECRET` wahi purana use karta hai.

---

## 2. Kya bana (feature-wise)

**1. Manager role**
- Owner Dashboard → **Team** (`/dashboard/team`) pe manager jodta hai: naam, email, mobile, password. Email aur password manager ko owner khud deta hai.
- `lib/session.ts`: `getCurrentBusiness()` manager ke liye uska business deta hai. Naye helpers: `getCurrentMember()` (user + business + isOwner), `getOwnerBusiness()` (owner-only API), `getOwnerBusinessOrRedirect()` (owner-only page, manager `/dashboard` pe jaata hai).
- Owner-only bana diye: billing (6 routes), `/api/business`, growth settings/plan/actions, locations, hub SSO (`/api/hub/open`), front-desk win-back, calling scripts, customer data DELETE. Pages: Billing, Settings, Growth AI, Calling scripts, Team.
- Nav: manager ko sirf Overview, Customers, Offers, Inbox, QR codes dikhte hain (`components/dashboard-nav.tsx`).
- API: `app/api/team` (GET, POST), `app/api/team/[id]` (DELETE).

**2. Consent (YES/NO)**
- `Customer.consentStatus`: IMPLIED / PENDING / GRANTED / DECLINED (table `docs/ONBOARDING-FLOW.md` mein hai).
- `lib/consent.ts` ab ek hi jagah ka rule hai: PENDING aur DECLINED ko koi marketing nahi. Canada ka CASL 2 saal wala rule sirf IMPLIED pe lagta hai, GRANTED pe nahi. `marketingConsentFilter()` ab `{ AND: [...] }` return karta hai, taaki caller ka apna `OR` na toote. `lib/growth/planner.ts` aur `lib/front-desk.ts` isi se chalte hain.
- `lib/onboarding.ts` → `requestConsent()`: `consent_request` template (WhatsApp) ya SMS. `consentRequestedAt` tabhi set hota hai jab message sach mein gaya ho, warna cron dobara try karta hai.
- WhatsApp webhook: PENDING customer YES/haan/ok likhe toh GRANTED, NO/nahi likhe toh DECLINED, aur thank-you reply jaata hai. Owner ko is message ka forward nahi jaata.
- SMS webhook: YES/NO record hota hai. Reply hum nahi bhejte, kyunki Twilio YES pe khud reply karta hai.
- CSV import (`app/api/customers/import`): naye customers PENDING (source `IMPORT`), ya `?consent=confirmed` pe IMPLIED (source `IMPORT_CONFIRMED`). Import box ab Dashboard → Customers pe bhi hai. Canada mein "already agreed" checkbox pehle se ticked rehta hai, India mein unticked.
- Import ke PENDING customers ko request hourly cron se jaati hai: contact hours mein, 100 per business per ghanta. Jis location ka koi WhatsApp/SMS sender nahi hai, use skip kiya jaata hai (har ghante log nahi bharte).

**3. Manager WhatsApp se customer add kare**
- `lib/staff.ts` → `handleStaffMessage()`. WhatsApp aur SMS dono webhooks mein customer handling se **pehle** chalta hai, aur morning plan ke reply handler se bhi pehle.
- Manager (saved mobile se): `add Rahul 9876543210`. Naam aur number kisi bhi order mein ho sakte hain. Customer PENDING banta hai, YES/NO request jaati hai, aur manager ko plain jawab milta hai (`staffAddReply`).
- Pehle se customer hai toh: IMPLIED/GRANTED pe "already a customer", DECLINED pe dobara nahi poochta, aur 7 din ke andar dobara request nahi bhejta.
- Manager ka koi aur message customer nahi banta. Use help text milta hai.
- Shared number: `routeShared()` ab manager ka mobile pehchaanta hai aur message uske business pe bhejta hai.
- Dashboard → Customers pe "Add a customer" form (`POST /api/customers`) hai, jo yahi kaam karta hai.

**4. QR codes**
- `/dashboard/qr`: har active location ka QR, `?tag=T5` se tag wala QR, aur Print button (nav print mein chhup jaata hai).
- QR link: `https://wa.me/<number>?text=JOIN%20K7M2QX%20T5`. SMS wale (Canada) business ke liye `sms:+1…?&body=JOIN…`.
- Number kahan se aata hai (`qrTargetFor`): SMS business → texting number. Shared number → `WHATSAPP_SHARED_DISPLAY_NUMBER`. Location ka apna number → Meta se `display_phone_number` ek baar padh ke `whatsappDisplayNumber` mein save.
- Webhook: `JOIN <code>` aaya aur code is location ka hai → customer GRANTED (source `QR`), `joinTag` save, aur welcome reply jaata hai. Shared number pe join code se hi naya customer sahi business pe route hota hai. Pehle STOP kiya tha aur ab scan kiya, toh opt-out hat jaata hai.
- Customers table pe badges: "Waiting for YES", "No offers", "QR · T5".

**5. Offers + owner approval**
- `lib/offers.ts`, page `/dashboard/offers`, API `app/api/offers` (POST), `app/api/offers/[id]` (PATCH approve/reject/cancel), `app/api/offers/audience` (GET count).
- Owner ka offer seedha APPROVED hota hai. Manager ka offer `approvalCheck()` se jaata hai: limits ke andar → APPROVED, warna PENDING_APPROVAL aur owner ko `owner_approval` template jaata hai ("Reply APPROVE 7 or REJECT 7").
- Owner ka reply (`parseApprovalReply`): `APPROVE 7`, `REJECT 7`, `haan 7`, `no 7`, ya sirf `APPROVE`/`REJECT` jab ek hi offer waiting ho. Bare `yes`/`ok`/`no` ko approval nahi maana jaata, kyunki `no` morning plan mein SKIP hai.
- Owner ke mobile: `ownerPhones()` = owner user ka phone + growth settings ka owner phone + locations ka `ownerNotifyPhone`.
- Bhejna (`sendOffer`): pehle offer ko claim karta hai (APPROVED → SENDING), taaki cron aur owner ka reply dono ek saath na bhej dein. Phir `offer` template (WhatsApp) ya SMS. Consent aur opt-out filter lagta hai, aur Meta ka "ek marketing template per 24h" guard bhi. Ek offer max 2,000 customers ko jaata hai, aur sirf contact hours mein.
- Cron `app/api/cron/offers` (hourly): 48h → EXPIRED (`decidedVia TIMEOUT`), 24h → ek reminder, aur due APPROVED offers bhejta hai. Isi cron mein queued consent requests bhi jaati hain. `vercel.json` mein bhi add kiya hai.

**6. Auto-approve limits**
- Owner ka card Offers page pe hai (`PATCH /api/offers/limits`).
- Clinic sector mein manager ka har offer owner ke paas jaata hai. Customers 0 karo toh har manager offer owner approve karega.

**Naye WhatsApp templates** (`lib/whatsapp-templates.ts`):

| Key | Category | Languages | Vars |
|---|---|---|---|
| `consent_request` | UTILITY | en, hinglish, hi, pa | first name, business |
| `offer` | MARKETING | en, hinglish, hi, pa | first name, business, offer text |
| `owner_approval` | UTILITY | en, hinglish | business, kisne likha, kitne customers, offer, approval number |

---

## 3. Deploy ke baad ye karna hai (config, code nahi)

1. **WhatsApp templates:** Admin → WhatsApp → **Submit missing to Meta**. Upar wale 3 templates jaayenge. Jab tak approve nahi hote, consent requests aur offers fail honge. Consent requests cron se apne aap dobara try hongi, offers ko dobara banana padega.
2. **Crontab:** server pe `crontab -e` karke ye line jodo (README mein bhi hai):
   ```
   20 * * * * curl -s -H "Authorization: Bearer CRON_SECRET_HERE" https://regulars.wayneesolutions.com/api/cron/offers > /dev/null
   ```
3. **Owner ka mobile:** jis client pe manager banega, uske owner ka asli mobile Growth AI → Settings (*Your mobile for the brief*) ya Settings → *Forward customer replies to* mein hona chahiye. Iske bina approval ka WhatsApp nahi jaayega (Admin → Logs mein OFFER WARN aata hai). Owner dashboard se phir bhi approve kar sakta hai.
4. **Test business pe manager banao:** "wayne e solution" pe Team → Add manager. Mobile wo daalo jisse testing karoge, aur jo owner ka number nahi hai.

---

## 4. Test checklist (staging ya test business pe)

- [ ] Manager login: nav mein sirf Overview, Customers, Offers, Inbox, QR codes. `/dashboard/billing` aur `/dashboard/settings` kholo, toh `/dashboard` pe redirect ho.
- [ ] Manager ke phone se business number pe `add Test 98xxxxxxxx` (asli number). Manager ko jawab aaye, test number pe YES/NO template aaye, aur Customers mein "Waiting for YES" dikhe.
- [ ] Us number se `YES` likho: thank-you aaye aur badge hat jaaye. Dusre test number se `NO`: "No offers" badge aaye.
- [ ] Manager ke phone se `hi` bhejo: help text aaye, aur manager customer list mein na aaye.
- [ ] QR codes page: QR scan karke Send dabao (owner ya manager ke phone se **nahi**). Welcome message aaye aur customer pe "QR" badge ho. `?tag=T5` wale QR se "QR · T5" aaye.
- [ ] Manager se 5% discount ka chhota offer banao: "approved" aaye aur contact hours mein customers ko `offer` template jaaye. PENDING aur DECLINED waalon ko na jaaye.
- [ ] Manager se 20% ka offer banao: owner ko WhatsApp aaye. `APPROVE <n>` likho: owner ko "Approved… Sent to N" aaye.
- [ ] Ek aur bada offer banao aur owner `REJECT <n>` kare: offer na jaaye, status Rejected ho.
- [ ] Owner morning plan pe `1 2` / `SKIP` reply kare: pehle jaisa chale, offers pe koi asar nahi.
- [ ] Offer ka jawab mat do: 24h pe reminder aaye, 48h pe "Expired". Jaldi test karna ho toh DB mein `requestedAt` peeche karke `/api/cron/offers` ko CRON_SECRET ke saath call karo.
- [ ] CSV import bina tick ke: naye customers "Waiting for YES" mein aayein, aur cron chalne pe request jaaye. Tick ke saath import: badge na aaye.
- [ ] Owner Offers page pe limits badle (customers 0 karo): manager ka har offer approval pe jaaye.
- [ ] Clinic business pe manager ka 0% offer bhi approval pe jaaye.
- [ ] Team pe manager Remove karo: manager login na ho paaye.
- [ ] Purane customers (IMPLIED) ke liye win-back aur Growth AI pehle jaisa chale. Canada ke 2 saal se purane IMPLIED customers ko na jaaye.

---

## 5. Is PR mein NAHI (baad ke kaam)

Onboarding doc ki build list ke P2/P3 items, aur kuch cheezein jo jaan-boojh ke chhodi:

| Kaam | Note |
|---|---|
| Industry presets (Products & Bundles) | P2. Restaurant, salon, jeweller, furniture, dental, hospital ke presets. |
| Country setting se channel, currency, consent apne aap | P2. Abhi `country` + `defaultChannel` alag-alag set hote hain. |
| Usage meters (AI call minutes, WhatsApp messages per client) | P2 |
| Custom bundle ka online payment + setup fee line | P2 |
| Notification digest (din mein ek message) | P2. Owner ko abhi har approval turant jaata hai. |
| Hospitals: care team verify step + warning-sign alerts | P3. Pehle hospital client se pehle P1. |
| Per-outlet billing (₹8,499 per extra outlet) | P3 |
| Approval ke WhatsApp buttons | Abhi text reply hai ("APPROVE 7"). Interactive buttons ke liye template mein quick-reply buttons aur webhook mein `button.payload` chahiye. |
| Manager ko approve/reject/expire ka message | Abhi manager Offers page pe status dekhta hai. |
| Manager ka password reset | Abhi owner remove karke dobara add karta hai. |
| Offers pe Growth Manager ka "max touches per week" | Offers pe abhi sirf Meta ka 24h wala marketing guard lagta hai. |
| Customers table ka "Remove data" button manager ko bhi dikhta hai | Dabane pe error aata hai, kyunki delete owner-only hai. Button chhupana baaki hai. |

---

## 6. Faisle jo Pankaj se confirm karne hain

- **Default limits:** 10% discount aur 200 customers. Theek hain ya kuch aur?
- **Import ka default:** India mein naye imported customers PENDING (pehle YES/NO), Canada mein box ticked (CASL implied consent). Sahi hai?
- **`consent_request` ki category:** humne UTILITY maangi hai. Meta ise MARKETING mein daal sakta hai. Agar daala, toh ye bhi "ek marketing per 24h" limit mein aayega. Approval ke baad Admin → WhatsApp mein category check karo.
- **Offer cap 2,000 customers per offer:** isse bade clients ke liye badhana hai?
- **Manager customer data delete nahi kar sakta,** sirf owner kar sakta hai. Theek hai?
- **Canada brand ka naam** (Loopdesk ya LookDesk): templates ka prefix abhi bhi `loopdesk_` hai.
