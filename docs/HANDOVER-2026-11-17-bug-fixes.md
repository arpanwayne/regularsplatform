# Handover — Regulars bug fixes (17 Nov 2026)

**For:** Arpan
**Branch:** `fix/bug-report-16-nov` → `main`
**Source:** "Regulars Portal Manual aur Bug Report" (16 Nov 2026 live check)

Short mein: is PR mein report ke saare bugs fix hain jo **is repo (regularsplatform)** ke andar the. Kuch bugs WayneRing, CRM aur GMB Manager ke apne repos mein hain. Wo is repo se fix nahi ho sakte, unki list neeche section 5 mein hai, saath mein kahan dekhna hai.

- `tsc` clean, `next lint` clean, `next build` pass
- `npm test`: 31/31 pass (naye tests `test/bug-report-fixes.test.ts` mein)
- **Database schema change nahi hai.** `prisma db push` ki zaroorat nahi.

---

## 1. Merge + deploy

1. PR review karke `main` mein merge karo.
2. Server pe normal deploy karo (pull → `npm ci` → `npm run build` → restart).
3. Deploy ke baad **section 3 ke steps zaroor karo**. In config steps ke bina B2 (morning brief) aur B3 (WayneRing/CRM events) live pe theek nahi honge.

Ek naya optional env var hai:

| Env | Default | Matlab |
|---|---|---|
| `WHATSAPP_OWNER_ANY_COUNTRY` | on (set nahi = on) | Owner ka brief shared WhatsApp number (+91 90414 36801) se kisi bhi country ke owner ko ja sakta hai. Canada owner ko bhi, jab tak Twilio set nahi hai. Band karna ho to `false` likho. Customers pe iska koi asar nahi. |

---

## 2. Kya fix hua (bug-wise)

### High

**B1 — Fail hua message "Done" dikhta tha**
- Naya `lib/growth/delivery.ts`. Meta ya Twilio ka "failed / undelivered" receipt aate hi linked Growth action **FAILED** ho jaata hai, aur card pe reason dikhta hai.
- Hook: `app/api/webhook/whatsapp/route.ts` (statuses) aur `app/api/webhook/sms/status/route.ts`.
- Executor ab SMS dry-run (`NOT_SENT`, Twilio set nahi) ko bhi "Done" nahi bolta, FAILED mark karta hai with reason.
- WhatsApp receipts out-of-order aayein (late "sent" after "delivered") to status peeche nahi jaata. FAILED final hai.

**B2 — Owner ka morning brief / weekly report nahi ja rahe**
- **Asli wajah 1:** `sendOwnerWhatsApp` pehle free text bhejta tha. 24 ghante ki window ke bahar Meta text ko **accept kar leta hai** (200 OK) aur fail baad mein webhook pe batata hai (131047). Is wajah se approved template kabhi bheja hi nahi jaata tha. Ab template diya ho to template hi jaata hai. Free text sirf owner ke reply ke turant baad ke confirmations ke liye hai.
- **Asli wajah 2:** Canada business (`defaultChannel = SMS`) ke liye Twilio / texting number nahi tha, isliye sirf "dry-run" log aata tha. Ab owner channel ka order ye hai: SMS (agar set hai) → WhatsApp (own number ya shared number, kisi bhi country ke owner ko) → SMS. Pehla channel fail ho to doosra try hota hai.
- Naya `ownerChannel()` (`lib/growth/brief.ts`) ek line mein exact wajah batata hai ki brief kyun nahi jaayega. Ye wajah 3 jagah dikhti hai: Admin → Logs, Growth AI page pe laal box, aur bundle home ke checklist mein.
- Owner reply ("1 3 / ALL / SKIP") shared number pe ab kisi bhi country ke owner se route hota hai (`routeShared`).
- `owner_brief` hinglish template Meta ne MARKETING category mein daal diya tha, isliye ab wo use nahi hota (`noSend`). Brief English mein jaata hai (B12).

