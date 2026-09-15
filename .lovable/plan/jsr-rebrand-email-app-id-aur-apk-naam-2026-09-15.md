# JSR rebrand: email, app ID aur APK naam

## 1. Email sab jagah JSR ka

Purane emails hatakar `jsrcoachinginstitute@gmail.com`:

- Footer ka contact email
- Privacy page ka support email
- Account delete page ka error message
- Admin login aur register form ke placeholder
- Mentors list ke 4 emails (naam/phone abhi purane hi rahenge — jab aap JSR ke asli mentors bhejenge tab update kar denge)

## 2. App ID badalna: `com.sadguru.classes` -> `com.jsrcoaching.app`

Jahan-jahan badlega:

- Capacitor config (appId + appName "JSR COACHING")
- Android build file (namespace + applicationId)
- Android app ka naam aur package string
- App ka apna link scheme (deep links)
- Push notification aur crash-report me jaane wala app naam
- Local log/crash scripts

**Zaroori warning:** app ID badalne ka matlab Android ke liye ye ek bilkul naya app hai.
- Jin students ke phone me purana app hai, unhe update nahi milega — naya APK alag se install karna hoga.
- Purana app phone me alag icon ke roop me rahega; usse manually hatana hoga.
- Purane app ke deep links (payment wapas aana etc.) naye app me hi kaam karenge, purane me nahi.
- Agar app kabhi Play Store par publish ho chuka hai, to Play Store par ID nahi badal sakti — wahan naya listing banana padega.

## 3. Workflow aur APK file ka naam

- Build workflow ka naam: "Sadguru Coaching Classes" -> "JSR COACHING"
- APK file: `SadguruCoachingClasses-<version>.apk` -> `JSRCoaching-<version>.apk`
- Fixed download file: `Sadguruclasses.apk` -> `JSRCoaching.apk`
- AAB file, artifact names aur release title bhi JSR ke hisaab se
- App install page (Install screen) naye APK file naam ko dhoondhega, saath me purane naam ka fallback bhi rahega taki abhi ke release bhi chalte rahen
- Test workflow me package check bhi naye ID par

GitHub repo ka naam wahi (`MrAnujBabu/Sadguruclasses`) rahega — download link nahi tootega.

## 4. Jo nahi chhedenge

- Database table, column aur storage bucket ke naam
- Feature flag ki internal key (`sadguru_agent_enabled`) — screen par dikhne wala label pehle se "JSR Agent" hai
- Purane audit/changelog documents aur purani database migration files
- Deep link website host (`sadguruclasses.vercel.app`) — ye abhi live domain hai; naya domain milte hi badal denge

## Verify

- Typecheck + build clean
- Test suite (deep link aur install page tests) update karke green
- Phone view me landing page, footer email aur install page check
