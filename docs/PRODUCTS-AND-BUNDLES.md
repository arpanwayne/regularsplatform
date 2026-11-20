# Products & Bundles

Admin → **Products & Bundles** (`/admin/catalog`). Is page se apne saare software ek jagah rakho, kisi bhi combination ka bundle banao, aur client ko do.

## 1. Software (catalog)
- Built-in, jo pehle se list mein aate hain:
  - **Regulars (Hub):** har bundle mein hota hai.
  - **WayneRing, Jobs (CRM), GMB Manager, AI Video Studio (Auto-connect):** client ka account apne aap banta hai, aur client ek login se in sab mein jaata hai.
- **Loyvexa** ab **Auto-connect** hai (Nov 2026): bundle dete hi Loyvexa mein client ka brand aur pehla admin (owner ka email) apne aap banta hai, bundle lapse hone pe brand pause hota hai, aur client home page ke "Open Loyvexa ↗" se ek click mein brand console kholta hai. Iske liye server pe `LOYVEXA_API_URL`, `LOYVEXA_APP_URL` aur `HUB_SECRET_LOYVEXA` set hone chahiye (Loyvexa server pe wahi secret `HUB_SECRET` mein).
- **Loyvexa ka WhatsApp Regulars se** (bundle rule 4, Nov 2026): ek client = ek WhatsApp number, jo Regulars Settings mein hai (apna number, warna shared Loopdesk number). Loyvexa ka bot, OTP, scheme messages aur campaigns `POST /api/hub/tools/loyvexa/whatsapp/send` se isi number se jaate hain. Jin dealers/mechanics ko Loyvexa ne likha hai (`HubWaContact`), unke jawab Regulars inbox mein nahi aate, seedha Loyvexa ke bot ko jaate hain. Loyvexa ke templates Meta mein `loyvexa_<event>` naam se approve karne hain (jaise `loyvexa_otp`, `loyvexa_ai_slab`). Contract: `lib/hub/tool-whatsapp.ts`. Provision ab `tools` bhi bhejta hai, taaki Loyvexa AI calls sirf WayneRing wale package mein dikhaye.
- **Korvo** abhi bhi **Manual** hai.
- **+ Add software** se koi bhi naya software jodo. Har naya software Manual se shuru hota hai.
- Software ka naam, description, link aur price edit kar sakte ho. "Switch off" karne se wo naye bundles mein nahi dikhta. Jo bundles use pehle se use kar rahe hain, unke clients ke liye wo pause ho jaata hai.

## 2. Bundles
- **+ New bundle**: naam do, software pe tick lagao (Regulars hamesha shaamil rehta hai), price daalo (₹ / C$), billing monthly ya yearly chuno, aur zaroorat ho to Growth Manager ON karo.
- Bundle edit karte hi uske **saare clients** pe change lag jaata hai:
  - naya connected software apne aap set up ho jaata hai
  - hataya gaya software pause hota hai, delete nahi hota
- Built-in plans (Answer, Answer + Return, Grow) bhi list mein dikhte hain. Website pe online payment waise hi chalti rahegi.

## 3. Client ko dena
- Section 3 mein: client chuno → bundle chuno → days daalo → paid amount daalo (khaali chhodo to free pilot) → **Activate**.
- Admin → Bundles mein bhi yahi kar sakte ho. Wahan har client ke Manual software ka status dikhta hai, aur **Mark ready** dabake client ka link save kar sakte ho.
- Client ke home page pe:
  - Auto-connect software ka tile ek click mein khulta hai.
  - Manual software ka tile "Setting up" dikhata hai jab tak team Ready mark nahi karti. Uske baad "Open ↗" aa jaata hai.
- Custom bundle ki payment abhi manual hai, yaani Activate karte waqt "Paid" amount daalna. Client ke Billing page pe likha aata hai ki "billed by Wayne E Solutions".

## Kisi software ko "Auto-connect" banana (ek baar ka code)
Us software mein wahi do endpoints banane hain jo GMB aur CRM mein bane hain (dekho `lib/hub/provision.ts`):
1. `POST /api/hub/provision`: hub ka JWT (purpose `provision`) aata hai. Body mein `{ hubBusinessId, active, business{name, sector, country, timezone}, owner{name, email} }` hota hai. Jawab `{ accountId, status }` dena hai. Ek hi `hubBusinessId` pe har baar wahi account lautna chahiye.
2. `POST /api/hub/sso/exchange`: ek-baar wala token leke apna session de, taaki owner bina password ke andar aa jaaye.

Phir Regulars mein:
- `lib/hub/plans.ts` mein `TOOLS` / `TOOL_META` mein naya tool jodo, saath mein env: `<TOOL>_API_URL`, `<TOOL>_APP_URL`, `HUB_SECRET_<TOOL>`
- `lib/hub/provision.ts` ke `PATH` mein uska endpoint daalo
- `lib/hub/catalog-rules.ts` ke `BUILT_IN_PRODUCTS` mein us product ko `connect: "AUTO", hubTool: "<TOOL>"` kar do

Har software ke liye ye 2-3 din ka kaam hai.