**B3 — WayneRing / CRM se events nahi aa rahe**
- Ye mostly doosre repos / config ka kaam hai (section 3, step 4).
- Is repo mein: Admin → **Bundles** pe har tool ke neeche ab dikhta hai "Last event to Regulars: <time>" ya "No events received yet". Deploy ke baad turant pata chalega ki wiring chal rahi hai ya nahi.

**B4 — Meta 131049 (marketing message rok diya)**
- 131049 aane pe action ek baar **24 ghante baad dobara** try hota hai (`retryAfter`). Doosri baar bhi fail ho to FAILED.
- Fail hua win-back customer ka `lastWinbackAt` reset kar deta hai, taaki wo 30 din tak block na rahe.
- Pehle se maujood guard (ek customer ko din mein ek marketing template) waise hi chal raha hai.

### Medium

| Bug | Fix | File(s) |
|---|---|---|
| B0 Login/signup ke baad purane account ka data | Wajah: Next.js ka client router cache. Login, signup aur logout ab full page load (`window.location.assign`) karte hain. Logged-in team member bhi `/signup?plan=…` khol sakta hai, page pe warning dikhti hai ki naya account banane se purana session replace hoga. | `auth-form.tsx`, `bundle-signup-form.tsx`, `dashboard-nav.tsx`, `admin-nav.tsx`, `middleware.ts`, `app/signup/page.tsx` |
| B5 Ek customer ko 1 minute mein 2 actions | Planner ab dekhta hai ki aaj ke din jis customer ka action pehle se hai (pichhla "Plan now" bhi), usko dobara nahi chunta. | `lib/growth/planner.ts` |
| B6 Hinglish business ka message English mein gaya | Front-desk messages (win-back, missed call, review request) WhatsApp pe ab hamesha business ki language ke approved template se jaate hain, 24h window ke andar bhi. Pehle window khuli ho to English SMS wala text chala jaata tha. Growth AI ki AI copy (business language mein) text ki tarah hi jaati hai. Har outbound WhatsApp ke `rawPayload` mein ab `lang` save hota hai. | `lib/front-desk.ts`, `lib/growth/executor.ts`, `lib/whatsapp-send.ts` |
| B8 "free Starter plan" + ₹999 | Text ab "You're on the Starter plan." | `app/dashboard/billing/page.tsx` |
| B9 Starter pe bhi Growth AI | Naya `growthAllowed()`: sirf Answer + Return / Grow bundle (ACTIVE) aur Regulars GROWTH / PRO plan. Starter aur Answer pe hourly tick skip hota hai, "Plan now" / Approve / enable 403 dete hain, aur page pe upgrade ka message dikhta hai. | `lib/growth/access.ts`, growth routes, `lib/growth/run.ts`, growth page |
| B14 Dummy brief number (+19876543210) pe checklist tick | Naya `isPlaceholderPhone()`. Aise numbers settings save aur signup pe reject hote hain, brief unpe nahi jaata, aur checklist tabhi tick hota hai jab brief sach mein ja sakta ho. | `lib/phone.ts`, settings + signup routes, `hub-home.tsx` |
| B18 Reply aate hi saved naam badal jaata tha | WhatsApp profile name ab sirf tab lagta hai jab customer ka naam khali ho. Saved naam kabhi overwrite nahi hota. | `app/api/webhook/whatsapp/route.ts` |
| G8 (hub side) AI posts galat business type ke | Bundle signup pe "Home services" pehle se select nahi rehta, client ko khud chunna padta hai. Admin → Businesses mein business type ka dropdown aa gaya. Type badalne pe bundle tools dobara provision hote hain, taaki GMB ko naya type mil jaaye. | `bundle-signup-form.tsx`, admin businesses route + table |

### Low

