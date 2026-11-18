# Onboarding flow: Manager, Consent, QR, Offers + Owner approval (Nov 2026)

Client onboarding doc ke P1 wale 6 kaam. Model: owner sirf WhatsApp pe approve karta hai, manager roz ka kaam karta hai, customer apni marzi se judta hai.

## 1. Manager role
- Owner **Dashboard → Team** pe manager jodta hai: naam, email (login), mobile (WhatsApp), password.
- Manager ko dikhta hai: Overview, Customers, Offers, Inbox, QR codes.
- Sirf owner ke liye: Billing, Settings, Team, Growth AI, Calling scripts, approval limits, customer ka data delete karna, dusre tools ka single sign-on.
- Code: `User.role = MANAGER` + `User.managedBusinessId`. `lib/session.ts` → `getCurrentMember()`, `getOwnerBusiness()`.

## 2. Consent (YES/NO)
`Customer.consentStatus`:

| Status | Kab | Offers? |
| --- | --- | --- |
| IMPLIED | Customer ne khud message/call kiya, ya owner ne import pe "already agreed" tick kiya. Purane saare customers bhi. | Haan (Canada me CASL 2 saal wala rule bhi) |
| PENDING | Manager ne add kiya, ya import (bina tick) | Nahi, pehle YES chahiye |
| GRANTED | QR scan kiya ya YES likha | Haan |
| DECLINED | NO likha | Kabhi nahi, dobara poocha bhi nahi jaata |

- PENDING customer ko ek baar `consent_request` template jaata hai (Canada me SMS). YES/haan/ok → GRANTED, NO/nahi → DECLINED, aur WhatsApp pe thank-you reply.
- Import ke PENDING customers ko request hourly cron se, contact hours me, 100 per business per ghanta jaati hai.
- Marketing filter ek hi jagah hai: `lib/consent.ts` (win-backs, Growth Manager, offers sab isi se chalte hain).

## 3. Manager WhatsApp se customer add kare
- Manager apne saved mobile se business number pe bheje: `add Rahul 9876543210` (naam aur number kisi bhi order me).
- System customer ko PENDING banata hai, YES/NO request bhejta hai, aur manager ko plain reply deta hai.
- Shared number (+91 90414 36801) pe manager ka message unke business pe route hota hai.
- Dashboard → Customers pe bhi "Add a customer" form hai (same kaam).

## 4. QR codes
- **Dashboard → QR codes**: har location ka QR, aur tag wale QR (jaise `T5` table 5 ke liye). Print button hai.
- QR WhatsApp kholta hai jisme `JOIN K7M2QX T5` pehle se likha hota hai (SMS wale businesses me SMS khulta hai). Send dabate hi customer GRANTED.
- `Location.joinCode` se shared number ko pata chalta hai ki message kis business ka hai, naye customer ke liye bhi.
- Location ka apna WhatsApp number ho toh uska dialable number Meta se ek baar padh ke save hota hai.

## 5. Offers + owner approval
- **Dashboard → Offers**: title, message, discount %, free item, kin customers ko (segments), kab bhejna hai.
- Owner ka offer seedha jaata hai. Manager ka offer limits ke andar ho toh apne aap approve, warna owner ko `owner_approval` WhatsApp: "… Reply APPROVE 7 or REJECT 7".
- Owner reply kar sakta hai: `APPROVE 7`, `REJECT 7`, `haan 7`, `no 7`, ya sirf `APPROVE` jab ek hi offer waiting ho. Dashboard pe Approve/Reject buttons bhi hain.
- 24 ghante me jawab nahi → ek reminder. 48 ghante → EXPIRED. Bina haan ke offer kabhi nahi jaata.
- Approved offer contact hours me jaata hai (`offer` template, ya SMS). Ek offer max 2,000 customers.
- Morning plan ke replies (`1 3`, ALL, SKIP, `no`) pe koi asar nahi.

## 6. Auto-approve limits
- Owner Offers page pe set karta hai. Default: 10% discount tak, 200 customers tak, free item hamesha poochho.
- Clinic sector: manager ka har offer owner ke paas jaata hai.
- Customers 0 karo toh har manager offer owner approve karega.

## Deploy pe karna hai
1. `npx prisma db push` (naye columns sab default ke saath hain, purana data waise hi chalta hai).
2. Admin → WhatsApp templates se naye 3 templates Meta ko bhejo: `consent_request` (4 languages), `offer` (4 languages), `owner_approval` (English + Hinglish). Approve hone tak ye messages nahi jaayenge.
3. Server crontab me hourly line jodo (README dekho): `/api/cron/offers`.
4. Owner ka mobile Growth AI → Settings ya Settings → "Forward customer replies to" me hona chahiye, tabhi approval WhatsApp jaayega.

## Testing tip
- Shared number pe owner ke phone se "JOIN …" bhejoge toh wo customer ki tarah join ho jaata hai (testing ke liye theek). Manager ke phone se JOIN mat bhejna, manager ka har message staff command maana jaata hai.