| Bug | Fix |
|---|---|
| B10 "last seen 63 days ago after 0 visits" | Ab likha aata hai "added 63 days ago, never visited" (`winBackReason`). |
| B11 Client Overview pe "New" card nahi tha | "New" card add kiya, ab saare cards jod ke total ke barabar aate hain. |
| B12 Templates | Review request ke end mein ab STOP line hai, naye naam `loopdesk_review_request_v2*` ke saath. Jab tak Meta naye naam approve nahi karta, purana naam fallback ki tarah use hota hai (`LEGACY_NAMES` + `sendTemplateWithFallback`, Meta 132001 pe). `owner_weekly` aur `owner_new_message` ke Hindi + Punjabi templates add hue. Approval pending ho to English pe fallback hota hai. |
| B13 Config ki chhoti galtiyan | Meta dashboard ka sample id `123456123` ab WARN ki jagah INFO log hota hai, saath mein "webhook reachable" note. Admin Overview revenue ab currency-wise dikhta hai (pehle CAD bhi ₹ mein jud jaata tha). Bundles → Activate mein "Paid" amount box hai, jo offline payment ko record karta hai taaki revenue ₹0 na dikhe. Owners page pe ab wo admin bhi dikhta hai jiska apna business hai (real pro media). Reset button sirf OWNER role ke liye hai. |
| B17 Chhote farak | Review request ka default ab "Ask me first" hai. Jin businesses ne autonomy pehle save ki thi, unki setting nahi badli. Bundle home aur nav ke ↗ links naye tab mein khulte hain. Owners page ka text theek kiya: "Forgot password" email flow maujood hai, lekin sirf tab chalta hai jab `EMAIL_PROVIDER_API_KEY` set ho. |
| B19 Template examples | `missed_lead` aur `quote_followup` ke examples ab ek hi business ke hain: Maple HVAC + `cal.com/maple-hvac`. |

---

## 3. Deploy ke baad ye karna hai (config, code nahi)

1. **WhatsApp templates:** Admin → WhatsApp → **Submit missing to Meta**. Isse naye templates Meta ko jaayenge: `loopdesk_review_request_v2` (4 languages) aur `owner_weekly` / `owner_new_message` ke `hi` + `pa`. Approve hone tak purane templates / English apne aap use hote rahenge.
2. **"wayne e solution" ka brief number:** Growth AI → Settings → *Your mobile for the brief* mein abhi dummy `+19876543210` hai. Asli owner mobile daalo. Phir Growth AI page pe dekho: "Morning plan: sent by WhatsApp to …" dikhna chahiye, laal box nahi.
3. **Canada ke liye SMS (optional, baad mein):** `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` aur `GROWTH_SMS_FROM` set karo, ya location pe texting number assign karo. Tab tak Canada owners ko brief WhatsApp se jaayega.
4. **B3 — WayneRing + CRM events:**
   - Check karo ki WayneRing PR #12/#13 aur CRM PR #1/#2 merge + deploy ho gaye hain.
   - Phir Admin → Bundles → "wayne e solution" → **New keys** dabao. Pehli provisioning pe key sirf ek baar bheji gayi thi; agar us waqt tool ka naya code live nahi tha to wo key kho gayi.
   - Ek test call (missed) aur ek test quote karo. Bundles page pe "Last event to Regulars" ka time update hona chahiye. Admin → API keys pe bhi LAST USED badalna chahiye.
5. **Real Pro Media pe Growth AI demo:** ye Starter pe hai, isliye ab Growth AI band dikhega (B9). Demo chalu rakhna hai to Admin → Businesses → plan **PRO** kar do.
6. **"wayne e solution" ka business type:** Admin → Businesses mein `HOME_SERVICES` se `OTHER` (ya jo sahi lage) karo. Isse tools re-provision honge. GMB mein jo 8 purane "home services" drafts pade hain, unhe delete kar do.
7. **Test Salon:** Compliance WARN, kyunki phone number ID hai par access token nahi. Ya token daalo, ya phone number ID hata do.

---

## 4. Test checklist (staging ya test business pe)

- [ ] Do accounts, ek hi tab: login A → logout → login B. B ke Growth AI / Settings / Billing pe A ka data nahi dikhna chahiye.
- [ ] Logged in rehte hue `/signup?plan=GROW&country=CA` khulta hai aur warning dikhata hai.
- [ ] Growth AI → "Plan now" do baar dabao: ek customer ko ek din mein sirf ek action mile.
- [ ] Ek marketing template aise number pe bhejo jo 131049 de: action pehle "Approved" + retry note dikhaye, doosri baar fail hone pe "Failed".
- [ ] Hinglish business: ek customer jo pichhle 24h mein chat kar chuka hai, usko win-back Hinglish template mein jaaye.
- [ ] Customer jiska naam "AK" saved hai, reply kare: naam "AK" hi rahe.
- [ ] Growth settings mein `+19876543210` save karne pe error aaye.
- [ ] Starter business: Growth AI page pe upgrade box aaye, "Plan now" disabled ho.
- [ ] Owner ka brief: test business pe brief hour set karo, cron chalne do (ya `/api/cron/growth` ko CRON_SECRET ke saath call karo), aur owner phone pe template aaye.
- [ ] Bundles → Activate mein amount daalo: Admin Overview revenue mein us currency mein dikhe.

---

## 5. Is PR mein NAHI (doosre repos ke bugs)

| Bug | Repo | Kya karna hai |
|---|---|---|
| B15 Calls ↗ galat WayneRing user ("pankaj · testuser@gmail.com") se login karata hai | WayneRing (`aivoicebackend` / portal) | `/api/hub/provision` aur `/sso` mein tenant ka OWNER user Regulars ke `owner.email` se match karke sign-in karo, purane test user se nahi. Wayne e solution tenant ka owner user theek karo. |
| B16 Console error "Expected publishable key…" + 10–12 sec sign-in + receptionist-only client ko Outbound menu | WayneRing frontend | Stripe publishable key env set karo. Sign-in slow kyun hai, ye `/sso` timing dekh ke pata karo. Plan ke hisaab se Outbound menu chhupao. |
| G1 GMB SSO bich-bich mein 500 | `gmbprojectbackend` | `.env` mein `COMPOSE_FILE` set karo taaki containers dono prod compose files se chalein, khali local DB se nahi. |
| G2 Sync 403 / 502 | `gmbprojectbackend` | Server pe ye command chalao: `sudo docker logs --since 5m gmbprojectbackend-api-1 2>&1 \| grep -iE "403\|googleapis\|PERMISSION\|SERVICE_DISABLED\|quota\|reason\|message" \| grep -vE "refresh_token\|access_token" \| tail -20`. Quota 0 aaye → Business Profile API access request karo. SERVICE_DISABLED aaye → Performance API enable karo. "caller does not have permission" aaye → listing ka Owner `wayneesolutions@gmail.com` banao aur profile verify karo. |
| G3 Sync error upar chhupa hai aur sirf "403" bolta hai | GMB frontend | Error Sync button ke paas dikhao, aur batao ki reviews / figures / posts mein se kya fail hua. |
| G4 / G9 Timezone UTC | GMB | Regulars provisioning body mein `business.timezone` pehle se bhejta hai (`America/Toronto` / `Asia/Kolkata`). GMB `/api/hub/provision` mein use save karo. Dropdown mein India + Canada upar rakho. Published time local time mein dikhao. |
| G5 / G6 Services: Edit nahi, pehli baar Add nahi chalta, price chipki | GMB frontend | — |
| G7 Review reply 404 | GMB | Server log mein reply request ka URL dekho. Review purane connect se aaya hai, ho sakta hai location path badal gaya ho. Reviews ko naye location path se dobara sync karo. |

---

## 6. Faisle jo Pankaj se confirm karne hain

- **B9:** Growth AI sirf GROWTH / PRO aur Answer + Return / Grow pe. Agar Starter ko bhi dena hai to `lib/growth/access.ts` mein ek line badlo.
- **"wayne e solution" paid until 2027-11-13 (1 saal):** jaan-boojh ke kiya tha ya 30 din hona chahiye tha? Galti thi to Bundles → Activate se theek kar do.
- **India bundle prices** (₹4,999 / ₹7,999 / ₹17,999) abhi draft hain.
- **`WHATSAPP_OWNER_ANY_COUNTRY`:** Canada owners ko shared Indian WhatsApp number se brief bhejna theek hai? (Default: haan.)
